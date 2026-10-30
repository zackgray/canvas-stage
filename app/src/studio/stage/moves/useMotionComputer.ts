// The Describe-a-move panel's hook around the labMotion routes (docs/plan-kimodo-live.md 1.2 and 1.4): it polls health, starts
// a make, polls the job to its end, cancels and keeps tries. Everything is polling — nothing here blocks the Stage screen, so
// the 3D view, paths, camera and takes stay live while a move is being made. A dev-server restart re-attaches: the in-flight
// record lives on disk server-side, so the mount's first /job read picks a running job straight up.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MotionHealth } from '../../../../server/motion/types'
import type { MoveSpec } from '../../../stage3d/moves/index.ts'
import {
  MotionHttpError, motionCancel, motionDiscard, motionHealthInfo, motionJob, motionKeep, motionMake, motionShown,
  type KeptMove, type PanelJob,
} from './client'

/** terminal stages: polling stops (a kept done job still answers /job until the next make overwrites the record) */
const TERMINAL = ['done', 'failed', 'cancelled']
/** health poll: the plugin caches health for 10 s server-side, so this only re-reads that cache */
const HEALTH_MS = 5000

export type MakeResult = { ok: true } | { ok: false; busy: boolean; message: string }

export function useMotionComputer(pollMs = 1500) {
  const [health, setHealth] = useState<MotionHealth | null>(null)
  const [secondsPerTry, setSecondsPerTry] = useState<number | null>(null)
  const [job, setJob] = useState<PanelJob | null>(null)
  const jobRef = useRef<PanelJob | null>(null)
  jobRef.current = job

  const refreshHealth = useCallback(async () => {
    try {
      const h = await motionHealthInfo()
      setHealth(h.state)
      if (h.secondsPerTry) setSecondsPerTry(h.secondsPerTry)
    } catch {
      setHealth('offline')
    }
  }, [])

  const refreshJob = useCallback(async () => {
    try {
      setJob(await motionJob())
    } catch {
      // the dev server itself is unreachable: the plugin's lost bookkeeping cannot run, so mark it here
      setJob((j) => (j && j.stage !== 'lost' ? { ...j, stage: 'lost' } : j))
    }
  }, [])

  // health poll for the panel's whole life
  useEffect(() => {
    let live = true
    const tick = () => { if (live) void refreshHealth() }
    tick()
    const id = setInterval(tick, HEALTH_MS)
    return () => { live = false; clearInterval(id) }
  }, [refreshHealth])

  // on mount, pick up an in-flight make from the server record (e.g. right after a dev-server restart)
  useEffect(() => {
    void refreshJob()
  }, [refreshJob])

  // job poll while a make is active; 'lost' keeps polling so contact comes back on its own, and Check again re-attaches at once
  const stage = job?.stage
  const active = !!stage && !TERMINAL.includes(stage)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => { void refreshJob() }, Math.max(200, pollMs))
    return () => clearInterval(id)
  }, [active, pollMs, refreshJob])

  /** start a make; 409 (the box's queue of 1 is full) comes back as busy so the panel can say so and offer Try again */
  const make = useCallback(async (spec: MoveSpec, n?: number, about: { owner?: string; words?: string } = {}): Promise<MakeResult> => {
    try {
      const { jobId } = await motionMake(spec, n, about)
      setJob({ id: jobId, stage: 'encoding', done: 0, of: n ?? 8, round: 1, tries: [], dropped: { count: 0, reason: '' }, startedAt: Date.now(), ...about, shown: 0, spec })
      return { ok: true }
    } catch (e) {
      if (e instanceof MotionHttpError && e.status === 409) {
        return { ok: false, busy: true, message: 'The motion computer is making another move; yours starts when it finishes.' }
      }
      return { ok: false, busy: false, message: e instanceof Error ? e.message : String(e) }
    }
  }, [])

  const cancel = useCallback(async () => {
    await motionCancel()
    await refreshJob()
  }, [refreshJob])

  /** keep a try: downloads it into the user-clip folder (plan 1.5); the panel then hands it to the Play here / Use this one callbacks */
  const keep = useCallback(async (tryId: number | string, label: string): Promise<KeptMove | null> => {
    const j = jobRef.current
    if (!j) return null
    try {
      return await motionKeep(j.id, tryId, label)
    } catch {
      return null // the panel shows its Try again line; the job stays on the box for 24 h
    }
  }, [])

  /** Try another: show the next-best try (kept with the result on the server, so a reload shows the same one) */
  const show = useCallback(async (shown: number) => {
    const j = jobRef.current
    if (!j) return
    setJob({ ...j, shown })
    try { await motionShown(j.id, shown) } catch { /* the panel still shows it; a reload goes back to the last one kept */ }
  }, [])

  /** the result is done with (used, discarded): it leaves the server's record and the panel shows the words box again */
  const discard = useCallback(async () => {
    const j = jobRef.current
    setJob(null)
    if (j) { try { await motionDiscard(j.id) } catch { /* already gone */ } }
  }, [])

  /** Check again: re-read health and re-attach to the job (lost contact, or the box coming back) */
  const checkAgain = useCallback(async () => {
    await Promise.all([refreshHealth(), refreshJob()])
  }, [refreshHealth, refreshJob])

  return { health, secondsPerTry, job, active, make, cancel, keep, show, discard, checkAgain, refreshHealth, refreshJob, setJob }
}

export type MotionComputer = ReturnType<typeof useMotionComputer>
