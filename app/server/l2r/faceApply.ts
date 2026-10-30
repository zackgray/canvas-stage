/**
 * Keep for a render target (server/passes registerApplier('render')): the face-passed, finished MP4 becomes the render's finished
 * cut. The earlier cut stays on disk: the canonical <id>-finished.mp4 is copied aside first (Finish again rewrites that name), and
 * its URL is the candidate's replacedUrl. The pass's pasted raw becomes the render's finish source (faceSource.ts), so a later free
 * Finish again re-finishes the face-passed picture and the next person's pass pastes onto it. Refused while that render finishes.
 *
 * What a face pass changes is the finish SOURCE, not the graded cut, so a free Finish again between Fix and Keep never invalidates a
 * paid candidate: Keep brings it up to date instead, free and local. Switches changed since its after was finished (grade) ->
 * the after is finished again with the render's current switches. Another person's pass kept meanwhile (the source moved on) -> this
 * pass's generated window is pasted again onto the CURRENT source (the paste is free; only the window was paid), then finished. So two
 * waiting candidates on one render are both keepable, in either order, and each Keep keeps every earlier kept face.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { PassCandidate, PassTarget } from '../../src/shared/passContract.ts'
import type { L2RRender } from '../../src/shared/shotContract.ts'
import { HeroHttpError } from '../hero/store.ts'
import type { PassApplier, PassCtx } from '../passes/registry.ts'
import { afterOf } from './facePass.ts'
import { finishing, finishKeyOf, holdFinishing } from './finish.ts'
import { faceDirs } from './faceSpec.ts'
import { finishSource, readFaceState, sourceKeyOf, writeFaceState } from './faceSource.ts'
import type { FaceCtx } from './faceTrack.ts'
import { finishedName } from './run.ts'
import { publicUrl, shotDirs } from './spec.ts'
import { findRender, writeRender } from './store.ts'

/** a pass's pasted raw (the finish source once kept) and its finished after; `source` is its own copy of the picture it pastes onto,
 *  `sourceKey` that picture's finish-source name, `finishKey` the switches its after was finished with */
export const passFiles = (publicDir: string, takeId: string, renderId: string, passId: string) => {
  const dir = faceDirs(publicDir, takeId, renderId).pass(passId)
  return { dir, afterRaw: path.join(dir, 'after-raw.mp4'), after: path.join(dir, 'after.mp4'), beforeCrop: path.join(dir, 'before-crop.png'), afterCrop: path.join(dir, 'after-crop.png'),
    source: path.join(dir, 'source.mp4'), sourceKey: path.join(dir, 'source-key.txt'), finishKey: path.join(dir, 'finish-key.json') }
}

const refuse = (status: number, message: string, code: string) => new HeroHttpError(status, message, code)
const text = (f: string) => { try { return readFileSync(f, 'utf8') } catch { return null } }

/** free and local: the pass's after made current against the render as it is now (source and switches) before it is kept */
async function bringUpToDate(ctx: FaceCtx, r: L2RRender, c: PassCandidate): Promise<void> {
  const dir = shotDirs(ctx.l2r.publicDir, r.takeId).l2r
  const f = passFiles(ctx.l2r.publicDir, r.takeId, r.id, c.id)
  const now = sourceKeyOf(dir, r.id)
  const moved = text(f.sourceKey) !== now // another face was kept since this one was cut (or a pass from before the key was recorded)
  if (!moved && text(f.finishKey) === finishKeyOf(r)) return
  rmSync(f.finishKey, { force: true })
  if (moved) copyFileSync(finishSource(dir, r.id), f.source)
  await afterOf(ctx, c) // paste onto its source, finish with the render's current switches, cut the 100 % crops (writes finishKey)
  writeFileSync(f.sourceKey, now)
}

export async function applyFacePass(ctx: FaceCtx, c: PassCandidate): Promise<{ replacedUrl: string }> {
  const publicDir = ctx.l2r.publicDir
  if (c.pass !== 'facePass' || c.target.kind !== 'render') throw refuse(501, `nothing applies a ${c.pass} pass to a render`, 'no_applier')
  const r0 = findRender(publicDir, c.target.renderId)
  if (!r0?.finished) throw refuse(409, 'that render has no finished cut any more', 'target_changed')
  if (finishing().includes(r0.id)) throw refuse(409, 'this render is being finished right now: keep the face once that is done', 'busy')
  const f = passFiles(publicDir, r0.takeId, r0.id, c.id)
  if (!existsSync(f.afterRaw) || !existsSync(f.after)) throw refuse(409, 'the face pass\'s video is not on disk: recover it or run it again', 'no_after')
  return holdFinishing(r0.id, async () => {
    await bringUpToDate(ctx, r0, c)
    const r = findRender(publicDir, r0.id) ?? r0
    const dir = shotDirs(publicDir, r.takeId).l2r
    let replacedUrl = r.finished!
    if (r.finished === publicUrl(r.takeId, 'l2r', finishedName(r.id))) {
      const keep = `${r.id}-finished-before-${c.id}.mp4` // Finish again writes the canonical name: the earlier cut keeps its own
      copyFileSync(path.join(dir, finishedName(r.id)), path.join(dir, keep))
      replacedUrl = publicUrl(r.takeId, 'l2r', keep)
    }
    const prev = readFaceState(dir, r.id)
    writeFaceState(dir, r.id, { source: path.relative(dir, f.afterRaw).split(path.sep).join('/'), kept: [...(prev?.kept ?? []), { passId: c.id, subject: c.subject, at: new Date().toISOString() }] })
    writeRender(publicDir, { ...r, finished: c.afterUrl, finishedAt: new Date().toISOString(), finishError: undefined })
    return { replacedUrl }
  })
}

/**
 * The target check (server/passes keepCandidate compares `current` with beforeUrl): a render pass's target is the render, not its
 * finished file name, because Keep re-pastes and re-finishes onto whatever the render is now. Changed = the render or its finished
 * cut is gone.
 */
export const renderApplier = (ctx: FaceCtx): PassApplier => ({
  current: async (t: PassTarget, p: PassCtx, c: PassCandidate) => (t.kind === 'render' && findRender(p.publicDir, t.renderId)?.finished ? c.beforeUrl : null),
  apply: (c) => applyFacePass(ctx, c),
})
