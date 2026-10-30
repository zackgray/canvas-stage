// The ready-made-move fallback row (plan section 5, Off / Offline / Failed states): library actions that place without the
// motion computer. The join wires onFallback to the same placement the action buttons use. A move with no library clip yet
// (track D2: pick up, put down) keeps its chip but stays disabled, with the plain reason — a dead box or a missing clip never
// leaves the take unplayable (plan section 6's hard rule).
export type FallbackMove = 'lift' | 'pickUp' | 'putDown'

export const FALLBACK_LABELS: Record<FallbackMove, string> = {
  lift: 'Lift a frame',
  pickUp: 'Pick up',
  putDown: 'Put down',
}

const ORDER: FallbackMove[] = ['lift', 'pickUp', 'putDown']

/** (track D2) the ready-made moves the library can play today; the rest keep their chips disabled until their clips land */
export const READY_MADE: readonly FallbackMove[] = ['lift']
export const NOT_READY_LINE = 'The ready-made move is not available yet.'

export function FallbackRow({ onFallback, testId = 'move-fallbacks', ready = ORDER }: {
  onFallback?: (move: FallbackMove) => void
  testId?: string
  /** the moves that place today; the others render disabled with the reason (default: all, Track E's pre-join behaviour) */
  ready?: readonly FallbackMove[]
}) {
  const missing = ORDER.filter((m) => !ready.includes(m))
  return (
    <div className="bl-row" data-testid={testId}>
      {ORDER.map((m) => (
        <button key={m} type="button" className="st-btn" data-testid={`${testId}-${m}`}
          disabled={!ready.includes(m)} title={ready.includes(m) ? undefined : NOT_READY_LINE}
          onClick={() => onFallback?.(m)}>
          {FALLBACK_LABELS[m]}
        </button>
      ))}
      {missing.length > 0 && (
        <span className="st-field-hint" data-testid={`${testId}-not-ready`}>
          {missing.map((m) => FALLBACK_LABELS[m]).join(', ')}: {NOT_READY_LINE}
        </span>
      )}
    </div>
  )
}
