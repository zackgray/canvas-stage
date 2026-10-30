// The camera's saved start: "Set start here" keeps the camera's own pose (position, aim, lens, focus) for the scene, any
// moment, also while flying free; until the owner sets one, the start is the saved take's first camera pose — the locked take
// on show, else the scene's newest locked take — kept on disk with the scene (camera-start-point). "Back to start" puts the
// camera there on request; opening the Stage puts it there once per scene and visit of the page (coming back from another page
// leaves it where it was flown since). One start per scene, kept in the Stage memory across a tab switch.
import { useCallback, useEffect, useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { CameraSample } from '../../labs/controller/take/types'
import type { OperatorEngine } from '../../labs/controller/engine/engine'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { TakeRecord } from '../../shared/shotContract'
import { useCurrentTakeId } from '../shoot/currentTake'
import { useLockedTakes } from '../shoot/worldTakes'
import { setStageMemo, useStageMemo, type CameraPose } from './stageMemory'

/** the saved take's camera start: the current take's first sample, else the newest locked take's (takes: newest lock first) */
export function savedStart(takes: readonly TakeRecord[], current: string | null): CameraSample | null {
  const take = takes.find((t) => t.id === current) ?? takes[0] ?? null
  return take?.samples?.[0] ?? null
}

/** the camera's pose right now, as a start to keep (a sample without its time) */
export function poseOf(engine: OperatorEngine): CameraPose {
  const p = engine.out.position
  const q = engine.out.quaternion
  return { position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w], focal: engine.focal, focus: engine.focus }
}

/** put the camera at a saved pose: position, turn and lens; nothing is recorded */
export function returnTo(engine: OperatorEngine, s: CameraPose): void {
  engine.takeOver(new Vector3(...s.position), new Quaternion(...s.quaternion), s.focal)
  if (s.focus !== undefined) engine.focus = s.focus // where the camera aims; older saves carry it
}

/** the scenes whose saved camera was already put back on this page visit */
const restored = new Set<string>()
/** tests only */
export const resetSavedCamera = () => restored.clear()

export function useSavedCamera(lab: ProjectionLabState, restoreOnLoad = false): {
  /** the scene's start: "Set start here"'s pose, else the saved take's first; null without either */
  saved: CameraPose | null
  /** "Back to start": the camera on the saved pose, nothing recorded */
  restore: () => void
  /** "Set start here": keep the camera's pose now as this scene's start */
  saveStart: () => void
} {
  const world = lab.s.source ?? null
  const takes = useLockedTakes(world)
  const current = useCurrentTakeId()
  const own = useStageMemo().start
  const saved = useMemo(() => own ?? savedStart(takes, current), [own, takes, current])
  const engine = lab.op.engine
  // back on the start, Play replays that take's own camera path with the action (not a move from here)
  const restore = useCallback(() => {
    if (!saved || engine.deck.recording) return
    returnTo(engine, saved)
    setStageMemo({ cue: 'take' })
  }, [engine, saved])
  const saveStart = useCallback(() => {
    if (engine.deck.recording) return
    setStageMemo({ start: poseOf(engine) })
  }, [engine])
  useEffect(() => {
    if (!restoreOnLoad || !world || !saved || restored.has(world)) return
    // a take recorded in this visit is the newer work: the camera stays where it was flown
    if (engine.deck.take || engine.deck.recording) return
    restored.add(world)
    returnTo(engine, saved)
  }, [restoreOnLoad, world, saved, engine])
  return { saved, restore, saveStart }
}
