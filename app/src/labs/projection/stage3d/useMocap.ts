import { useEffect, useRef, useState } from 'react'
import type { Stage } from '../engine/Stage'
import type { PerformancePlan } from '../../../stage3d/contract'
import { disposeTree } from '../../../stage3d/dispose'
import { createPerformer } from '../../../stage3d/performer'
import type { KitLayer } from './KitLayer'
import { MocapLayer } from './MocapLayer'
import { parkPerformer, performerKey, takeParked } from './performerCache'

/**
 * The 3D performer on a kit world: built from the world's PerformancePlan on its ground and put on the world clock (as a
 * performance pack is), while `on`. A new plan (a saved action, a Play here audition) replaces it: the figure on the stage stays
 * until the new one is built, so she never vanishes between the two. `audition` (Play here): the new figure plays from the
 * start at once; when the audition ends (the saved performance comes back) the clock goes back to the start and stops. Off a kit
 * world there is none.
 */
export function useMocap(stage: Stage | null, kit: KitLayer | null, perf: PerformancePlan | null, on: boolean, audition = false) {
  const [layer, setLayer] = useState<MocapLayer | null>(null)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const perfKey = perf ? JSON.stringify(perf) : null
  /** the figure on the stage now (kept through a rebuild until its successor is built) */
  const shown = useRef<{ stage: Stage; layer: MocapLayer; audition: boolean; key: string } | null>(null)
  const drop = () => {
    const s = shown.current
    shown.current = null
    if (!s) return
    if (s.stage.world.performance === s.layer) s.stage.world.setPerformance(null)
    parkPerformer(s.key, s.layer.release()) // kept for a switch back to this walk (bounded; the oldest is freed)
  }

  useEffect(() => {
    setError(null)
    if (!stage || !kit || !perf || !on) { drop(); setLayer(null); setPhase(null); return }
    let cancelled = false
    setPhase('Loading the 3D performer…')
    const key = performerKey(perf, kit.worldId, kit.plan ?? null) // the set's ground and pieces, all the figure closes over (review F2)
    const parked = takeParked(key) // back on a walk already built: no rebuild
    ;(parked ? Promise.resolve(parked) : createPerformer(perf, kit.groundAt, kit.plan?.kit ?? [])).then((p) => {
      // resolved after the plan changed or the world was left: nothing will ever own this figure, so free it here
      if (cancelled) return parked ? parkPerformer(key, p) : disposeTree(p.object)
      const made = new MocapLayer(p, perf, kit.worldId)
      const old = shown.current
      stage.world.setPerformance(made) // the swap: the old figure leaves the scene in the same frame the new one enters it
      shown.current = { stage, layer: made, audition, key }
      if (old) parkPerformer(old.key, old.layer.release())
      const clock = stage.world.clock
      if (audition) { clock.time = 0; clock.playing = true } // Play here: her move plays at once, from the start
      else if (old?.audition) { clock.time = 0; clock.playing = false } // the audition is over: back to the start, still
      setLayer(made)
      setPhase(null)
    }, (e: unknown) => {
      if (cancelled) return
      setError(`Could not load the 3D performer: ${e instanceof Error ? e.message : String(e)}`)
      setPhase(null)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, kit, perfKey, on, audition])

  // leaving the world (unmount) frees the figure on the stage
  useEffect(() => () => drop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  return { layer, phase, error }
}
