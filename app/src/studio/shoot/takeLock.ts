import { useEffect, useMemo, useState } from 'react'
import type { ProcessedTake } from '../../labs/controller/take/processTake'
import { listTakes, lockTake, type Fetch } from '../../labs/projection/clay/api'
import { worldMismatch } from '../../labs/projection/clay/exportClay'
import { CLAY_FPS, CLAY_MAX, lockKey, lockRequest, takeFrames } from '../../labs/projection/clay/plan'
import type { PackTiming } from '../../labs/projection/performance/frames'
import type { CarriedStill } from '../../shared/carryContract'
import type { PerformancePlan } from '../../stage3d/contract'
import { takeOnShowFor, useTakeOnShow } from '../../labs/projection/stage3d/takeOnShow'
import type { TakeLockRequest, TakeRecord } from '../../shared/shotContract'
import { lockPerfOf } from './lockPerf'
import { lockSetOf } from './lockSet'
import { setCurrentTake, setMemoryTakeLocked } from './currentTake'
import { lastTakeId } from './lastTake'
import { setOpenTake } from './openTake'
import { setKeyOf, setMovedSinceLock } from './setKey'

type Pack = (PackTiming & { id: string }) | null

/** the lock each take in memory was locked as (or found as on disk), for this page's life */
const lockOf = new WeakMap<ProcessedTake, TakeRecord>()

