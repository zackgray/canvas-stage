/**
 * The face detail pass on a finished render (recipe step 6, E143 arm s), one person per press. Order, every refusal free and first:
 * the render is finished, the person is staged and fixable (facePeople.ts), one face pass at a time and never beside a render
 * (409), the head track holds (YuNet on >= 90 % of frames) and the window is cut (faceTrack.ts, local Python); then the CANDIDATE
 * (server/passes, 'running', the price) is written, then ONE runJob (facePassGraph.ts: Klein face window + window L2R). The job id
 * is put on the candidate as soon as the runner has it, so a reload recovers it by id and never resubmits. Then, free and local:
 * the paste into every frame, the render's own finish (finish.ts finishChain with its recorded grade), the 100 % crops, and
 * the candidate completes. Keep is faceApply.ts (it brings the after up to date if the source or the switches moved meanwhile).
 * The POST answers once the job id is known (or with the refusal).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { PassCandidate } from '../../src/shared/passContract.ts'
import type { L2RRender } from '../../src/shared/shotContract.ts'
import { exclusive, isFreeRefusal, JobError, recoverJob, runJob, type JobRuntime } from '../jobs/index.ts'
import type { PassRecovered } from '../passes/registry.ts'
import { completeCandidate, createCandidate, failCandidate, setCandidateJob } from '../passes/store.ts'
import { redact } from '../stills/ledger.ts'
import { readTake } from '../takes/store.ts'
import { passFiles } from './faceApply.ts'
// the two prompts (prompt wave): the beat at face scale, the light exactly as image 1 has it, no stock expression
import { faceCue, facePrompt, windowPrompt, type FaceCue } from './facePrompts.ts'
import { bibleOf } from './keyframes.ts'
import { FACE_NODES, facePassBinds, facePassGraph } from './facePassGraph.ts'
import { facePeople, type FacePerson } from './facePeople.ts'
import { FACE_KEY, FACE_SEED, faceLabel, facePassCredits, faceUrl, isFaceLabel } from './faceSpec.ts'
import { py, sourceOf, trackFace, windowBox, windowFace, type FaceCtx } from './faceTrack.ts'
import { finishChain, finishKeyOf, recordedFinish } from './finish.ts'
import { l2rLora, loraRefusal } from './graphLora.ts'
import { sdkTargetsCloud } from '../comfy/index.ts'
import { httpError, isL2RLabel, L2R_KEY, shotDirs } from './spec.ts'
import { findRender } from './store.ts'

export interface FacePassCtx extends FaceCtx { people?: typeof facePeople; jobPollMs?: number; answerMs?: number }

/** the passes running in this process, each with how it ends (a reload's GET must not call them interrupted; Recover waits on it) */
const KEY = Symbol.for('canvas-stage.l2r.facePass')
const active = (): Map<string, Promise<PassCandidate>> => ((globalThis as Record<symbol, Map<string, Promise<PassCandidate>> | undefined>)[KEY] ??= new Map())
export const isActive = (passId: string) => active().has(passId)

const fileOf = (publicDir: string, url: string) => path.join(publicDir, ...url.replace(/^\/+/, '').split('?')[0].split('/'))

export async function startFacePass(ctx: FacePassCtx, renderId: string, subject: string): Promise<PassCandidate> {
  const { publicDir } = ctx.l2r
  const r = findRender(publicDir, renderId)
  if (!r) throw httpError(404, `no render ${renderId}`, 'not_found')
  if (r.status !== 'done' || !r.finished || !r.frames) throw httpError(409, 'Finish the render first: the face pass works on a finished render.', 'not_finished')
  const take = readTake(publicDir, r.takeId)
  if (!take) throw httpError(404, 'that render\'s take is not on disk', 'not_found')
  const p = (await (ctx.people ?? facePeople)(publicDir, take)).find((x) => x.subject === subject)
  if (!p) throw httpError(404, `${subject} is not staged in this take`, 'not_found')
  if (p.why || !p.faceFile) throw httpError(409, p.why ?? 'no card face', 'not_fixable')
  const rt = ctx.l2r.deps.runtime()
  let answer!: (c: PassCandidate) => void
  const answered = new Promise<PassCandidate>((res) => { answer = res })
  const cue = faceCue(bibleOf(publicDir, take.worldId), p.cardId)
  const work = exclusive(FACE_KEY, `a face pass of ${p.name}`, rt.store, isFaceLabel, () => run(ctx, rt, r, p, cue, answer), [{ key: L2R_KEY, match: isL2RLabel }])
  work.catch(() => { /* recorded on the candidate; a refusal before it is the POST's answer */ })
  return Promise.race([answered, work])
}

