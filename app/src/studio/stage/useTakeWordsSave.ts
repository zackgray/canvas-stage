// The take words box's saving (drawer-edits-the-take, owner 10-29): the box is now the Stage's main Prompt, so it saves like the
// scene words do. A pause in the typing writes them (SAVE_MS, the scene box's own pause), leaving the box writes them at once, and a
// box that goes away with words unsaved (a switch to another take, a tab change, the page closing) writes them to ITS OWN take
// first: the take id is the box's, fixed for its life (TakeWords keys the box by the take), so one take's words can never land in
// another. Every write goes through the one existing route (writeTakeWords: the staleness, the take-words event, Render's refresh),
// one at a time in the order they were made (a queue shared by every box), and the box shows the saved words again only once no
// write of its own is in flight and none failed, so a slow reply never puts older words back under the owner's cursor. Free.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TakeWordsRequest } from '../../shared/takeWordsContract'
import { SAVE_MS } from '../scene/design/useDesign'
import { refreshBoard } from '../shoot/takeBoard'
import { writeTakeWords } from '../shoot/takeWordsApi'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** every take-words write from the page, in order (a later write never overtakes an earlier one) */
let queue: Promise<unknown> = Promise.resolve()
/** the writes queued and not settled yet, by take */
const inFlight = new Map<string, number>()
const enqueue = (req: TakeWordsRequest) => {
  inFlight.set(req.takeId, (inFlight.get(req.takeId) ?? 0) + 1)
  const p = queue.then(() => writeTakeWords(req)).then(() => refreshBoard())
    .finally(() => { const n = (inFlight.get(req.takeId) ?? 1) - 1; if (n > 0) inFlight.set(req.takeId, n); else inFlight.delete(req.takeId) })
  queue = p.catch(() => {})
  return p
}
/** tests only: the writes queued so far have settled */
export const takeWordsSettled = (): Promise<unknown> => queue

export function useTakeWordsSave(takeId: string, saved: string) {
  const [text, setTextNow] = useState(saved)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false) // the box's own words were refused: they stay in the box, to try again
  const textRef = useRef(saved)
  const sent = useRef<string | null>(saved) // the words last written (or read) for this take
  const alive = useRef(true)
  const setText = useCallback((t: string) => { textRef.current = t; setTextNow(t) }, [])
  // back on a take whose last words are still on their way (typed, then a fast switch away and back): the box waits for them,
  // read-only, so typing never starts from the words before them
  const [waiting, setWaiting] = useState(() => inFlight.has(takeId))
  const fresh = useRef(true) // the saved words go in once the wait is over, whatever the focus
  useEffect(() => {
    if (!waiting) return
    let on = true
    void queue.then(() => { if (on) setWaiting(false) })
    return () => { on = false }
  }, [waiting])

  /** `typed`: the box's own words (the saved words wait for it before showing again); a copy in (Start from…, Update from scene)
   *  shows as soon as the list has it, as before */
  const write = useCallback((req: TakeWordsRequest, typed = false) => {
    setError(null)
    if (typed) { setBusy((n) => n + 1); setFailed(false) }
    return enqueue(req)
      .catch((e) => { if (!alive.current) return; setError(msg(e)); if (typed) { setFailed(true); sent.current = null } })
      .finally(() => { if (alive.current && typed) setBusy((n) => n - 1) })
  }, [])
  /** the typed words, written when they differ from the last written */
  const send = useCallback((t: string) => {
    if (t === sent.current) return
    sent.current = t
    void write({ takeId, prompt: t }, true)
  }, [takeId, write])

  // the words as saved (another tab, Update from scene, Start from…) show here unless the owner is typing or a write is on its way
  useEffect(() => {
    if (waiting || busy > 0 || failed || (editing && !fresh.current)) return
    fresh.current = false
    setText(saved); sent.current = saved
  }, [saved, editing, busy, failed, waiting, setText])
  // a pause in the typing saves
  useEffect(() => {
    if (!editing || text === sent.current) return
    const t = setTimeout(() => send(textRef.current), SAVE_MS)
    return () => clearTimeout(t)
  }, [text, editing, send])
  // the box going away, or the page closing, with words unsaved: they go to this box's take
  useEffect(() => {
    alive.current = true
    const flush = () => { if (textRef.current !== sent.current) { sent.current = textRef.current; void enqueue({ takeId, prompt: textRef.current }).catch(() => {}) } }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush); alive.current = false; flush() }
  }, [takeId])

  const leave = () => { setEditing(false); send(textRef.current) }
  /** a write that is not typing (a tag made from a selection): `t` is the box's words now */
  const writeNow = (t: string) => { setText(t); send(t) }
  return { text, setText, editing, setEditing, leave, writeNow, write, error, setError, waiting }
}
