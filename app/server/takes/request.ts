/**
 * The lock request (docs/wave-b-contract.md): checked field by field and rebuilt in a fixed order, so nothing the page did not
 * mean to send lands in take.json, and two requests for the same take compare equal as text (store.ts's re-lock rule).
 */
import type { CameraSample } from '../../src/labs/controller/take/types.ts'
import type { TakeLockRequest } from '../../src/shared/shotContract.ts'

/** 8k+1 frames at 24 fps: 9 up to 161 (CrossView's 193 is its own cap; a clay take stops at 161) */
export const MIN_FRAMES = 9
export const MAX_FRAMES = 193 // 8 s (raised from 161, 2026-10-24 limits test)
/** a take is seconds of camera samples; 20 000 is far past any recorder cap */
export const MAX_SAMPLES = 20_000
/** the lock body: the samples are JSON (~200 bytes each) */
export const LOCK_BODY_LIMIT = 8 * 1024 * 1024

export const TAKE_ID_RE = /^take-[0-9A-Za-z-]{1,64}$/
/** Wave 0.5: the action line typed at Lock */
export const MAX_ACTION = 300

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const tuple = (x: unknown, n: number): x is number[] => Array.isArray(x) && x.length === n && x.every(finite)

function sample(x: unknown, i: number): CameraSample | string {
  const s = x as Partial<CameraSample> | null
  if (!s || typeof s !== 'object') return `samples[${i}] is not an object`
  if (!finite(s.t) || !tuple(s.position, 3) || !tuple(s.quaternion, 4) || !finite(s.focal) || !(s.focal > 0)) {
    return `samples[${i}] needs t, position [3], quaternion [4] and focal > 0`
  }
  return { t: s.t, position: [...s.position] as CameraSample['position'], quaternion: [...s.quaternion] as CameraSample['quaternion'], focal: s.focal, ...(finite(s.focus) ? { focus: s.focus } : {}) } // an older client's focus is tolerated, kept and read by nothing
}

/** -> the request in canonical form, or why it is refused */
export function parseLockRequest(raw: unknown): TakeLockRequest | string {
  const q = raw as Partial<TakeLockRequest> | null
  if (!q || typeof q !== 'object') return 'body must be a take'
  if (typeof q.worldId !== 'string' || !q.worldId || q.worldId.length > 200) return 'worldId must be a non-empty string'
  if (q.packId !== null && (typeof q.packId !== 'string' || !/^[\w-]{1,120}$/.test(q.packId))) return 'packId must be a pack id or null'
  if (q.fps !== 24) return 'fps must be 24'
  if (!Number.isInteger(q.frames) || (q.frames! - 1) % 8 !== 0 || q.frames! < MIN_FRAMES || q.frames! > MAX_FRAMES) {
    return `frames must be 8k+1, ${MIN_FRAMES} to ${MAX_FRAMES}`
  }
  if (!Array.isArray(q.samples) || q.samples.length < 1 || q.samples.length > MAX_SAMPLES) return `samples must hold 1 to ${MAX_SAMPLES} camera samples`
  const samples: CameraSample[] = []
  for (const [i, x] of q.samples.entries()) {
    const s = sample(x, i)
    if (typeof s === 'string') return s
    if (i > 0 && s.t < samples[i - 1].t) return 'samples must be in time order'
    samples.push(s)
  }
  if (!finite(q.focal) || !(q.focal > 0)) return 'focal must be > 0 (mm)'
  if (!finite(q.viewAspect) || !(q.viewAspect > 0)) return 'viewAspect must be > 0'
  if (!Number.isInteger(q.perfStart) || q.perfStart! < 0) return 'perfStart must be a performance frame (an integer >= 0)'
  if (q.timelineStart !== undefined && (!finite(q.timelineStart) || q.timelineStart < 0)) return 'timelineStart must be a world time >= 0'
  // (a `lens` an older page sent with its depth-of-field settings is ignored: nothing is recorded of it)
  // Wave 0.5, both optional so older pages lock as before: the action line (blank = none) and the Bible version at lock
  if (q.action !== undefined && q.action !== null && (typeof q.action !== 'string' || q.action.length > MAX_ACTION)) return `action must be a line of at most ${MAX_ACTION} characters`
  const action = typeof q.action === 'string' ? q.action.trim() : ''
  if (q.bibleVersion !== undefined && q.bibleVersion !== null && (!Number.isInteger(q.bibleVersion) || q.bibleVersion < 1)) return 'bibleVersion must be a scene sheet version (an integer >= 1)'
  return {
    worldId: q.worldId, packId: q.packId, fps: 24, frames: q.frames!, samples, focal: q.focal, viewAspect: q.viewAspect, perfStart: q.perfStart!,
    ...(q.timelineStart !== undefined ? { timelineStart: q.timelineStart } : {}),
    ...(action ? { action } : {}),
    ...(typeof q.bibleVersion === 'number' ? { bibleVersion: q.bibleVersion } : {}),
  }
}

/** What makes two locks the same take: every request field, canonical order. */
export function takeIdentity(t: TakeLockRequest): string {
  return JSON.stringify({
    worldId: t.worldId, packId: t.packId, fps: t.fps, frames: t.frames, focal: t.focal, viewAspect: t.viewAspect, perfStart: t.perfStart,
    timelineStart: t.timelineStart ?? null,
    action: t.action ?? null,
    bibleVersion: t.bibleVersion ?? null,
    samples: t.samples.map((s) => [s.t, ...s.position, ...s.quaternion, s.focal]),
  })
}