async function run(ctx: FacePassCtx, rt: JobRuntime, r: L2RRender, p: FacePerson, cue: FaceCue | null, answer: (c: PassCandidate) => void): Promise<PassCandidate> {
  const { publicDir } = ctx.l2r
  const track = await trackFace(ctx, r, p)
  if (!track.ok) throw httpError(409, `The face cannot be followed through this render: ${track.why ?? 'the track failed'}.`, 'no_track')
  const prep = await windowFace(ctx, r, p)
  const noLora = loraRefusal(await rt.info.get().catch(() => ({})), l2rLora(), sdkTargetsCloud())
  if (noLora) throw httpError(409, noLora, 'no_lora')
  const est = facePassCredits(r.frames!)
  const source = sourceOf(ctx, r)
  let c = await createCandidate(publicDir, { takeId: r.takeId, pass: 'facePass', target: { kind: 'render', renderId: r.id }, subject: p.subject, box: windowBox(prep.dir),
    beforeUrl: r.finished!, jobId: null, costCredits: est })
  let ended!: (c: PassCandidate) => void
  active().set(c.id, new Promise((res) => { ended = res }))
  const f = passFiles(publicDir, r.takeId, r.id, c.id)
  mkdirSync(f.dir, { recursive: true })
  // the pass's own copy of what it was cut from, so a recovery after another person's Keep pastes onto the right picture
  for (const n of ['track.json', 'window.json', 'win-raw.mp4']) copyFileSync(path.join(prep.dir, n), path.join(f.dir, n))
  copyFileSync(source, f.source)
  // the source's name as the render's state names it: Keep re-pastes onto the current source if another face was kept meanwhile
  writeFileSync(f.sourceKey, path.relative(shotDirs(publicDir, r.takeId).l2r, source).split(path.sep).join('/'))
  const label = faceLabel(r.takeId, r.id, c.id)
  const timer = setTimeout(() => answer(c), ctx.answerMs ?? 20_000) // a long queue: answer with the running candidate anyway
  // every write of this candidate goes through one chain: two writers of one file at once fail on Windows (rename EPERM)
  let writes: Promise<unknown> = Promise.resolve()
  const write = (fn: () => Promise<PassCandidate>): Promise<PassCandidate> => { const n = writes.then(fn).then((x) => (c = x)); writes = n.catch(() => {}); return n }
  const poll = setInterval(() => {
    const id = rt.store.list().find((j) => j.label === label)?.jobId
    if (id) { clearInterval(poll); void write(() => setCandidateJob(publicDir, c, id)).then(answer, () => {}) }
  }, ctx.jobPollMs ?? 250)
  try {
    const graph = facePassGraph({ prompt: windowPrompt(p.description, cue), facePrompt: facePrompt(p.description, cue), seed: FACE_SEED, kleinSeed: (r.seed ?? 42) + 3, frames: r.frames!, prefix: `canvas-stage/${c.id}` })
    let res
    try {
      res = await runJob(rt, { graph, label, estimateCredits: est, allowModels: [l2rLora()], timeoutMs: 30 * 60_000,
        outputs: { [FACE_NODES.save]: { dir: f.dir, name: 'win' }, [FACE_NODES.face]: { dir: f.dir, name: 'face-win' } },
        binds: facePassBinds({ win: prep.win, still: prep.still, mask: prep.mask, card: p.faceFile! }),
        note: `${r.takeId} ${r.id} face pass of ${p.subject} (${p.name}) -> ${c.id} (${est} cr estimated)` })
    } catch (e) {
      clearInterval(poll)
      const jobId = e instanceof JobError ? e.jobId : undefined
      if (jobId) await write(() => setCandidateJob(publicDir, c, jobId))
      const msg = isFreeRefusal(e) ? `Not sent: ${e.message} Nothing was spent.` : e instanceof Error ? e.message : String(e)
      await write(() => failCandidate(publicDir, c, redact(msg)))
      if (!isFreeRefusal(e)) answer(c) // billed: the candidate is the answer (Recover by id); a free refusal answers as itself (429, 400…)
      throw e
    }
    clearInterval(poll)
    answer(await write(() => setCandidateJob(publicDir, c, res.jobId)))
    let after: PassRecovered
    try { after = await afterOf(ctx, c) } catch (e) {
      return write(() => failCandidate(publicDir, c, redact(`the job ${res.jobId} came back, but ${e instanceof Error ? e.message : String(e)} (Recover re-fetches it by id and tries the paste again; nothing is resubmitted)`)))
    }
    return write(() => completeCandidate(publicDir, c, { ...after, costCredits: res.costCredits ?? est }))
  } finally {
    clearTimeout(timer); clearInterval(poll)
    await writes; active().delete(c.id); ended(c)
  }
}

