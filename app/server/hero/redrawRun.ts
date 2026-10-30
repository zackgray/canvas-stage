/**
 * One paid crop redraw on a still (a face from its card, a piece from its board tile), as a pass CANDIDATE (server/passes):
 *   free refusals first (faceRedraw.ts / propRedraw.ts plan it) -> the candidate 'running' and its mask and 100 % before crop on disk
 *   -> ONE runJob (Klein 4B crop/stitch, redrawGraph.ts); the job id is written onto the candidate the moment Cloud returns it,
 *   before the wait -> the stitched picture pasted onto the still inside the mask only (pasteBack.ts) -> completeCandidate.
 * A failure after the submit keeps the job id (failCandidate): Recover fetches it by id (recoverRedraw), never resubmits. A free
 * refusal (budget, invalid graph) removes the candidate: nothing was billed. One redraw at a time, never beside a hero still,
 * a render or a master draw. The still itself is never touched here; Keep does that (stillApplier.ts).
 */
import { existsSync, writeFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { PassBox, PassCandidate } from '../../src/shared/passContract.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { exclusive, isFreeRefusal, JobError, recoverJob, runJob, type JobRuntime } from '../jobs/index.ts'
import { completeCandidate, createCandidate, failCandidate, passesDirOf, readCandidate, setBeforeCrop, setCandidateJob } from '../passes/store.ts'
import type { PassCtx, PassRecovered } from '../passes/registry.ts'
import { redact } from '../stills/ledger.ts'
import { boundsOf, maskPng, readMaskPng, readPng, type Mask } from './idMask.ts'
import type { KitStill } from './kitSpec.ts'
import { cropOf, pasteInside, pngOf } from './pasteBack.ts'
import { buildRedrawGraph, REDRAW_NODES, type CropOpts } from './redrawGraph.ts'
import { isRedrawLabel, REDRAW_KEY, redrawCredits, redrawLabel, type RedrawPass } from './redrawSpec.ts'
import { HERO_OTHERS, type HeroCtx } from './run.ts'
import { HERO_KEY, isHeroLabel } from './spec.ts'
import { heroDirOf, heroUrl } from './store.ts'

/** what a face or prop plan hands the runner (every free check already passed) */
export interface RedrawPlan {
  take: TakeRecord
  still: KitStill
  pass: RedrawPass
  /** the person's entity or the piece's tag; the candidate's card title */
  subject: string
  /** the 100 % crop the Keep / Discard card shows, in still pixels */
  box: PassBox
  /** where the redraw may change the still (the Klein noise mask, and the only pixels the paste writes) */
  mask: Mask
  refFile: string
  prompt: string
  crop: CropOpts
}

/** how far inside the mask the paste fades in: a face's oval 12 px (E140 blend), a piece 4 px, never more than a sixth of the mask's
 *  own size (a wider feather than the mask would paste nothing) */
export function featherFor(pass: RedrawPass, m: Mask): number {
  const b = boundsOf(m)
  return b ? Math.max(1, Math.min(pass === 'face' ? 12 : 4, Math.floor(Math.min(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) / 6))) : 1
}

export const redrawDirOf = (publicDir: string, takeId: string) => path.join(heroDirOf(publicDir, takeId), 'redraw')
const redrawUrl = (takeId: string, file: string) => heroUrl(takeId, `redraw/${file}`)
const files = (publicDir: string, c: Pick<PassCandidate, 'id' | 'takeId'>) => {
  const dir = redrawDirOf(publicDir, c.takeId)
  return { dir, mask: path.join(dir, `${c.id}-mask.png`), rawName: `${c.id}-raw`, raw: path.join(dir, `${c.id}-raw.png`), after: `${c.id}-after.png`, beforeCrop: `${c.id}-before-crop.png`, afterCrop: `${c.id}-after-crop.png` }
}
/** the still's picture as the redraw read it (stills are never overwritten: Keep makes a new one) */
const stillFileOf = (publicDir: string, c: PassCandidate) => c.target.kind === 'still' ? path.join(heroDirOf(publicDir, c.takeId), `${c.target.stillId}.png`) : ''

/** the sections a redraw never runs beside (409 for a call without a scene job; a scene job waits its turn) */
const OTHERS = [{ key: HERO_KEY, match: isHeroLabel }, ...HERO_OTHERS]

/** the runtime with a hook on the billed call: the job id lands on the candidate before the wait (never throws into the runner) */
function withJobNote(rt: JobRuntime, note: (jobId: string) => Promise<void>): JobRuntime {
  return { ...rt, deps: { ...rt.deps, submit: async (wf) => { const job = await rt.deps.submit(wf); await note(job.id).catch(() => {}); return job } } }
}

export function runRedraw(ctx: HeroCtx, p: RedrawPlan): Promise<PassCandidate> {
  const rt = ctx.deps.runtime()
  const pub = ctx.publicDir
  return exclusive(REDRAW_KEY, `redrawing ${p.subject} on ${p.still.id}`, rt.store, isRedrawLabel, async () => {
    const price = redrawCredits(p.pass)
    const before = readPng(path.join(heroDirOf(pub, p.take.id), `${p.still.id}.png`))
    let c = await createCandidate(pub, { takeId: p.take.id, pass: p.pass, target: { kind: 'still', stillId: p.still.id }, subject: p.subject, box: p.box,
      beforeUrl: heroUrl(p.take.id, `${p.still.id}.png`), costCredits: price }, (ctx.deps.now ?? (() => new Date()))())
    const f = files(pub, c)
    await mkdir(f.dir, { recursive: true })
    await writeFile(f.mask, maskPng(p.mask))
    await writeFile(path.join(f.dir, f.beforeCrop), pngOf(cropOf(before, p.box)))
    c = await setBeforeCrop(pub, c, redrawUrl(c.takeId, f.beforeCrop))
    const seed = (ctx.deps.seed ?? (() => Math.floor(Math.random() * 2 ** 31)))()
    const noted = withJobNote(rt, async (jobId) => { c = await setCandidateJob(pub, c, jobId) })
    let raw: string
    try {
      const r = await runJob(noted, {
        graph: buildRedrawGraph(p.prompt, seed, p.crop, `canvas-stage/${p.take.id}-${p.pass}`), label: redrawLabel(p.take.id, c.id), estimateCredits: price,
        outputs: { [REDRAW_NODES.save]: { dir: f.dir, name: f.rawName } },
        binds: [[REDRAW_NODES.still, 'image', path.join(heroDirOf(pub, p.take.id), `${p.still.id}.png`)], [REDRAW_NODES.mask, 'image', f.mask], [REDRAW_NODES.ref, 'image', p.refFile]],
        note: `${p.take.id} ${p.pass} redraw of ${p.subject} on ${p.still.id} seed ${seed} (${price} cr estimated)`, timeoutMs: 10 * 60_000,
      })
      c = { ...c, jobId: r.jobId, costCredits: r.costCredits ?? price }
      raw = r.saved.find((s) => s.endsWith('.png')) ?? f.raw
    } catch (e) {
      if (isFreeRefusal(e)) { await rm(path.join(passesDirOf(pub, c.takeId), `${c.id}.json`), { force: true }); throw e } // nothing billed: no candidate
      const jobId = e instanceof JobError ? e.jobId ?? c.jobId : c.jobId
      await failCandidate(pub, { ...c, jobId }, redact(e instanceof Error ? e.message : String(e)))
      throw e
    }
    try { return await completeCandidate(pub, c, finishRedraw(pub, c, raw)) } catch (e) {
      await failCandidate(pub, c, `The redraw was paid for and downloaded, but pasting it failed: ${redact(e instanceof Error ? e.message : String(e))}. Recover finishes it again for free.`)
      throw e
    }
  }, OTHERS)
}

/** the stitched picture pasted onto the still inside the mask only, and the after crop; free, re-runnable */
export function finishRedraw(publicDir: string, c: PassCandidate, rawFile: string): PassRecovered {
  const f = files(publicDir, c)
  const mask = readMaskPng(f.mask)
  const pasted = pasteInside(readPng(stillFileOf(publicDir, c)), readPng(rawFile), mask, featherFor(c.pass as RedrawPass, mask))
  writeFileSync(path.join(f.dir, f.after), pngOf(pasted))
  writeFileSync(path.join(f.dir, f.afterCrop), pngOf(cropOf(pasted, c.box)))
  return { afterUrl: redrawUrl(c.takeId, f.after), beforeCropUrl: c.beforeCropUrl, afterCropUrl: redrawUrl(c.takeId, f.afterCrop), costCredits: c.costCredits }
}

/** Recover (POST /__lab/passes/recover): the candidate's EXISTING job fetched by id and finished; never submits */
export function recoverRedraw(ctx: HeroCtx) {
  return async (c: PassCandidate, _p: PassCtx): Promise<PassRecovered> => {
    const f = files(ctx.publicDir, c)
    const fresh = await readCandidate(ctx.publicDir, c.takeId, c.id).catch(() => c)
    if (!existsSync(f.raw)) {
      const r = await recoverJob(ctx.deps.runtime(), c.jobId!, { [REDRAW_NODES.save]: { dir: f.dir, name: f.rawName } })
      const cost = r.record?.costCredits
      return finishRedraw(ctx.publicDir, { ...fresh, costCredits: cost ?? fresh.costCredits }, r.saved.find((s) => s.endsWith('.png')) ?? f.raw)
    }
    return finishRedraw(ctx.publicDir, fresh, f.raw) // the job's picture is already here (a paste that failed): finish it again, free
  }
}
