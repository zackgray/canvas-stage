// What the Stage keeps per scene across a tab switch (owner 2026-10-28: Board or Render and back dropped the view, the picked
// camera move and its hold, what Play plays, the camera's start and its auto-return, the Fly it yourself switch and the aim
// lock's target). Module-level and in memory only, like the restored-camera set (useSavedCamera.ts) and the
// current take (currentTake.ts): it lasts the page's life, so leaving the Stage and coming back finds it as it was left; a reload
// starts from the scene's defaults again (the view switch's own saved choice, the newest locked take).
import { useSyncExternalStore } from 'react'
import type { PaneId } from '../../labs/projection/engine/panes'
import type { PresetId } from '../../labs/projection/operator/presetMoves'
import type { CameraSample } from '../../labs/controller/take/types'
import { currentSceneId } from '../../library/currentScene'
import { stageArrival } from './ViewSwitch'

/** what Play plays on the camera with the action: the picked move, or the take (the locked take on show, or the one just filmed) */
export type ShotCue = 'move' | 'take'

/** a camera pose (position, aim and lens) without its time: the camera's saved start (camera-start-point) */
export type CameraPose = Omit<CameraSample, 't'>

/** fly-with-aim-lock's target: the subject (the default), a placed piece, or a clicked ground point */
export type AimChoice = { kind: 'subject' } | { kind: 'piece'; index: number } | { kind: 'point'; at: [number, number] }

export interface StageMemo {
  /** the view switch's panes on this scene's Stage; null = not chosen in this page's life */
  panes: PaneId[] | null
  /** the camera move picked in the Camera panel */
  move: PresetId
  /** Hold on the subject is ticked */
  hold: boolean
  /** null until the owner chooses: the take when there is one, else the move (cueOf) */
  cue: ShotCue | null
  /** the shot length the Camera panel last showed (s), for Play when the panel is not on screen */
  secs: number | null
  /** the camera's start for this scene ("Set start here"), kept across a tab switch; null = the saved take's first pose */
  start: CameraPose | null
  /** "Back to start" automatically when a recording begins */
  autoStart: boolean
  /** Fly it yourself is on (the Camera panel's switch; a tab switch keeps it) */
  fly: boolean
  /** what the hand-flown camera stays aimed at, or null (no aim lock) */
  aim: AimChoice | null
}

/** one object for every scene not touched yet (a stable snapshot for React) */
const FRESH: StageMemo = Object.freeze({ panes: null, move: 'push', hold: false, cue: null, secs: null, start: null, autoStart: false, fly: false, aim: null })
const memos = new Map<string, StageMemo>()
const subs = new Set<() => void>()
const keyOf = (scene: string | null | undefined) => scene ?? ''

export const stageMemo = (scene: string | null = currentSceneId()): StageMemo => memos.get(keyOf(scene)) ?? FRESH

export function setStageMemo(patch: Partial<StageMemo>, scene: string | null = currentSceneId()): void {
  const was = stageMemo(scene)
  if ((Object.keys(patch) as (keyof StageMemo)[]).every((k) => Object.is(was[k], patch[k]))) return
  memos.set(keyOf(scene), { ...was, ...patch })
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** the current scene's memo (re-renders when it changes) */
export const useStageMemo = (): StageMemo => useSyncExternalStore(subscribe, () => stageMemo())

/** the panes a scene's Stage opens on: the ones it was left on in this page's life, else the view switch's arrival rule (`stay`: a
 *  reload inside this Stage keeps its saved choice; any other first arrival opens on the Free view) */
export const arrivalPanes = (scene: string, stay: boolean): PaneId[] => stageMemo(scene).panes ?? stageArrival(scene, stay)

/** what Play plays: the owner's choice, else the take when there is one to replay, else the picked move */
export const cueOf = (m: StageMemo, hasTake: boolean): ShotCue => m.cue ?? (hasTake ? 'take' : 'move')

/** tests only */
export function resetStageMemo(): void { memos.clear() }
