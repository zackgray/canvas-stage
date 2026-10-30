import { useEffect, useState } from 'react'
import type { PerformanceLayer } from '../PerformanceLayer'
import { BodiesLayer } from './BodiesLayer'
import { fetchBodies, fetchBodiesMeta, type BodiesMeta, type BodyData } from './bodiesCache'

/**
 * E39 preview toggle: when the loaded performance has a baked 3D-bodies cache (lab-assets/experiments/e39/viewport), offer
 * "3D bodies". On: the actor cut-out sheets are hidden and the bodies follow the performance's frame (the same clock as the
 * sheets: scrub, play, recording). The cache (≈12 MB) is fetched on first switch-on, not at load.
 */
export function useBodies(layer: PerformanceLayer | null) {
  const [meta, setMeta] = useState<BodiesMeta | null>(null)
  const [on, setOn] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BodyData | null>(null)

  // does this pack have a cache? (a few hundred bytes; the heavy file waits for the switch)
  useEffect(() => {
    let alive = true
    setMeta(null); setData(null); setOn(false); setError(null)
    if (layer) fetchBodiesMeta(layer.pack.id).then((m) => { if (alive && m && m.frames === layer.pack.frames) setMeta(m) })
    return () => { alive = false }
  }, [layer])

  useEffect(() => {
    if (!on || !meta || data) return
    let alive = true
    setPhase('Loading 3D bodies…')
    fetchBodies(meta)
      .then((d) => { if (alive) setData(d) })
      .catch((e: unknown) => { if (alive) { setError(`Could not load the bodies: ${e instanceof Error ? e.message : String(e)}`); setOn(false) } })
      .finally(() => { if (alive) setPhase(null) })
    return () => { alive = false }
  }, [on, meta, data])

  useEffect(() => {
    if (!on || !data || !layer) return
    const b = new BodiesLayer(data, layer.camera)
    layer.setActorsVisible(false)
    layer.onFrame = (i) => b.show(i)
    b.show(layer.current)
    return () => {
      layer.onFrame = null
      layer.setActorsVisible(true)
      b.dispose()
    }
  }, [on, data, layer])

  return { available: !!meta, on, setOn, phase, error, objects: meta?.objects.filter((o) => o.kind === 'body').map((o) => o.name) ?? [] }
}

export type BodiesControls = ReturnType<typeof useBodies>
