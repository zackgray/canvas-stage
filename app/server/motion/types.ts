/**
 * Shared shapes for the labMotion plugin and its fake box (docs/motion-box-contract.md). The plugin only moves these
 * between the panel and the box; the MoveSpec inside is Track C's shape (docs/plan-kimodo-live.md section 2), treated
 * here as an opaque payload that the box validates (422).
 */

/** `GET /health` on the box: model loaded?, encoder source, GPU, busy/idle. */
export type BoxHealth = {
  state: 'warming' | 'ready' | 'busy'
  gpu: { name: string; freeMiB: number }
  encoder: string
  version: string
  secondsPerTry?: number
}

/** what the panel shows: the box's state plus off (MOTION_BOX_URL unset) and offline (probe failed). */
export type MotionHealth = 'off' | 'offline' | 'warming' | 'busy' | 'ready'

/** one scored survivor of a job; only the top 3 (the top 5 for free words) are listed and retargeted. */
export type BoxTry = {
  /** the box's own name for the try: "try6" from the motion box, a number from the fake box */
  id: number | string
  seed: number
  rank: number
  reason: string
  scores: Record<string, number>
  seconds: number
  /** a loosened free-words try: the filters it would have been dropped by, in plain words (listed, never dropped) */
  would_drop?: string[]
}

export type BoxStage = 'encoding' | 'generating' | 'scoring' | 'retargeting' | 'done' | 'failed' | 'cancelled'

/** `GET /jobs/:id` on the box. */
export type BoxJobStatus = {
  id: string
  stage: BoxStage
  done: number
  of: number
  round: 1 | 2
  tries: BoxTry[]
  dropped: { count: number; reason: string }
  message?: string
}

/**
 * The on-disk record of the one in-flight make, under public/lab-assets/motions/.in-flight.json (gitignored like the
 * rest of lab-assets). A dev-server restart loses plugin memory but not this file, so it re-attaches to the box job.
 */
export type InFlight = {
  jobId: string
  spec: unknown
  n: number
  /** ms epoch the make started; the whole-job budget (plan 1.4) is measured from here. */
  createdAt: number
  /** ms epoch of the last successful poll; longer than lostAfterMs of failures -> stage lost. */
  lastOk: number
  stage: BoxStage | 'lost'
  message?: string
  /** whose move it is (the kit world, whose one hero the move is for): the result stays with her until it is used or discarded */
  owner?: string
  /** the words the move was made from (the panel shows them again after a reload) */
  words?: string
  /** which of the ranked tries the panel shows (0 = the best); Try another moves it on */
  shown?: number
  /** a finished make's tries as the box last listed them: the result survives the box forgetting it, a restart or a reload */
  result?: Pick<BoxJobStatus, 'done' | 'of' | 'round' | 'tries' | 'dropped'>
  /** tries already kept, by the box's try name: Play here then Use this one keep a try once */
  kept?: Record<string, { id: string; clip: Record<string, unknown> }>
}

/** one kept move as the library loader sees it (plan 1.5: merged in by id gen:<motion-id>). */
export type UserClip = {
  id: string
  folder: string
  /** the user's own words for the move (clip.json's note). */
  note: string
  seconds: number | null
  date: string | null
}