/** The in-memory take as it would be locked, its key, or why it cannot be. Pure, for the block and its tests. */
export function currentLock(take: ProcessedTake | null, pack: Pack, worldId: string, aspect: number):
  { request: TakeLockRequest; key: { startKey: string; frames: number } } | { error: string } | null {
  if (!take || take.smoothed.length === 0) return null
  try {
    const request = lockRequest(take, pack, worldId, aspect)
    return { request, key: lockKey(request) }
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}

/** the longest take a lock keeps: CLAY_MAX frames at 24 fps (193 = 8 s since 2026-10-24; Render prices per frame) */
export const TAKE_CAP_S = CLAY_MAX / CLAY_FPS
const secs = (s: number) => `${s.toFixed(1)} s`

/**
 * Said before recording, on a kit world: the 3D performer's walk runs past what a take can lock. The lock keeps the first CLAY_MAX
 * frames from where recording starts (plan.ts clayPlan caps it); nothing is refused, but the rest of the walk is never rendered.
 */
export function capNotice(performanceFrames: number | null | undefined, fps = CLAY_FPS): string | null {
  if (!performanceFrames || performanceFrames <= CLAY_MAX) return null
  return `The performer walks for ${secs(performanceFrames / fps)}, and a take locks at most ${secs(TAKE_CAP_S)} (${CLAY_MAX} frames): ` +
    `the prepared frames and the render keep the first ${secs(TAKE_CAP_S)} from where you start recording. For the whole walk, shorten the path in Blocking.`
}

/** seconds past the shot before the action counts as longer than it (the pad itself ends up to 1/24 + 1/48 s past) */
const OVER_S = 0.1

/**
 * Said before Record when a shot length is saved and the action runs longer than the shot (the pad only lengthens a motion,
 * motion/shotPad.ts): the take keeps the shot's length from the start, the rest of the action is never filmed.
 */
export function overShotLine(duration: number | null | undefined, shot: number | null | undefined): string | null {
  if (!duration || !shot || duration <= shot + OVER_S) return null
  return `The action takes ${secs(duration)} and the shot is ${shot} s: pick a longer shot or a shorter action. A take keeps the first ${shot} s.`
}

/** Said once a take is recorded: it ran longer than a lock keeps, and how much the lock keeps (null when it fits). */
export function takeCapLine(samples: { t: number }[], lockFrames: number | null): string | null {
  if (takeFrames(samples) <= CLAY_MAX || lockFrames !== CLAY_MAX) return null
  return `This take ran ${secs((samples[samples.length - 1].t - samples[0].t))}; the lock keeps its first ${secs(TAKE_CAP_S)} (${CLAY_MAX} frames).`
}

/**
 * "changed since lock": the in-memory take no longer opens on (or runs as long as) the locked one, the set shows another world,
 * or (when `packId` is given) another performance: a kit world's path edited in Blocking gives the 3D performer a new pack id while
 * the camera track, and so the startKey, stay the same.
 */
export const changedSinceLock = (locked: Pick<TakeRecord, 'startKey' | 'frames' | 'worldId'> & { packId?: string | null } | null,
  key: { startKey: string; frames: number } | null, worldId: string, packId?: string | null) =>
  !!locked && ((!!key && (locked.startKey !== key.startKey || locked.frames !== key.frames)) || locked.worldId !== worldId ||
    (packId !== undefined && locked.packId !== undefined && locked.packId !== packId))

/**
 * The lock state of the operator's latest take: what a lock would send, the record it was locked as (this session's lock, or
 * on first sight a record on disk with the same start and length), and the Lock action. The take is the engine's (mutable,
 * sampled by the block's ticker), so this re-derives when its object or the performance changes.
 */
export function useTakeLock(take: ProcessedTake | null, pack: Pack, worldId: string, aspect: number, f?: Fetch,
  /** the frame-0 key of a request (frame0Key.ts), read at the press: it rides on the lock so the server can carry the opening still */
  frame0?: (q: TakeLockRequest) => string | null,
  /** the kit set plan on the stage (null = none): it and its key ride on the lock, and a set changed after it reads as changed since lock */
  setPlan?: unknown,
  /** the walk the stage's performer plays (MocapLayer.plan, as the page has it): it rides on the lock as the take's own walk */
  perfNow?: PerformancePlan | null) {
  const setNow = useMemo(() => setKeyOf(setPlan), [setPlan])
  const cur = useMemo(() => currentLock(take, pack, worldId, aspect), [take, pack, worldId, aspect]) // eslint-disable-line react-hooks/exhaustive-deps
  // a remount (a tab switch and back) knows the take's lock at once, so it never reads as unlocked while the list is re-read
  const [locked, setLockedNow] = useState<TakeRecord | null>(() => (take && lockOf.get(take)) ?? null)
  const setLocked = (r: TakeRecord) => { if (take) lockOf.set(take, r); setLockedNow(r) }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [carried, setCarried] = useState<CarriedStill | null>(null)
  const key = cur && 'key' in cur ? cur.key : null

  // first sight of a take: a record on disk with the same start and length is its lock (a remount keeps the state)
  useEffect(() => {
    if (locked || !key) return
    let alive = true
    listTakes(f).then((all) => {
      const same = (t: TakeRecord) => t.worldId === worldId && t.startKey === key.startKey && t.frames === key.frames && t.packId === (pack?.id ?? null)
      // the lock of this set if there is one (a re-lock after a piece moved), else the take as it was locked on an earlier set
      const hit = all.find((t) => same(t) && !setMovedSinceLock(t, setNow)) ?? all.find(same)
      if (alive && hit) setLocked(hit)
    }).catch(() => { /* the list is a convenience; Lock still works */ })
    return () => { alive = false }
  }, [locked, key?.startKey, key?.frames, worldId, pack?.id, f, setNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // a piece built or moved since the lock: camera and motion are the same, so it is the same take; its frames are prepared again
  // from the set as it stands when the first frame is drawn (stillPrep.ts, free), never by a new lock (a hand-flown move is the take)
  const setMoved = setMovedSinceLock(locked, setNow)
  // another locked take on show plays its own walk: the take in memory is not what the stage shows, so its walk is not compared
  // (it would read "changed" and drop the pick); a scene edit sets the shown take aside and the comparison speaks again
  const onShow = takeOnShowFor(useTakeOnShow(), worldId)
  const otherOnShow = !!onShow && !!locked && onShow.takeId !== locked.id
  const changed = changedSinceLock(locked, key, worldId, otherOnShow ? undefined : pack?.id ?? null)
  // the hero block and Render work on this take (currentTake.ts) while it is what the set shows; a changed take or another
  // world clears it, so nothing downstream captures or renders against a take the stage no longer matches. A new recording says so
  // again: a take recorded as its lock stands puts that lock back over a pick (worldTakes.ts clears a pick otherwise)
  // (New take, owner 10-29) the take leaving the deck takes its lock with it: an empty deck never puts that lock back as current
  useEffect(() => { if (!take) setLockedNow(null) }, [take])
  useEffect(() => { if (locked && take && !otherOnShow) setCurrentTake(changed ? null : locked.id) }, [locked?.id, changed, take?.raw]) // eslint-disable-line react-hooks/exhaustive-deps
  // the take in memory is the locked one, whatever take is on show (review F4: Shoot's unlocked line and its replace-ask read this)
  useEffect(() => { setMemoryTakeLocked(!!take && !!locked && !changed) }, [take, locked, changed])
  useEffect(() => () => setMemoryTakeLocked(false), [])

  const lock = async () => {
    if (!cur || !('request' in cur) || busy) return
    setBusy(true)
    setError(null)
    try {
      const k = frame0?.(cur.request) ?? null
      // a new take starts from the words of the take last on show (the drawer shows those words meanwhile: drawerMode.ts)
      const from = lastTakeId()
      const perf = lockPerfOf(cur.request, perfNow)
      // the set on the stage rides beside its key (lockSet.ts): the take keeps it for good
      const set = lockSetOf(setNow, setPlan)
      const r = await lockTake({ ...cur.request, ...(k ? { frame0Key: k } : {}), ...(setNow ? { setKey: setNow } : {}), ...(from ? { wordsFrom: from } : {}), ...perf, ...set }, f)
      setLocked(r.take)
      setOpenTake(worldId, false) // the open take is locked: it is a take in the list now
      setCarried(r.carried ?? null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  const perfMoved = locked && !otherOnShow && locked.packId !== (pack?.id ?? null)
    ? (pack ? 'The performance on the set has changed since this take was locked (a new path or pace): lock the take again to film it.' : 'The take\'s performance is not on the set.')
    : null
  return { cur, key, locked, changed, worldMoved: locked ? worldMismatch(locked, worldId) : null, perfMoved, setMoved, busy, error, lock, carried }
}