/** free and local, from the pass's own files: paste into every frame, finish as the render finishes, cut the 100 % crops */
export async function afterOf(ctx: FaceCtx, c: PassCandidate): Promise<PassRecovered> {
  const { publicDir } = ctx.l2r
  if (c.target.kind !== 'render') throw httpError(400, 'not a render pass', 'bad_request')
  const r = findRender(publicDir, c.target.renderId)
  if (!r?.frames) throw httpError(404, 'the render this pass was made on is gone', 'not_found')
  const f = passFiles(publicDir, r.takeId, r.id, c.id)
  const win = readdirSync(f.dir).find((n) => /^win(-\d+)?\.(mp4|webm|mov)$/.test(n))
  if (!win) throw httpError(422, 'the window render did not land in the pass folder', 'bad_output')
  await py(ctx, 'face_paste.py', 'paste', { raw: f.source, win: path.join(f.dir, win), dir: f.dir, afterRaw: f.afterRaw }, path.join(f.dir, 'paste-plan.json'))
  await finishChain(ctx.l2r, recordedFinish(ctx.l2r, r), f.afterRaw, f.after, path.join(f.dir, 'after'), { run: ctx.run })
  writeFileSync(f.finishKey, finishKeyOf(r)) // the switches it was finished with: Keep finishes it again if they changed since
  const got = await ctx.l2r.deps.probe(f.after)
  if (got.frames !== r.frames) throw httpError(500, `the face-passed video has ${got.frames} frames, the render ${r.frames}`, 'face_failed')
  await py(ctx, 'face_paste.py', 'crops', { dir: f.dir, before: fileOf(publicDir, c.beforeUrl), after: f.after, beforeCrop: f.beforeCrop, afterCrop: f.afterCrop }, path.join(f.dir, 'crops-plan.json'))
  for (const x of [f.beforeCrop, f.afterCrop]) if (!existsSync(x)) throw httpError(500, `the crops step did not write ${path.basename(x)}`, 'face_failed')
  const url = (n: string) => faceUrl(r.takeId, r.id, c.id, n)
  return { afterUrl: url('after.mp4'), beforeCropUrl: url('before-crop.png'), afterCropUrl: url('after-crop.png') }
}

/** the 'facePass' recoverer: the EXISTING job fetched by id (recoverJob never submits), then the free local steps again */
export async function recoverFacePass(ctx: FaceCtx, c: PassCandidate): Promise<PassRecovered> {
  if (!c.jobId) throw httpError(409, 'this pass has no job id to recover; run it again', 'no_job')
  // still waited on by this server: wait for that instead (a second paste beside it would write the same files)
  const here = active().get(c.id)
  if (here) {
    const end = await here
    if (end.state !== 'candidate' || !end.afterUrl) throw httpError(409, end.error ?? `the pass ended ${end.state}`, 'face_failed')
    return { afterUrl: end.afterUrl, beforeCropUrl: end.beforeCropUrl, afterCropUrl: end.afterCropUrl, costCredits: end.costCredits }
  }
  const rt = ctx.l2r.deps.runtime()
  const rec = await recoverJob(rt, c.jobId)
  return { ...(await afterOf(ctx, c)), costCredits: rec.record?.costCredits ?? c.costCredits }
}

