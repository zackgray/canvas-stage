import { angleLabel, isWide } from '../shoot/angle'

/** Corner readout over the viewport: how far the view has left the original projector view. */
export function AngleBadge({ deg, line }: { deg: number; line?: string }) {
  return (
    <div className={`pl-angle${isWide(deg) ? ' pl-wide' : ''}`} title="Past 20° the set has less information; expect holes">
      {angleLabel(deg)}
      {line && <span className="pl-angle-line">{line}</span>}
    </div>
  )
}
