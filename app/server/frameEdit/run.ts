/**
 * One "Edit this frame" press: the plain Qwen-Image-Edit job on one version of the take's first frame, through the shared runner
 * (server/jobs). The new picture is a NEW hero still — an unapproved version beside the one it started from, never an overwrite —
 * so every version stays on disk in the take's hero folder (listStills reads them all; approval, Render's guard, Recover and the
 * running pill are the hero section's own, shared unchanged). Order, all free refusals first: the take and the base still are on
 * disk and fresh, the prompt parses — then the INTENT is written — then ONE runJob, under the hero section's exclusive key, so an
 * edit never runs beside a draw or another edit. A free refusal (budget, invalid graph, no target) removes its intent; a billed
 * failure keeps it for Recover by job id.
 */
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { HeroStill } from '../../src/shared/shotContract.ts'
import { exclusive, isFreeRefusal, runJob, type JobRuntime } from '../jobs/index.ts'
import { HERO_KEY, heroLabel, isHeroLabel } from '../hero/spec.ts'
import { HERO_OTHERS } from '../hero/run.ts'
import { heroDirOf, heroUrl, intentFile, listStills, readTake, stillFile, stillIdOf, takeIdOf, writeJson, HeroHttpError } from '../hero/store.ts'
import { FRAME_EDIT_CREDITS, MAX_FRAME_EDIT_PROMPT, type FrameEditRequest } from './spec.ts'
import { buildFrameEditGraph, frameEditSaveNode, FRAME_EDIT_IMAGE_NODE } from './graph.ts'

export interface FrameEditDeps { runtime: () => JobRuntime; seed?: () => number; now?: () => Date }
export interface FrameEditCtx { publicDir: string; deps: FrameEditDeps }
export type ParsedFrameEdit = Required<Pick<FrameEditRequest, 'takeId' | 'stillId' | 'prompt'>> & Pick<FrameEditRequest, 'seed'>

export function parseFrameEditRequest(body: unknown): ParsedFrameEdit {
  if (!body || typeof body !== 'object') throw new HeroHttpError(400, 'body must be a JSON object', 'bad_request')
  const b = body as Record<string, unknown>
  const takeId = takeIdOf(b.takeId)
  const stillId = stillIdOf(b.stillId)
  if (typeof b.prompt !== 'string' || !b.prompt.trim()) throw new HeroHttpError(400, 'say the one change as a sentence (for example "remove the hat brim" or "add fog")', 'bad_request')
  if (b.prompt.length > MAX_FRAME_EDIT_PROMPT) throw new HeroHttpError(400, `the change must be at most ${MAX_FRAME_EDIT_PROMPT} characters: one change per edit`, 'bad_request')
  if (b.seed !== undefined && !(Number.isInteger(b.seed) && (b.seed as number) >= 0 && (b.seed as number) < 2 ** 32)) throw new HeroHttpError(400, 'seed must be a non-negative integer', 'bad_request')
  return { takeId, stillId, prompt: b.prompt.trim(), seed: b.seed as number | undefined }
}

const stampOf = (d: Date) => d.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')

/** what the base was drawn as and against travels with its edit: the keyframe, the cast card and the scene sheet's keys. Without
 *  them a version made in a scene with a sheet read stale at once (no keys = "drawn before the sheet") and could never be used, and
 *  a recast or a sheet change never staled it. The base's set stamp (setKey) travels too: an edit is on the set its base was drawn on. */
const KEPT = ['role', 'frame', 'castId', 'bibleVersion', 'bibleKeys', 'setKey'] as const
export const keptOf = (base: HeroStill): Record<string, unknown> =>
  Object.fromEntries(KEPT.map((k) => [k, (base as unknown as Record<string, unknown>)[k]]).filter(([, v]) => v !== undefined))

/** the press's still id (never an existing file's) */
function newStillId(dir: string, now: Date): string {
  let id = `hero-${stampOf(now)}-e1`
  for (let k = 2; [`${id}.png`, `${id}.json`, `intent-${id}.json`].some((f) => existsSync(path.join(dir, f))); k++) id = `hero-${stampOf(now)}-e1-${k}`
  return stillIdOf(id)
}

export async function runFrameEdit(ctx: FrameEditCtx, req: ParsedFrameEdit): Promise<{ still: HeroStill }> {
  const rt = ctx.deps.runtime()
  return exclusive(HERO_KEY, `an edit of a frame of ${req.takeId}`, rt.store, isHeroLabel, async () => {
    const take = await readTake(ctx.publicDir, req.takeId)
    const now = (ctx.deps.now ?? (() => new Date()))()
    const dir = heroDirOf(ctx.publicDir, take.id)
    const all = await listStills(ctx.publicDir, take.id, rt.store)
    const base = all.find((s) => s.id === req.stillId)
    if (!base) throw new HeroHttpError(404, `${req.stillId} is not a still of ${take.id}`, 'not_found')
    if (base.startKey !== take.startKey) throw new HeroHttpError(409, 'that still shows an older start of the take (the camera or performance frame changed): draw the frame again', 'stale')
    const basePng = path.join(dir, `${base.id}.png`)
    if (!existsSync(basePng)) throw new HeroHttpError(404, `${req.stillId} has no picture on disk`, 'not_found')

    const seed = req.seed ?? (ctx.deps.seed ?? (() => Math.floor(Math.random() * 2 ** 31)))()
    const id = newStillId(dir, now)
    // the version the render's guard and the strip read: unapproved, the take's current start, its provenance kept (prompt, editOf,
    // and the base's keyframe, cast and sheet keys, so it goes stale exactly when the base would)
    const intent: HeroStill & { prompt: string; editOf: string } = {
      ...keptOf(base), id, takeId: take.id, startKey: take.startKey, png: heroUrl(take.id, `${id}.png`), seed, jobId: null, credits: 0, approved: false,
      createdAt: now.toISOString(), prompt: req.prompt, editOf: base.id,
    }
    await writeJson(intentFile(dir, id), intent) // before the spend: a job recovered by id can always be put back

    const r = await runJob(rt, {
      graph: buildFrameEditGraph({ prompt: req.prompt, seed, prefix: `canvas-stage/${take.id}` }),
      label: heroLabel(take.id, [id]), estimateCredits: FRAME_EDIT_CREDITS,
      outputs: { [frameEditSaveNode(seed)]: { dir, name: id } },
      binds: [[FRAME_EDIT_IMAGE_NODE, 'image', basePng]],
      note: `${take.id} frame edit of ${base.id}: "${req.prompt.slice(0, 80)}" (${FRAME_EDIT_CREDITS} cr estimated)`, timeoutMs: 15 * 60_000,
    }).catch(async (e: unknown) => {
      // a free refusal spent nothing: its intent is not a paid edit's and goes
      if (isFreeRefusal(e)) await rm(intentFile(dir, id), { force: true })
      throw e
    })

    if (!existsSync(path.join(dir, `${id}.png`))) throw new HeroHttpError(422, `job ${r.jobId} succeeded but ${id} did not land; look it up by id, do not resubmit.`, 'bad_output')
    const still: HeroStill = { ...intent, jobId: r.jobId, credits: r.costCredits ?? 0 }
    await writeJson(stillFile(dir, id), still) // LAST: its existence is what makes the still exist
    return { still }
  }, HERO_OTHERS)
}
