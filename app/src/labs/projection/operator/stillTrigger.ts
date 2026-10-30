// The operator's still button (Cross / T) -> the lab's Take still. Money rule: one press = at most one Cloud
// submission. A press while a still is running (or blocked) never submits; it says why instead.
//
// Wave A (plan-build-1022, WP0 / audit section 3): the key no longer takes a still. A test still is a pre-performance lab path that
// spends outside the budget and one slip pays, so T and Cross do nothing (the lab's Take still button went with the Dev view).
// Flip STILL_KEY_ENABLED to give the key its old behaviour back.

/** Does the operator's still key (T / Cross) take a still? Off since Wave A. */
export const STILL_KEY_ENABLED = false

/** The flash line when the key is pressed while it is off. */
export const STILL_KEY_OFF = 'T takes no still: approve a hero still on the Stage instead'

/** Why nothing may shoot the set while it is not on this page (Develop, Render): its view is hidden. */
export const OFF_STAGE = 'The set is not on this page: take stills on the Stage'

/** Off the set's page the answer is OFF_STAGE whatever else holds; on it, the page's own reason (or null). */
export const offStage = (onStage: boolean, why: string | null): string | null => (onStage ? why : OFF_STAGE)

export interface StillTriggerDeps {
  /** why a still cannot be taken now (synthetic scene, loading, export or auto-fill running, a still running), or null */
  blocked(): string | null
  /** export + submit one still (the lab's useTakeStill().take) */
  take(): Promise<void>
  /** mode and rough price of the next still ("Quality, ~14 credits"), named in the flash line */
  price?(): string
}

export interface StillPress {
  taken: boolean
  message: string
}

/** Returns `press`; its own in-flight flag is set before the first await, so a repeat in the same frame is refused too. */
export function stillTrigger(deps: StillTriggerDeps): () => StillPress {
  let inFlight = false
  return () => {
    if (!STILL_KEY_ENABLED) return { taken: false, message: STILL_KEY_OFF }
    if (inFlight) return { taken: false, message: 'A still is already running' }
    const why = deps.blocked()
    if (why) return { taken: false, message: why }
    inFlight = true
    deps.take().catch(() => {}).finally(() => { inFlight = false }) // take() reports its own errors in the panel
    const price = deps.price?.()
    return { taken: true, message: price ? `Taking still (${price})…` : 'Taking still…' }
  }
}
