import { useEffect, useState } from 'react'
import type { Stage } from '../engine/Stage'
import { matchesSet } from './frames'
import { fetchPack, listPacks, loadPack, type PackEntry } from './load'
import { PerformanceLayer } from './PerformanceLayer'
import { usePlate } from './usePlate'
import { useBodies } from './bodies/useBodies'
import { kitPackEntry, type KitPerformance } from '../stage3d/kitPerformance'
import { useMocap } from '../stage3d/useMocap'

/**
 * The performance on the set: the packs lifted against the current set (`source`), the one picked, loading it (every
 * frame decoded once) and putting it on the world clock. Switching sets drops a pack that does not belong to the new one.
 * `plate`: while a pack with a plate depth is on, the set is built from that plate (t29; `plateOn` false = the
 * location's still, as before) — the lab's load effect swaps the set's source.
 * `kit` (Stage3D): on a kit world the "3D performer" (a mocap layer) is listed as one more entry and is on by default; `layer`
 * is then the mocap layer (it carries a pack-shaped `pack`), and `packLayer` is only ever a lifted pack's layer.
 */
export function usePerformance(stage: Stage | null, source: string, kit: KitPerformance | null = null) {
  const [packs, setPacks] = useState<PackEntry[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [packLayer, setLayer] = useState<PerformanceLayer | null>(null)
  const [plateOn, setPlateOn] = useState(true)
  const plate = usePlate(packLayer?.pack ?? null, plateOn)
  const bodies = useBodies(packLayer)
  // the kit world whose 3D performer was turned off ("none"); each other kit world opens with its performer on
  const [mocapOffFor, setMocapOffFor] = useState<string | null>(null)
  const mocapOff = !!kit?.id && mocapOffFor === kit.id

  // the list, re-read when the set or the pick changes (a pack lifted meanwhile shows up, e.g. "Open in Build")
  useEffect(() => {
    let alive = true
    listPacks().then((p) => { if (alive) setPacks(p) })
    return () => { alive = false }
  }, [source, picked])

  const lifted = (packs ?? []).filter((p) => matchesSet(p.locationId, source))
  // a pick that does not belong to the set (the set changed) is no pick
  const pickedPack = picked && (!packs || lifted.some((p) => p.id === picked)) ? picked : null
  const mocapEntry = kit ? kitPackEntry(kit) : null
  const mocapOn = !!mocapEntry && !mocapOff && !pickedPack
  const mocap = useMocap(stage, kit?.layer ?? null, kit?.perf ?? null, mocapOn, !!kit?.audition)
  const forSet = mocapEntry ? [{ ...mocapEntry, frames: mocap.layer?.pack.frames ?? 0 }, ...lifted] : lifted
  const selected = pickedPack ?? (mocapEntry && !mocapOff ? mocapEntry.id : null)
  const select = (id: string | null) => {
    setError(null)
    setMocapOffFor(id === null ? kit?.id ?? null : null)
    setPicked(id && id !== mocapEntry?.id ? id : null)
  }

  useEffect(() => {
    if (!stage || !pickedPack) return
    let cancelled = false
    let made: PerformanceLayer | null = null
    const run = async () => {
      setPhase('Loading the performance…')
      const pack = await fetchPack(pickedPack)
      const t0 = performance.now()
      const crops = await loadPack(pack, (d, n) => { if (!cancelled) setPhase(`Loading ${pack.label}… ${d}/${n} frames`) })
      if (cancelled) return
      made = new PerformanceLayer(pack, crops)
      made.loadMs = performance.now() - t0
      stage.world.setPerformance(made)
      setLayer(made)
      setPhase(null)
    }
    run().catch((e: unknown) => {
      if (cancelled) return
      setError(`Could not load the performance: ${e instanceof Error ? e.message : String(e)}`)
      setPhase(null)
      setPicked(null)
    })
    return () => {
      cancelled = true
      if (made) {
        if (stage.world.performance === made) stage.world.setPerformance(null)
        made.dispose()
      }
      setLayer(null)
      setPhase(null)
    }
  }, [stage, pickedPack])

  const layer = packLayer ?? mocap.layer
  return {
    packs: forSet, listed: packs !== null, selected, select, phase: phase ?? mocap.phase, error: error ?? mocap.error, layer, packLayer,
    /** the 3D performer is on its way (on for this set, not failed): the mark's grey stand-in waits for her instead of standing in */
    mocapExpected: mocapOn && !mocap.error,
    plate: plate.plate, plateAvailable: plate.available, plateError: plate.error, plateOn, setPlateOn, bodies,
  }
}

export type PerformanceControls = ReturnType<typeof usePerformance>
