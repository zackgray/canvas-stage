// The prop card's ADVANCED extras (prop-movement wave; W3-E2 shares the travel through usePropTravel): the picked piece's base
// tilt — pitch and roll steppers beside the turn the viewport already has, plus a reset of all three — and its travel along a
// drawn path: Move to a spot (the walk tool's own spot picker and overlay), Slow / Normal / Fast or a custom metres-per-second
// number, the face-the-way-it-travels toggle, and Clear path. A saved travel reads back from the plan; every write goes through
// the Set's own piece route (useSetPlace). DOM only.
import { useEffect, useState } from 'react'
import { SET_READ_ONLY } from '../../../labs/projection/stage3d/setEditGate'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { LIMITS } from '../../../stage3d/planRules'
import { MOVE_SPEEDS, moveSeconds } from '../../../stage3d/propMove'
import type { SetPlaceState } from '../../scene/useSetPlace'
import { SpotPicker } from './WalkTo'
import { pathLength } from './blocking/blockingMath'
import { usePropTravel } from './usePropTravel'
import { PropFront } from './PropFront'

/** one tilt press, degrees */
const TILT_STEP = 1
const clampSpeed = (v: number) => Math.min(LIMITS.propSpeed[1], Math.max(LIMITS.propSpeed[0], v))

export function PropAdvanced({ place, lab }: { place: SetPlaceState; lab?: ProjectionLabState }) {
  const item = place.item
  const move = item?.move ?? null
  const travel = usePropTravel(place)
  const [speed, setSpeed] = useState<number>(MOVE_SPEEDS[1].mps)
  const [face, setFace] = useState(true)
  // a re-read plan is the truth again: follow its travel's speed and facing
  const moveKey = JSON.stringify(move ?? null)
  useEffect(() => { setSpeed(move?.speed ?? MOVE_SPEEDS[1].mps); setFace(move?.faceTravel !== false) }, [moveKey]) // eslint-disable-line react-hooks/exhaustive-deps -- the key is the move
  if (!item) return null
  const locked = lab?.kit?.ownSet ? SET_READ_ONLY : null // the take on show's own set is read-only: tilt and travel are off up front
  const { armed, spots } = travel
  const clearPath = () => { travel.disarm(); void place.setMove(null) }
  // on a saved travel the speed and facing write at once; while only arming they wait for Done
  const setSpeedNow = (v: number) => { setSpeed(v); if (move) void place.setMove({ ...move, speed: Math.round(clampSpeed(v) * 100) / 100 }) }
  const setFaceNow = (v: boolean) => { setFace(v); if (move) void place.setMove({ ...move, faceTravel: v }) }
  const tiltRow = (axis: 'pitchDeg' | 'rollDeg', label: string) => (
    <span className="oc-stepper" data-testid={`prop-tilt-${axis}`} title={label}>
      <button type="button" aria-label={`${label} down`} disabled={!!locked} title={locked ?? undefined} onClick={() => void place.tiltBy(axis, -TILT_STEP)}>−</button>
      <output>{Math.round((item[axis] ?? 0) * 10) / 10}°</output>
      <button type="button" aria-label={`${label} up`} disabled={!!locked} title={locked ?? undefined} onClick={() => void place.tiltBy(axis, TILT_STEP)}>+</button>
    </span>
  )
  const metres = move ? pathLength(move.path) : 0
  return (
    <>
      <div className="oc-field" data-testid="prop-rotation">
        <label>Base tilt</label>
        <div className="oc-box" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {tiltRow('pitchDeg', 'Pitch')}
          {tiltRow('rollDeg', 'Roll')}
          <button type="button" className="st-btn" data-testid="prop-rotation-reset" disabled={!!locked || (!item.yawDeg && !item.pitchDeg && !item.rollDeg)} title={locked ?? undefined}
            onClick={() => void place.resetRotation()}>Reset rotation</button>
        </div>
        <span className="st-field-hint">Pitch and roll square up a mesh that came in slightly off axis; the turn stays on the viewport (R / the [ ] keys). All three reset together.</span>
      </div>
      <PropFront place={place} lab={lab} />
      <div className="oc-field" data-testid="prop-move">
        <label>Travel along a path</label>
        <div className="sd-act">
          <button type="button" className={armed ? 'st-btn bl-on' : 'st-btn'} data-testid="prop-move-arm" disabled={!lab?.stage || (!!locked && !armed)}
            title={locked ?? (lab?.stage ? 'Click spots on the ground, in any view' : 'Open the Stage view to pick the spots')}
            onClick={() => (armed ? travel.disarm() : travel.arm())}>{armed ? 'Cancel' : move ? 'Pick a new path' : 'Move to a spot'}</button>
          {move && <button type="button" className="st-btn" data-testid="prop-move-clear" onClick={clearPath}>Clear path</button>}
        </div>
        {armed && <>
          {lab && <SpotPicker lab={lab} from={spots.length ? spots[spots.length - 1] : [item.at[0], item.at[1]]}
            onSpot={travel.addSpot} onCancel={travel.disarm} />}
          <span className="st-field-hint" data-testid="prop-move-armed">
            {spots.length ? `${spots.length} spot${spots.length > 1 ? 's' : ''} picked — Done saves the path, another click adds a spot, Esc cancels.` : 'Click the spots on the ground, in any view. Esc cancels.'}
          </span>
          {spots.length > 0 && <div className="sd-act"><button type="button" className="st-btn st-primary" data-testid="prop-move-done"
            onClick={() => { travel.disarm(); void travel.save(spots, speed, face) }}>Done</button></div>}
        </>}
        {(move || armed) && <>
          <div className="sd-act" data-testid="prop-move-speed" style={{ marginTop: 8 }}>
            {MOVE_SPEEDS.map((s) => (
              <button key={s.id} type="button" className={speed === s.mps ? 'st-btn bl-on' : 'st-btn'} aria-pressed={speed === s.mps}
                data-testid={`prop-move-speed-${s.id}`} onClick={() => setSpeedNow(s.mps)}>{s.label}</button>
            ))}
            <label className="st-field-hint" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min={LIMITS.propSpeed[0]} max={LIMITS.propSpeed[1]} step={0.1} value={speed} data-testid="prop-move-custom"
                style={{ width: 64 }} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setSpeedNow(v) }} />
              m/s
            </label>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
            <input type="checkbox" checked={face} data-testid="prop-move-face" onChange={(e) => setFaceNow(e.target.checked)} />
            <span>Face the way it travels</span>
          </label>
        </>}
        {move && <span className="st-field-hint" data-testid="prop-move-line">
          Travels {metres.toFixed(1)} m at {move.speed} m/s — about {moveSeconds(item).toFixed(1)} s, then holds{move.faceTravel === false ? ', keeping its own facing.' : ', facing the way it goes.'}
        </span>}
      </div>
    </>
  )
}
