// What the engine's Play plays on the camera with the action (shotPlay.ts), as the Stage sees it: the scene's Stage memory
// (stageMemory.ts: the picked move and its hold, or the take) and the takes on disk. A locked take replays its own recorded camera
// samples (a flown take's whole path, owner 2026-10-28: "Return to the saved camera" put the camera at its first sample only, and
// Play left it there); a take filmed since and not locked is the newer work and replays from the engine's memory. Also the Stage's
// camera keys (W1-F1): the camera's start ("Set start here" 9 / "Back to start" 0, the pad's microphone mute), the take replay
// (P / the pad's PS button, "Stop take" ;) and the aim lock's clear (U) land here, wired for the Stage's whole life; and Play
// (Space / the pad's play button, the transport's press) replays a just-recorded take instead of pausing the looping clock the
// recording left running.
import { useEffect, useRef } from 'react'
import { playShot, shotPlaying, type ShotPlan } from '../../labs/projection/operator/shotPlay'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { TakeRecord } from '../../shared/shotContract'
import { useCurrentTakeId, useMemoryTakeLocked } from '../shoot/currentTake'
import { useLockedTakes } from '../shoot/worldTakes'
import { releaseShot, stageEscapeFree } from './shotRelease'
import { playTakeWhenReady, recordOnSceneWalk } from './takePerformer'
import { stopTakeNow, takePlaying } from './takePlay'
import { cueOf, setStageMemo, stageMemo, useStageMemo, type StageMemo } from './stageMemory'
import { poseOf, returnTo } from './useSavedCamera'

export interface ShotFacts {
  /** the locked take on show (this world's; else its newest), or null */
  take: TakeRecord | null
  /** a take is in the engine's memory */
  memory: boolean
  /** the take in memory is the locked one as it stands */
  memoryLocked: boolean
  /** the shot length (s), or null when none is picked */
  secs: number | null
}

/** the plan for Play, or null (the world clock alone: nothing to play on the camera) */
export function shotPlanOf(m: StageMemo, f: ShotFacts): ShotPlan | null {
  if (cueOf(m, !!f.take || f.memory) === 'move') return f.secs !== null ? { kind: 'move', id: m.move, seconds: f.secs, hold: m.hold } : null
  if (f.memory && !f.memoryLocked) return { kind: 'memory' }
  if (f.take && (f.take.samples?.length ?? 0) >= 2) return { kind: 'take', samples: f.take.samples, start: f.take.timelineStart ?? 0 }
  return f.memory ? { kind: 'memory' } : null
}

/** Hands the engine the Stage's plan, its half of Create / Esc (shotRelease.ts), the camera keys (Set start here / Back to
 *  start / Play take / Stop take / the aim lock's clear) and the play-after-record wrap, for as long as the caller is mounted
 *  (the transport, the Stage's whole life). Also the automatic "Back to start" when a recording begins, when the Camera panel
 *  set it. */
export function useShotPlan(lab: ProjectionLabState): void {
  const memo = useStageMemo()
  const takes = useLockedTakes(lab.s.source ?? null)
  const cur = useCurrentTakeId()
  const memoryLocked = useMemoryTakeLocked()
  const engine = lab.op.engine
  // the take on show, else the newest locked one: the take "Return to the saved camera" puts the camera on (savedStart)
  const facts = { take: takes.find((t) => t.id === cur) ?? takes[0] ?? null, memoryLocked, secs: memo.secs ?? lab.kit?.perf?.shotSeconds ?? null }
  const latest = useRef({ memo, facts, lab })
  latest.current = { memo, facts, lab }
  useEffect(() => {
    engine.shotPlan = () => shotPlanOf(latest.current.memo, { ...latest.current.facts, memory: !!engine.deck.take })
    engine.onRelease = () => releaseShot(engine)
    engine.hub.keyboard.escapeGate = stageEscapeFree
    // the camera keys: Set start here / Back to start, Play take / Stop take (the pad's PS button toggles), the aim lock's clear.
    // The guards mirror the Camera panel's buttons: nothing while a take records, no Back to start while a move runs.
    engine.onCameraAction = (a) => {
      if (a === 'setStart') {
        if (engine.deck.recording) return
        setStageMemo({ start: poseOf(engine) })
        engine.flash('Start set here')
      } else if (a === 'backToStart') {
        if (engine.deck.recording || engine.move) return
        const start = stageMemo().start ?? latest.current.facts.take?.samples?.[0] ?? null
        if (!start) return
        returnTo(engine, start)
        setStageMemo({ cue: 'take' })
      } else if (a === 'playTake') {
        if (takePlaying(engine)) stopTakeNow(engine) // the pad's one button toggles, as the transport's does
        else void playTakeWhenReady(engine, latest.current.lab.stage, latest.current.lab.kit?.id ?? null) // waits for the take on show's own performer
      } else if (a === 'stopTake') {
        stopTakeNow(engine)
      } else if (a === 'aimClear') {
        setStageMemo({ aim: null })
      }
    }
    // play-after-record: a finished recording hands the looping world clock back running; Play then replays the take (a take
    // plan only — a move plan still pauses the clock), it does not just pause the loop. The engine's own method is wrapped
    // because the play/pause decision lives in the engine the projection lab hosts, which this track does not own.
    const playPause = engine.playPause.bind(engine)
    engine.playPause = () => {
      if (!engine.deck.recording && !shotPlaying(engine) && engine.timeline.playing) {
        const plan = engine.shotPlan()
        if (plan && plan.kind !== 'move' && playShot(engine, plan)) return
      }
      playPause()
    }
    // a finished recording cues its take (owner 10-29: "record a take, hit Play, it doesn't stick"): a filmed move left the move
    // cued, so Play paused the loop the recording left running, then previewed the move live, and Play take stayed greyed, locked
    // or not. The take is the newer work; picking a move afterwards cues that move again.
    const stopRecording = engine.stopRecording.bind(engine)
    engine.stopRecording = () => {
      const before = engine.deck.takeCount
      stopRecording()
      if (engine.deck.takeCount !== before) setStageMemo({ cue: 'take' })
    }
    // every Record films against the scene's walk: a take on show with its own other walk is set aside first (takePerformer.ts)
    const unRecord = recordOnSceneWalk(engine, { stage: () => latest.current.lab.stage, worldId: () => latest.current.lab.kit?.id ?? null,
      scenePerf: () => latest.current.lab.kit?.world?.perf ?? null, scenePlan: () => latest.current.lab.kit?.scenePlan ?? null })
    // camera-start-point: the optional automatic return — "Back to start" as a recording begins
    engine.beforeRecord = () => {
      const start = stageMemo().start
      if (stageMemo().autoStart && start) returnTo(engine, start)
    }
    return () => {
      unRecord()
      engine.shotPlan = () => null
      engine.onRelease = () => false
      engine.onCameraAction = null
      engine.playPause = playPause
      engine.stopRecording = stopRecording
      engine.hub.keyboard.escapeGate = null
      engine.beforeRecord = null
    }
  }, [engine])
}
