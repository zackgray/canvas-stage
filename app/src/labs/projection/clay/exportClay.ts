// Export a locked take's clay (free, local): capture every frame's three passes in the page (capture.ts), upload them as they
// are made, then ask the server to shade them (POST /__lab/clay/finish) and follow it until clay.mp4 is written.
// The plan is replanned from the record (plan.ts recordPlan), never from the in-memory take, so the clay is the locked take's.
// A kit world on the set (stage.kit) takes kitExport.ts instead: finished frames rendered here, the server only encodes them.
import type { ClayExport, TakeRecord } from '../../../shared/shotContract'
import type { Stage } from '../engine/Stage'
import type { PackTiming } from '../performance/frames'
import { finishClay, uploadPass, type Fetch } from './api'
import { captureClayFrame, type ClayPasses } from './capture'
import type { KitFrameCapture } from './kitCapture'
import { followClay } from './follow'
import { holdPerformer } from './layerGuard'
import { exportKitClay } from './kitExport'
import { clayCameras, recordPlan } from './plan'

export type ClayProgress =
  | { phase: 'capture'; done: number; total: number }
  | { phase: 'shade'; done: number; total: number }
  /** a kit world's clay: the finished frames are being encoded (ffmpeg, no shading) */
  | { phase: 'encode'; done: number; total: number }

export interface ClayExportDeps {
  fetch?: Fetch
  /** capture one frame (tests stub it; the default renders the stage) */
  capture?: typeof captureClayFrame
  /** wait between status reads */
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  /** stop following after this long (the server keeps going; GET shows the result later) */
  timeoutMs?: number
  /** a kit world's frame capture (tests stub it; the default opens a capture renderer, kitCapture.ts) */
  kitCapture?: () => KitFrameCapture
}

/**
 * Whether the set shows the world the take was locked on (the clay, the opening and the render must all be of that world):
 * a world picked after the lock would be captured into the locked take's clay and opening. Shared by the clay export, the
 * hero opening capture and the lock block's "changed since lock".
 */
export function worldMismatch(rec: Pick<TakeRecord, 'worldId'>, worldId: string): string | null {
  return rec.worldId === worldId ? null : 'This take was filmed on another set: switch back to the set it was filmed on, or lock a new take on this one.'
}

/** Whether the performance the record names is the one on the set (the clay must show the locked performance). */
export function performanceMismatch(rec: TakeRecord, onSet: { id: string } | null): string | null {
  if (rec.packId && onSet?.id !== rec.packId) return 'put the take\'s performance back on the set to export its clay'
  if (!rec.packId && onSet) return 'this take was locked with no performance on the set; take the performance off to export it'
  return null
}

export async function exportClay(
  stage: Stage, rec: TakeRecord, pack: (PackTiming & { id: string }) | null, worldId: string, onProgress: (p: ClayProgress) => void, deps: ClayExportDeps = {},
): Promise<ClayExport> {
  const mismatch = worldMismatch(rec, worldId) ?? performanceMismatch(rec, pack)
  if (mismatch) throw new Error(mismatch)
  if (stage.kit) return exportKitClay(stage, rec, pack, onProgress, deps) // a kit world: finished frames, encoded only
  const f = deps.fetch ?? fetch
  const capture = deps.capture ?? captureClayFrame
  const plan = recordPlan(rec, pack)
  const total = plan.frames.length
  const held = holdPerformer(stage, rec.packId ?? null) // the performer captured: checked every frame, named on the finish
  // a failed upload is held as a value until it is awaited, so it never surfaces as an unhandled rejection mid-capture
  let pending: Promise<Error | null> = Promise.resolve(null)
  const settle = async () => { const e = await pending; if (e) throw e }
  for (const [k, frame] of plan.frames.entries()) {
    onProgress({ phase: 'capture', done: k, total })
    held.check()
    const p: ClayPasses = await capture(stage, frame, plan.poses[k])
    await settle() // one frame's uploads in flight while the next renders
    pending = Promise.all([
      uploadPass(rec.id, frame.i, 'colour', p.colour, f),
      uploadPass(rec.id, frame.i, 'depth', p.depth, f),
      uploadPass(rec.id, frame.i, 'bg', p.bg, f),
    ]).then(() => null, (e: unknown) => (e instanceof Error ? e : new Error(String(e))))
  }
  await settle()
  held.check()
  onProgress({ phase: 'capture', done: total, total })
  return followClay(rec.id, await finishClay(rec.id, clayCameras(plan), undefined, f, undefined, { packId: held.packId }), 'shade', total, onProgress, deps)
}
