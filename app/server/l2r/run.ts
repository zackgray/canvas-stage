/**
 * One Layout-To-Render pass through the shared job runner (server/jobs). Order, every refusal free and first: one at a time
 * (exclusive, 409; also while a hero still renders: the two never queue behind each other), the take / clay / approved fresh still (inputs.ts, 404 / 409), the clay video's real frame count equals
 * the take's (a longer clip fails on Cloud after billing), then the INTENT record (<renderId>.json, `running`), then ONE
 * runJob (validate, budget, in-flight, submit, ledger row before the wait). The raw is checked (1920x1088, the take's frames)
 * and the record is rewritten `done`; a raw that came back solid black (blank.ts) is kept but filed `failed` + `blank` with the billed
 * line instead. Recover by id never submits. The finish (finish.ts) runs after, free and local.
 */
import path from 'node:path'
import type { L2RRender } from '../../src/shared/shotContract.ts'
import type { L2RRenderExtra } from '../../src/studio/render/l2rExtra.ts'
import type { VideoFacts } from '../clip/ffmpeg.ts'
import type { L2RDone } from './price.ts'
import { exclusive, isFreeRefusal, JobError, recoverJob, runJob, type JobRuntime } from '../jobs/index.ts'
import { l2rBinds, l2rGraph, L2R_NODES } from './graph.ts'
import { l2rLora, loraRefusal } from './graphLora.ts'
import { sdkTargetsCloud } from '../comfy/index.ts'
import { requireInputs } from './inputs.ts'
import { modelClayVideo } from '../pieces/modelClay.ts'
import { defaultPrompt, sentOverride } from './compose.ts'
import { requireKeyframes } from './keyframes.ts'
import { takeBible } from '../takes/words.ts'
import { resolveGrade, targetFile } from './grade.ts'
import { DEFAULT_SEED, httpError, isL2RLabel, L2R_H, L2R_KEY, L2R_W, l2rEstimate, l2rLabel, labelParts, newRenderId, publicUrl, shotDirs } from './spec.ts'
import { HERO_KEY, isHeroLabel } from '../hero/spec.ts'
import { isMasterLabel, MASTER_KEY } from '../bible/masterDraw.ts'
import { NO_KIT_CAST } from '../hero/castCard.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { allRenders, readRender, removeRender, writeRender } from './store.ts'
import { blankLine } from './blank.ts'

export interface L2RDeps {
  runtime: () => JobRuntime
  probe: (file: string) => Promise<VideoFacts>
  python: () => string | undefined
  now?: () => Date
  /** the black-render guard (blank.ts blankVideo); unset = not checked (tests that fake the download) */
  blank?: (file: string, frames: number) => Promise<boolean>
}
export interface L2RCtx { publicDir: string; appRoot: string; deps: L2RDeps }
export interface L2RRequest extends L2RRenderExtra { takeId: string; stillId: string; seed?: number; prompt?: string
  /** render the take's words now on a first frame drawn from earlier words (inputs.ts `words_changed`); recorded as `wordsDiffer` */
  wordsOnFrame?: boolean }

export const rawName = (id: string) => `${id}-raw`
export const finishedName = (id: string) => `${id}-finished.mp4`

/** the price the button shows (rounded up): the seed curve scaled by this app's own paid renders; `keyed` adds the keyframe surcharge */
export const estimateFor = (publicDir: string, frames: number, keyed = false) => l2rEstimate(frames, paidRenders(publicDir), keyed)

/** this app's measured paid renders (what the price learns from); GET /__lab/l2r/price hands them to Shoot's length-vs-price line */
export const paidRenders = (publicDir: string): L2RDone[] =>
  allRenders(publicDir).filter((r) => r.status === 'done' && !r.creditsEstimated && r.frames).map((r) => ({ frames: r.frames!, credits: r.credits, keyed: !!r.keyframes?.length }))

