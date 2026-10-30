// The close-pass hint on Shoot's keyframe picker (S1's closePassSuggestion, wired at the join): the locked take's clay cameras
// (recordPlan, the frames the clay renders) and the 3D performer's ground tracks at each frame's performance time in, the
// grid frame where a figure is largest on screen out, as a suggestion. Free and pure; never picks or spends by itself.
import { closePassSuggestion, type FigureTrack } from '../../../server/hero/closePass'
import type { CameraSample } from '../../labs/controller/take/types'
import { recordPlan } from '../../labs/projection/clay/plan'
import type { PackTiming } from '../../labs/projection/performance/frames'
import type { TakeRecord } from '../../shared/shotContract'
import type { GroundTrack } from '../../stage3d/performer'

/** the name a tag shows under: the Bible's, else 'hero', 'extra 2', '@tag' */
function targetName(tag: string, names?: (tag: string) => string | undefined): string {
  const named = names?.(tag)
  if (named) return named
  if (tag === 'hero') return 'hero'
  const extra = /^extra:(\d+):/.exec(tag)
  if (extra) return `extra ${Number(extra[1]) + 1}`
  return `@${tag.split(':')[1] ?? tag}`
}

export interface ClosePassHint { frame: number; label: string; text: string }

/** The suggested mid keyframe for this take, or null (no performer tracks, a plan that does not replay, nobody close). */
export function closePassHint(rec: TakeRecord, pack: PackTiming | null, tracks: readonly GroundTrack[], names?: (tag: string) => string | undefined): ClosePassHint | null {
  if (!tracks.length) return null
  let plan: ReturnType<typeof recordPlan>
  try { plan = recordPlan(rec, pack) } catch { return null }
  const fps = 24, n = plan.frames.length
  const samples: CameraSample[] = plan.frames.map((f, k) => ({ t: k / fps, position: f.position, quaternion: f.quaternion, focal: f.focal }))
  const timed: FigureTrack[] = tracks.map((tr) => ({
    id: tr.id, label: targetName(tr.id, names), height: tr.height,
    at: (t) => tr.at(plan.frames[Math.min(n - 1, Math.max(0, Math.round(t * fps)))].t),
  }))
  const s = closePassSuggestion(timed, samples, n, fps)
  return s ? { frame: s.frame, label: s.label, text: `${s.label} passes close at f${s.frame}: a mid keyframe helps only if its set matches the opening.` } : null
}
