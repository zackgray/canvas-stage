/**
 * Where a kit clay's Prepare spent its time (tidy wave, CLAY): the page's phases ride on the finish body, the server adds its
 * encodes, and the lot lands in clay.json as ClayExport.timing, so one real Prepare says which phase to fix next. Every value
 * is whole milliseconds. Sums are over frames and overlap (encodes run beside the next frame's draw): compare them with
 * captureMs, the page's wall time. Pure (no DOM, no node); merged into ClayExport in shotContract.ts. Fields are only added.
 */
export interface ClayTiming {
  /** precise frames rendered */
  frames?: number
  /** frames rendered a second time for the massing clay (0 = no massing pieces on the set) */
  massingFrames?: number
  /** CPU time issuing the draws (colour + depth); the GPU's own time shows up in readbackMs, where readPixels waits for it */
  renderMs?: number
  /** the colour read-back (synchronous: includes the wait for the GPU to finish the frame) */
  readbackMs?: number
  /** the depth read-back, issued without blocking (its wall time overlaps the next draws) */
  depthReadbackMs?: number
  /** flip, convert and PNG-encode, summed over every image (worker time when off the main thread) */
  encodeMs?: number
  /** where the encodes ran: workers, the main thread (no Worker), or both (a worker failed and the rest fell back) */
  encodeOn?: 'worker' | 'main' | 'mixed'
  /** the uploads, summed per request */
  uploadMs?: number
  /** the capture loop blocked on encodes and uploads behind it (high = the pipeline, not the GPU, is the limit) */
  waitMs?: number
  /** the page's wall time from the first draw to the last upload */
  captureMs?: number
  /** server: clay.mp4's ffmpeg encode (and its frame-count probe) */
  ffmpegMs?: number
  /** server: massing.mp4's encode, run beside clay.mp4's */
  massingFfmpegMs?: number
  /** server: why the massing clay was not made (the precise clay is; the still falls back to its depth) */
  massingError?: string
}

const COUNTS = ['frames', 'massingFrames', 'renderMs', 'readbackMs', 'depthReadbackMs', 'encodeMs', 'uploadMs', 'waitMs', 'captureMs'] as const
const ON = ['worker', 'main', 'mixed'] as const

/** The page's timing from a finish body: known numeric fields only, whole, non-negative and capped; anything else dropped. */
export function parseClayTiming(raw: unknown): ClayTiming | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>, out: ClayTiming = {}
  for (const k of COUNTS) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = Math.min(Math.round(v), 24 * 3600_000)
  }
  if (ON.includes(r.encodeOn as (typeof ON)[number])) out.encodeOn = r.encodeOn as ClayTiming['encodeOn']
  return Object.keys(out).length ? out : undefined
}
