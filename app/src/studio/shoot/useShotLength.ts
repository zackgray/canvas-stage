// The shot's one length (wave A, S7): one value for the hero's motion, the preset camera move's Length and the render. On a kit
// world it is saved WITH the performance (shotSeconds, free; the motion is padded to it, motion/shotPad.ts), so a Camera tab switch,
// a reload and a later Blocking save all keep it. Off a kit world it stays a local choice, as the preset Length was. The hook lives
// in ShootScreen, which never unmounts on a tab switch.
import { useEffect, useRef, useState } from 'react'
import { KitRequestError, saveKitPerformance } from '../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { PerformancePlan } from '../../stage3d/contract'
import { overShotLine } from './takeLock'

/** lengths on offer (s): 6 s fits a stand-and-lift with its hold; 8 s is the render's ceiling (193 frames) */
export { PRESET_SECONDS as SHOT_LENGTHS } from '../../labs/projection/operator/presetMoves'
/** the length off a kit world before any pick (the preset Length's old default) */
export const LOCAL_DEFAULT_S = 2

const secs = (s: number) => `${s.toFixed(1)} s`

/** the plain sentences of a refused save: the server's list (perf.ts words) when it sent one, else its message */
export function refusalLines(e: unknown): string[] {
  if (e instanceof KitRequestError && e.errors.length) return e.errors
  return [e instanceof Error ? e.message : String(e)]
}

/** the 3D performer on the set (MocapLayer): its plan and its (padded) duration; null when none is loaded */
type Performer = { plan: PerformancePlan; duration: number } | null
const performerOf = (lab: ProjectionLabState): Performer => {
  const l = lab.performance?.layer as { plan?: PerformancePlan; duration?: number } | null | undefined
  return l && l.plan && typeof l.duration === 'number' ? { plan: l.plan, duration: l.duration } : null
}

/**
 * What the Record button waits for: on a kit world with a saved length, the performer rebuilt with that length and at least that
 * long (the world clock, the record cap and the lock all follow the performer's duration). Null when Record may go.
 */
export function waitLine(value: number | null, saving: boolean, perf: Performer, kit: boolean): string | null {
  if (!kit || value === null) return null
  if (saving || (perf && (perf.plan.shotSeconds !== value || perf.duration + 1e-6 < value))) return `Updating the action to ${value} s…`
  return null
}

export function useShotLength(lab: ProjectionLabState) {
  const kitId = lab.kit?.id ?? null
  const perf = lab.kit?.perf ?? null // the walk on the stage (a locked take on show plays its own): what Record waits for
  // a pick is saved onto the scene's walk, never onto a take's copy (the first change sets the take on show aside)
  const scene = lab.kit?.world?.perf ?? null
  const kit = !!kitId && !!perf
  const saved = kit ? perf?.shotSeconds ?? null : null
  const [local, setLocal] = useState<number>(LOCAL_DEFAULT_S)
  const [pending, setPending] = useState<number | null>(null)
  // the pick as of now, ahead of the next render: R pressed in the same frame as the pick already waits (waitNow)
  const pendingNow = useRef<number | null>(null)
  pendingNow.current = pending
  const [errors, setErrors] = useState<string[] | null>(null)
  // another world: nothing of this one's pick or refusal carries over
  useEffect(() => { setPending(null); setErrors(null) }, [kitId])
  // the save landed and the world was re-read (KIT_CHANGED): the saved value speaks again
  useEffect(() => { if (pending !== null && saved === pending) setPending(null) }, [saved, pending])

  const value = kit ? pending ?? saved : local
  const pick = async (s: number) => {
    setErrors(null)
    if (!kit || !kitId || !perf) { setLocal(s); return }
    if (s === saved && s === (scene ?? perf).shotSeconds && pending === null) return
    pendingNow.current = s
    setPending(s)
    try { await saveKitPerformance(kitId, { ...(scene ?? perf), shotSeconds: s }) } catch (e) { pendingNow.current = null; setPending(null); setErrors(refusalLines(e)) }
  }
  const performer = performerOf(lab)
  // no length saved yet: say how long the action is, so the pick is an informed one
  const line = kit && value === null
    ? (performer ? `Shot: the action takes ${secs(performer.duration)}. Pick a length.` : 'Shot: pick a length.')
    : null
  const over = kit && value !== null && performer && performer.plan.shotSeconds === value ? overShotLine(performer.duration, value) : null
  /** the wait as of this instant (a pick made since the last render counts): what Record and R check before starting a take */
  const waitNow = () => waitLine(kit ? pendingNow.current ?? saved : local, pendingNow.current !== null, performer, kit)
  return { value, pick, saving: pending !== null, errors, line, over, wait: waitLine(value, pending !== null, performer, kit), waitNow, kit }
}
export type ShotLengthState = ReturnType<typeof useShotLength>
