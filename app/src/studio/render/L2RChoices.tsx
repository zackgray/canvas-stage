import { HOLD_LABELS, HOLD_PRESETS, HOLD_TIPS, type HoldPreset } from '../../shared/renderFinishContract'
import { Seg } from '../Seg'
import { holdFor } from './finishChoice'
import type { KeyName } from './l2rExtra'
import type { L2RHook } from './l2rModel'

export { FinishRow } from './FinishRow'

const NAMES: KeyName[] = ['mid', 'end']

/** "Hold the clay: wide / close-up": how tightly the 3D set steers the render. Numbers are in the tooltip only. */
export function HoldRow({ l }: { l: L2RHook }) {
  const take = l.state.status?.take
  if (!take) return null
  const hold = holdFor(l.state.picks, take)
  return (
    <div className="st-l2r-row" data-testid="l2r-hold">
      <Seg<HoldPreset> label="Hold the clay" small value={hold} testId="l2r-hold-pick" onChange={(h) => l.setHold(h)}
        items={HOLD_PRESETS.map((id) => ({ id, label: HOLD_LABELS[id], title: HOLD_TIPS[id] }))} />
      <span className="st-muted">{hold === 'wide' ? 'The set you drew is kept; the clay steers the first pass only.' : 'The clay steers both passes, so faces stay on their marks.'}</span>
    </div>
  )
}

/**
 * Mid / end keyframes Shoot approved: OFF unless ticked (E140 A: keyframes drawn on their own morph the set). Ticked on, one whose
 * set does not follow the opening's says so; a stale one says why and the render will refuse it.
 */
export function KeyframeRows({ l }: { l: L2RHook }) {
  const ks = l.state.status?.keyframes
  if (!ks || (!ks.mid && !ks.end)) return null
  return (
    <div className="st-l2r-keys" data-testid="l2r-keyframes">
      {NAMES.map((n) => {
        const k = ks[n]
        if (!k) return null
        const on = !l.state.keyOff[n]
        return (
          <label key={n} className="st-l2r-row" data-testid={`l2r-key-${n}`}>
            <input type="checkbox" checked={on} onChange={(e) => l.setKeyframe(n, e.target.checked)} />
            <span title={`Guide ${k.strength} on both passes`}>{n === 'mid' ? 'Mid' : 'End'} keyframe · frame {k.frame}</span>
            {!on && <span className="st-muted">off: it helps only if its set matches the opening</span>}
            {k.stale && on && <span className="st-warn" data-testid={`l2r-key-${n}-stale`}>Stale: {k.stale} Draw a new one on the Stage, or switch it off.</span>}
            {k.setDiffers && on && !k.stale && <span className="st-warn" data-testid={`l2r-key-${n}-differs`}>{k.setDiffers}</span>}
          </label>
        )
      })}
    </div>
  )
}
