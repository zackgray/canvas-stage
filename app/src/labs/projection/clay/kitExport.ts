// Export a locked take's clay on a kit world (Stage3D, wave 2), free and local: every frame of the record's plan is rendered here
// as the finished clay (kitCapture.ts: true geometry + the 3D performer at the spike's look), uploaded as it is made (kind
// 'final') with its metric depth (kind 'zdepth', kitDepth.ts) when the capture gives one, then the server encodes them with
// ffmpeg alone (server/clay/kit.ts) and this follows it until clay.mp4 is written.
// The cameras are the panorama path's (plan.ts recordPlan), so both paths frame a take identically. (recipe wave) When the set has
// generated pieces with massing meshes, a massing clay is rendered beside it in the same pass (massingExport.ts).
// (tidy wave) A pipeline, not a loop of waits: each frame is drawn and read back, then its encodes (workers) and uploads run behind
// the next frames' draws, at most IN_FLIGHT frames deep. The server encodes the massing video beside the precise one (the finish
// asks for it), and every phase's time rides on the finish into clay.json (ClayExport.timing).
import { keyframeIndices, type ClayExport, type ClayTiming, type TakeRecord } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import type { PackTiming } from '../performance/frames'
import { finishClay, uploadPass } from './api'
import type { ClayExportDeps, ClayProgress } from './exportClay'
import { followClay } from './follow'
import type { Rgb } from './idPass'
import { grabFrame, openKitCapture } from './kitCapture'
import { setMatchesKey } from '../../../shared/takeSetContract'
import { setKeyOf } from '../../../studio/shoot/setKey'
import { holdPerformer, holdSet } from './layerGuard'
import { clayCameras, recordPlan } from './plan'
import { hasMassing, massingFrame, uploadMassing } from './massingExport'

/** the clay frames that get an ID pass: the keyframes' (first, the 8-grid mid a mid still is drawn on, last), as the server reads them */
export const idKeyframes = keyframeIndices

/** frames whose encodes and uploads may still be running behind the draw (each holds ~16 MB of read-back until it is encoded) */
export const IN_FLIGHT = 3

const now = () => performance.now()
const toError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))
/** a step's failure held as a value until it is awaited (no unhandled rejection mid-capture) */
const held = (p: Promise<unknown>): Promise<Error | null> => p.then(() => null, toError)
const warnMassing = (why: string) => console.warn(`the massing clay was not made (the precise clay is): ${why}`)

/** The caller checked the set shows the take's world and performance. */
export async function exportKitClay(stage: Stage, rec: TakeRecord, pack: PackTiming | null, onProgress: (p: ClayProgress) => void, deps: ClayExportDeps = {}): Promise<ClayExport> {
  const f = deps.fetch ?? fetch
  const plan = recordPlan(rec, pack)
  const total = plan.frames.length
  // generated set pieces load behind the world's ready (glbPiece.ts): a frame drawn before them would be a set without them
  await stage.kit?.ready
  // the performer on the set as the capture starts: a walk switched or rebuilt before any frame (or between two) stops it
  const performer = holdPerformer(stage, rec.packId ?? null)
  // and the set: a take holding its own set must be on it; any set switched, edited or rebuilt before a frame stops it
  const set = holdSet(stage, setKeyOf, setMatchesKey(rec.set, rec.setKey) ? rec.setKey : undefined)
  const massing = hasMassing(stage)
  const cap = (deps.kitCapture ?? openKitCapture)()
  const idFrames = new Set(idKeyframes(total))
  const idColors: Record<string, Rgb> = {}
  let idSeen = false
  const clock = { uploadMs: 0, waitMs: 0, massingFrames: 0 }
  const upload = async (p: Promise<void>) => { const t0 = now(); try { await p } finally { clock.uploadMs += now() - t0 } }
  // the massing clay's chain is its own: a failure there is reported, never the precise clay's failure
  const chain: Promise<Error | null>[] = [], mChain: Promise<Error | null>[] = []
  let mError: Error | null = null
  const drain = async (depth: number) => {
    const t0 = now()
    try {
      while (mChain.length > depth) { const e = await mChain.shift()!; mError ??= e } // shift first: ??= skips its right side once set
      while (chain.length > depth) { const e = await chain.shift()!; if (e) throw e }
    } finally { clock.waitMs += now() - t0 }
  }
  const start = now()
  try {
    for (const [k, frame] of plan.frames.entries()) {
      onProgress({ phase: 'capture', done: k, total })
      performer.check(); set.check()
      const g = await grabFrame(cap, stage, frame, plan.poses[k])
      // the ID pass at the keyframes only; a scene with no entities uploads none (the clay finishes without it)
      const idP = cap.idFrame && idFrames.has(frame.i) ? cap.idFrame(stage, frame, plan.poses[k]) : null
      idP?.catch(() => {})
      chain.push(held((async () => {
        await upload(uploadPass(rec.id, frame.i, 'final', await g.png, f))
        if (g.z) await upload(uploadPass(rec.id, frame.i, 'zdepth', await g.z, f))
        const id = idP && await idP
        if (id) { Object.assign(idColors, id.colors); idSeen ||= Object.keys(id.colors).length > 0 }
        if (id && Object.keys(id.colors).length) await upload(uploadPass(rec.id, frame.i, 'id', id.png, f))
      })()))
      if (massing && !mError) {
        const m = await massingFrame(cap, stage, frame, plan.poses[k])
        clock.massingFrames++
        mChain.push(held((async () => {
          await upload(uploadMassing(rec.id, frame.i, 'final', await m.png, f))
          if (m.z) await upload(uploadMassing(rec.id, frame.i, 'zdepth', await m.z, f))
        })()))
      }
      await drain(IN_FLIGHT)
    }
    await drain(0)
    performer.check(); set.check()
  } finally { cap.dispose() }
  onProgress({ phase: 'capture', done: total, total })
  const mFailed = mError as Error | null // set inside drain: the compiler cannot see it
  if (mFailed) warnMassing(mFailed.message)
  const timing: ClayTiming = { frames: total, ...cap.timing?.(), ...clock, captureMs: now() - start }
  const first = await finishClay(rec.id, clayCameras(plan), undefined, f, idSeen ? idColors : undefined, { timing, massing: massing && !mFailed, packId: performer.packId, setKey: set.setKey })
  const done = await followClay(rec.id, first, 'encode', total, onProgress, deps)
  if (done.timing?.massingError) warnMassing(done.timing.massingError)
  return done
}
