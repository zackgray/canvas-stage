import { midFrame } from '../../shared/keyframeContract'
import { shotPaths, type ClayExport, type TakeRecord } from '../../shared/shotContract'
import type { LightboxItem } from '../ui'

/**
 * The clay's own picture of a keyframe (the clay export writes frame 0, the middle and the last as PNGs beside clay.mp4), for the
 * lightbox's Compare: the still against the 3D set frame it was drawn on. Null for any other frame, or with no finished clay.
 */
export function clayFrameItem(take: Pick<TakeRecord, 'id' | 'frames' | 'startKey'>, clay: ClayExport | null | undefined, frame: number): LightboxItem | undefined {
  if (!clay || clay.status !== 'done' || clay.startKey !== take.startKey) return undefined
  const name = frame === 0 ? 'clay-f0.png' : frame === take.frames - 1 ? 'clay-last.png' : frame === midFrame(take.frames) ? 'clay-mid.png' : null
  if (!name) return undefined
  return { src: `/${shotPaths(take.id).clay}/${name}?v=${encodeURIComponent(clay.finishedAt ?? clay.startKey)}`, label: `the 3D set frame (f${frame})` }
}
