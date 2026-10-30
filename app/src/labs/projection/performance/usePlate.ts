import { useEffect, useState } from 'react'
import type { PerformancePack } from '../../../project/performance'
import { loadPlate, type Plate } from './plate'

/**
 * The picked performance's own plate as the set (t29), when it has one and `on`: loaded once per pack, dropped when the
 * pack goes or the user turns it off (the lab's load effect then puts the location's still back).
 */
export function usePlate(pack: PerformancePack | null, on: boolean) {
  const [plate, setPlate] = useState<Plate | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!pack?.backgroundDepth || !on) return
    let alive = true
    loadPlate(pack).then(
      (p) => { if (alive) setPlate(p); else p.texture.dispose() },
      (e: unknown) => { if (alive) setError(`Could not load the performance's plate: ${e instanceof Error ? e.message : String(e)}`) },
    )
    return () => { alive = false; setPlate(null); setError(null) }
  }, [pack, on])
  return { plate, error, available: !!pack?.backgroundDepth }
}
