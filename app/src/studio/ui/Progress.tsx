import { useEffect, useState } from 'react'
import { formatElapsed } from './format'

// FROZEN PROPS (Wave A contract, docs/plan-build-1022.md §3 A0): screens style around this, never change its props.

export interface ProgressProps {
  /** what is happening now: "generating", "harmonising", "upscaling" … (a stage label, not a job id) */
  label: string
  /** when the job started (epoch ms or an ISO string); the elapsed time ticks from it. null/absent = no clock */
  startedAt?: number | string | null
  /** 0..1 when the share done is known; null/absent = indeterminate (a sliding bar) */
  value?: number | null
  /** the clock's "now" for tests; the live component ticks every second */
  now?: number
}

const startMs = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null
  const t = typeof v === 'number' ? v : Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** A long job's progress: its stage label, elapsed time, and a bar (determinate or indeterminate). */
export function Progress({ label, startedAt, value, now }: ProgressProps) {
  const start = startMs(startedAt)
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    if (start === null || now !== undefined) return
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [start, now])
  const known = typeof value === 'number' && Number.isFinite(value)
  const pct = known ? Math.min(100, Math.max(0, value * 100)) : null
  return (
    <div className={`st-progress${known ? '' : ' st-indeterminate'}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === null ? undefined : Math.round(pct)}>
      <div className="st-progress-head">
        <span className="st-progress-label">{label}</span>
        {start !== null && <span className="st-progress-time">{formatElapsed((now ?? tick) - start)}</span>}
      </div>
      <div className="st-progress-track"><div className="st-progress-fill" style={pct === null ? undefined : { width: `${pct}%` }} /></div>
    </div>
  )
}