async function checkRaw(ctx: L2RCtx, r: L2RRender, frames: number): Promise<void> {
  const file = path.join(shotDirs(ctx.publicDir, r.takeId).l2r, `${rawName(r.id)}.mp4`)
  const got = await ctx.deps.probe(file)
  if (got.width !== L2R_W || got.height !== L2R_H || got.frames !== frames) {
    throw httpError(422, `job ${r.jobId} succeeded but its video is ${got.width}x${got.height}, ${got.frames} frames (asked ${L2R_W}x${L2R_H}, ${frames}); kept, not listed as done. Look it up by id, do not resubmit.`, 'bad_output')
  }
  if (await ctx.deps.blank?.(file, frames)) throw Object.assign(httpError(422, blankLine(r.credits), 'black_output'), { blank: true })
}

/** a failed check's record: a black raw is kept and pointed at (so it is never offered for recovery), anything else as before */
const failedRecord = (r: L2RRender, e: unknown): L2RRender => (e as { blank?: boolean }).blank
  ? { ...r, status: 'failed', blank: true, error: (e as Error).message, raw: publicUrl(r.takeId, 'l2r', `${rawName(r.id)}.mp4`) }
  : { ...r, status: 'failed', error: (e as Error).message }

export function renderL2R(ctx: L2RCtx, req: L2RRequest): Promise<L2RRender> {
  const rt = ctx.deps.runtime()
  return exclusive(L2R_KEY, `a Layout-To-Render pass of ${req.takeId}`, rt.store, isL2RLabel, async () => {
    const inp = requireInputs(ctx.publicDir, req.takeId, req.stillId, { override: !!req.prompt?.trim(), wordsOnFrame: req.wordsOnFrame === true })
    // a kit world's prompt names the cast card Perform saved; with none named, refuse (free) rather than describe a guessed person,
    // unless the approved first frame was drawn with no person (hero/nobody.ts, castId null): then the render names no one either
    const kit = takeKitWorldFor(ctx.publicDir, inp.take)
    if (kit && !kit.perf.castId && inp.still.castId !== null) throw Object.assign(httpError(409, NO_KIT_CAST), { code: 'no_cast' })
    // E139 "two clays": the model is shown the massing clay when it is current, else the precise one (recorded as layoutClay)
    const layout = modelClayVideo(ctx.publicDir, inp.take, inp.clayFile)
    const facts = await ctx.deps.probe(layout.file)
    if (facts.frames !== inp.take.frames) {
      throw httpError(409, `The clay video has ${facts.frames} frames but the take has ${inp.take.frames}: ${facts.frames > inp.take.frames ? 'a clip longer than the take fails on Cloud after it has started billing' : 'the last frames would get no layout'}. On the Stage, press Prepare the frames under the locked take (free).`, 'clay_frames')
    }
    // every refusal below is free and comes before the intent record: a stale keyframe, a grade with no master, an @tag the Bible lacks
    const bible = takeBible(ctx.publicDir, inp.take) // the take's own words stand as the prompt (takes/words.ts)
    const keys = requireKeyframes(ctx.publicDir, inp.take, bible, req)
    const grade = resolveGrade(bible, req.grade)
    const hold = req.hold ?? 'closeup' // an API caller that names none gets what a render always had; the screen sends its own default
    if (grade) targetFile(ctx.publicDir, grade.target)
    const prompt = req.prompt?.trim() ? await sentOverride(ctx.publicDir, inp.take, req.prompt) : await defaultPrompt(ctx.publicDir, inp.take)
    const noLora = loraRefusal(await rt.info.get().catch(() => ({})), l2rLora(), sdkTargetsCloud())
    if (noLora) throw httpError(409, noLora, 'no_lora')
    const id = newRenderId(ctx.deps.now?.() ?? new Date())
    const seed = req.seed ?? DEFAULT_SEED
    const frames = inp.take.frames
    const est = estimateFor(ctx.publicDir, frames, keys.length > 0)
    const keyOf = (n: 'mid' | 'end') => keys.find((k) => k.name === n)
    const graph = l2rGraph({ prompt, seed, frames, layoutSize: { w: facts.width, h: facts.height }, prefix: `canvas-stage/${id}`,
      keys: { mid: keyOf('mid') ?? null, end: keyOf('end') ?? null }, hold })
    const base: L2RRender = { id, takeId: inp.take.id, stillId: inp.still.id, clay: layout.url ?? publicUrl(inp.take.id, 'clay', 'clay.mp4'), layoutClay: layout.source,
      raw: null, finished: null, jobId: null, credits: 0, status: 'running', prompt, seed, frames, estimateCredits: est.credits, createdAt: new Date().toISOString(), pid: process.pid,
      ...(keys.length ? { keyframes: keys.map((k) => ({ stillId: k.still.id, role: k.name, frame: k.frame, strength: k.strength })) } : {}), ...(grade ? { grade } : {}),
      hold, ...(inp.wordsDiffer ? { wordsDiffer: true } : {}) }
    writeRender(ctx.publicDir, base) // the intent, before the spend (pid: a restart that loses it before any job reads it as interrupted)

    const dir = shotDirs(ctx.publicDir, inp.take.id).l2r
    let r
    try {
      r = await runJob(rt, { graph, label: l2rLabel(inp.take.id, id), estimateCredits: est.credits, outputs: { [L2R_NODES.save]: { dir, name: rawName(id) } },
        binds: l2rBinds(layout.file, inp.stillFile, { mid: keyOf('mid')?.file, end: keyOf('end')?.file }), allowModels: [l2rLora()], timeoutMs: 40 * 60_000,
        note: `${inp.take.id} ${frames}f still ${inp.still.id}${keys.length ? ` +${keys.map((k) => k.name).join('+')}` : ''} seed ${seed} -> ${id} (${est.credits} cr estimated)` })
    } catch (e) {
      // a free refusal spent nothing: no intent left behind. Anything else is a billed job: keep it with its id, never resubmit.
      if (isFreeRefusal(e)) removeRender(ctx.publicDir, inp.take.id, id)
      else writeRender(ctx.publicDir, { ...base, status: 'failed', jobId: e instanceof JobError ? e.jobId ?? null : null, error: e instanceof Error ? e.message.slice(0, 600) : String(e) })
      throw e
    }
    const done: L2RRender = { ...base, jobId: r.jobId, credits: r.costCredits ?? est.credits, ...(r.costCredits === null ? { creditsEstimated: true } : {}) }
    try { await checkRaw(ctx, done, frames) } catch (e) {
      writeRender(ctx.publicDir, failedRecord(done, e))
      throw e
    }
    return writeRender(ctx.publicDir, { ...done, status: 'done', raw: publicUrl(inp.take.id, 'l2r', `${rawName(id)}.mp4`) })
  }, [{ key: HERO_KEY, match: isHeroLabel }, { key: MASTER_KEY, match: isMasterLabel }]) // m1: never queue silently behind a master draw
}

