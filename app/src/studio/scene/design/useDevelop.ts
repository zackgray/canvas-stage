// The front door's one paid press: the box's words through POST /planner/develop (one Gemma job, at most one retry), as a job of
// the scene through useDesignCalls' `paid`, so a press already out is refused, the spend is counted once it lands (a 422 at what
// it billed) and an answer that lands after a reload is applied the same way (applyCalls.ts 'develop'). The price and today's
// budget are the server's own (GET /planner, free), read when the box shows and again after every press: the button carries that
// price and says plainly why it cannot run before anything is sent. The box's words are kept on the Guided state.
import { useCallback, useEffect, useState } from 'react'
import type { PlannerStatus } from '../../../shared/bibleContract'
import type { JobIntent } from '../../../shared/libraryContract'
import type { SceneJobs } from '../../../jobs/sceneJobs'
import type { BriefApi } from '../briefApi'
import { IDEA_MAX } from './model'
import type { Guided } from './guided'
import type { DesignState } from './useDesign'

type Paid = (intent: JobIntent, target: string, credits: number, call: () => Promise<unknown>) => Promise<unknown>
export const DEVELOP_TARGET = 'develop'
/** the line under the box when the price could not be read (free to read again) */
export const PRICE_UNREAD = 'The price could not be read, so nothing can be sent yet.'

/** why Develop it cannot be pressed now, in plain words; null when it can (the server still has the last word) */
export function developBlock(text: string, price: number | null, st: PlannerStatus | null): string | null {
  if (!text.trim()) return 'Describe your scene or paste a prompt first.'
  if (text.length > IDEA_MAX) return `Keep it under ${IDEA_MAX} characters (it is ${text.length} now).`
  if (price === null) return 'Reading the price…'
  const b = st?.budget
  if (b && b.cap === null) return "Today's spending limit isn't set, so nothing paid can run. Set it as described in SETUP and restart the app."
  if (b && b.remaining !== null && b.remaining < price) return `Today's budget has ${b.remaining} cr left and this needs about ${price}. Raise the daily limit (see SETUP) to continue.`
  return null
}

export function useDevelop(s: Pick<DesignState, 'ref' | 'set'>, api: BriefApi, jobs: SceneJobs, paid: Paid, setG: (f: (g: Guided) => Guided) => void) {
  const [st, setSt] = useState<PlannerStatus | null>(null)
  const [read, setRead] = useState(0)
  // a failed read is said, with a free Try again (review F4: it used to sit on "Reading the price…" until a reload)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    api.status().then((x) => { if (live) { setSt(x); setFailed(false) } }, () => { if (live) { setSt(null); setFailed(true) } })
    return () => { live = false }
  }, [api, read])
  const retry = useCallback(() => { setFailed(false); setRead((n) => n + 1) }, [])
  const price = st?.prices.single ?? null
  const setIdea = useCallback((text: string) => setG((g) => ({ ...g, idea: { text } })), [setG])
  const press = useCallback(() => {
    const text = s.ref.current.guided?.idea?.text ?? ''
    if (price === null || developBlock(text, price, st) || jobs.running('develop', DEVELOP_TARGET)) return
    // light: the user's words kept in their order, nothing invented beyond what they imply (a pasted prompt is already written)
    void Promise.resolve(paid('develop', DEVELOP_TARGET, price, () => api.develop({ idea: text.trim(), mode: 'light' }))).finally(() => setRead((n) => n + 1))
  }, [s.ref, price, st, jobs, paid, api])
  return { price, status: st, failed: failed && price === null, retry, setIdea, press }
}
export type Develop = ReturnType<typeof useDevelop>
