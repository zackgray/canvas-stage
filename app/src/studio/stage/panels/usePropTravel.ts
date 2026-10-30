// The picked piece's travel along a path, ONE logic shared by the prop card's Advanced tab (PropAdvanced.tsx: spots collect
// until Done) and the viewport right-click menu's 'Move to a spot' (StagePanel: one spot saves at once) — do not write a second
// flow. Owns the armed state, the picked spots, the click-by-click preview on the walk overlay (setDraftPiecePaths), and the one
// save through the Set's own piece route (useSetPlace.setMove): the resting place stays the path's start. Nothing here spends.
import { useEffect, useState } from 'react'
import { LIMITS } from '../../../stage3d/planRules'
import type { SetPlaceState } from '../../scene/useSetPlace'
import { setDraftPiecePaths } from '../walkMarks'
import type { Pt } from './blocking/blockingMath'

const r2 = (v: number) => Math.round(v * 100) / 100
const clampSpeed = (v: number) => Math.min(LIMITS.propSpeed[1], Math.max(LIMITS.propSpeed[0], v))

export function usePropTravel(place: SetPlaceState) {
  const [armed, setArmed] = useState(false)
  const [spots, setSpots] = useState<Pt[]>([])
  const item = place.item
  // publish the click-by-click path so the walk overlay draws it before anything is saved (cleared when the tool ends)
  const draftKey = `${armed}:${JSON.stringify(spots)}:${item ? item.at.join(',') : ''}`
  useEffect(() => {
    if (armed && item && spots.length) setDraftPiecePaths([[item.at, ...spots]])
    else setDraftPiecePaths(null)
    return () => setDraftPiecePaths(null)
  }, [draftKey]) // eslint-disable-line react-hooks/exhaustive-deps -- the key is the draft
  /** arm: the next ground clicks are path spots (Esc / a save / Cancel disarm) */
  const arm = () => { setSpots([]); setArmed(true) }
  const disarm = () => { setArmed(false); setSpots([]) }
  const addSpot = (p: Pt) => setSpots((s) => [...s, p])
  /** the one save: `pathSpots` after the piece's own place, at a speed (m/s), facing the way it travels unless `face` is false */
  const save = (pathSpots: Pt[], speed: number, face: boolean) => {
    if (!item) return Promise.resolve()
    const start: Pt = [item.at[0], item.at[1]]
    return place.setMove({
      path: [start, ...pathSpots].map(([x, z]) => [r2(x), r2(z)] as Pt),
      speed: Math.round(clampSpeed(speed) * 100) / 100,
      ...(face ? {} : { faceTravel: false }),
    })
  }
  return { armed, spots, arm, disarm, addSpot, save }
}
