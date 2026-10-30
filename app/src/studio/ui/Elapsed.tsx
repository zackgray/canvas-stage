import { useEffect, useState } from 'react'
import { formatElapsed } from './format'

/** A running job's clock ("1:23"), ticking each second from `since` (epoch ms); nothing without one. `now` is for tests. */
export function Elapsed({ since, now }: { since: number | null | undefined; now?: number }) {
  const [tick, setTick] = useState(() => Date.now())
  const on = typeof since === 'number' && now === undefined
  useEffect(() => {
    if (!on) return
    setTick(Date.now())
    const id = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [on, since])
  if (typeof since !== 'number') return null
  return <span className="st-elapsed" data-testid="elapsed">{formatElapsed((now ?? tick) - since)}</span>
}