/** POST /__lab/l2r/recover {jobId}: fetch an existing L2R job by id and file its video. Never submits. */
export async function recoverL2R(ctx: L2RCtx, jobId: string): Promise<L2RRender> {
  const rt = ctx.deps.runtime()
  if (!/^[\w-]{8,64}$/.test(jobId)) throw httpError(400, 'bad job id', 'bad_request')
  const rec = rt.store.byJobId(jobId)
  const parts = rec ? labelParts(rec.label) : null
  if (!rec || !parts) throw httpError(404, `no Layout-To-Render job ${jobId} is recorded here; nothing was submitted`, 'not_found')
  const existing = readRender(ctx.publicDir, parts.takeId, parts.renderId)
  if (existing?.status === 'done' && existing.raw) return existing
  await recoverJob(rt, jobId)
  const base: L2RRender = existing ?? { id: parts.renderId, takeId: parts.takeId, stillId: '', clay: publicUrl(parts.takeId, 'clay', 'clay.mp4'), raw: null, finished: null,
    jobId, credits: rec.estimateCredits, status: 'running' }
  const credits = rec.costCredits ?? base.estimateCredits ?? rec.estimateCredits
  const done: L2RRender = { ...base, jobId, credits, ...(rec.costCredits === null ? { creditsEstimated: true } : { creditsEstimated: undefined }), error: undefined }
  const frames = base.frames ?? (await ctx.deps.probe(path.join(shotDirs(ctx.publicDir, parts.takeId).l2r, `${rawName(parts.renderId)}.mp4`))).frames
  try { await checkRaw(ctx, done, frames) } catch (e) { writeRender(ctx.publicDir, failedRecord(done, e)); throw e }
  return writeRender(ctx.publicDir, { ...done, frames, status: 'done', raw: publicUrl(parts.takeId, 'l2r', `${rawName(parts.renderId)}.mp4`) })
}

