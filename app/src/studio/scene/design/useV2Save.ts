// Keeps an existing world's scene sheet in step with the design. A brief replaced as a whole (Guided, Undo) or edited by hand (the
// board's brief box, the Stage's words drawer, the Story beats step: the beats re-derive from the new words) sends the new brief,
// its flat lines and the scene prompt exactly as Build the set would write them (bibleWrite), a brief gone sent as null (it clears
// the sheet), then the flag clears. A design with no structured brief still sends its scene prompt once the words change after
// they were read (the draw and the render read the prompt), never on opening alone. Before there is a world there is no sheet.
// That words-only write waits for a pause in the typing (SAVE_MS, as the draft does: it was one write per keystroke), and a pause
// still running is written at once when focus leaves the box (a press elsewhere, Lock included), the page is hidden or closed
// (keepalive, as far as the browser allows), or the editor goes away.
import { useEffect, useRef } from 'react'
import { bibleWrite, BIBLE_LIMITS, clip, tagNames } from './buildCheck'
import { biblePrompt } from './briefText'
import type { SceneCtx } from '../sceneCtx'
import { SAVE_MS } from './useDesign'

export function useV2Save({ s, worldId, bible }: Pick<SceneCtx, 's' | 'worldId' | 'bible'>) {
  const d = s.d
  const { set, say, synced } = s
  const stale = !!d.v2Stale
  // an @tag with no tile is said as the name Build the set gives it (the Develop brief's or the Guided card's), so both agree
  const prompt = clip(biblePrompt(d.brief, d.pieces, tagNames(d)), BIBLE_LIMITS.prompt)
  /** the scene prompt the sheet was last given, or the one the draft was read with (null until it is read) */
  const sent = useRef<string | null>(null)
  const fail = (e: unknown) => say(`The new words were not saved to the scene sheet: ${e instanceof Error ? e.message : String(e)}`)
  useEffect(() => {
    if (!stale || !worldId || !bible) return
    set({ v2Stale: false })
    const w = bibleWrite(d)
    const { brief, lighting, materials, background } = w
    const lines = { ...(lighting !== undefined ? { lighting } : {}), ...(materials !== undefined ? { materials } : {}), ...(background !== undefined ? { background } : {}) }
    sent.current = w.prompt ?? ''
    bible.save({ worldId, prompt: w.prompt, brief: brief ?? null, ...lines }).catch(fail)
  }, [stale, d, worldId, bible, set, say]) // eslint-disable-line react-hooks/exhaustive-deps
  /** the words-only write waiting for the typing to pause, null = none */
  const due = useRef<((keepalive: boolean) => void) | null>(null)
  const flush = (keepalive = false) => { const f = due.current; due.current = null; f?.(keepalive) }
  useEffect(() => {
    if (!synced) return
    if (sent.current === null) { sent.current = prompt; return } // as read: opening a scene writes nothing
    if (stale || prompt === sent.current || !worldId || !bible) { due.current = null; return }
    due.current = (keepalive) => { sent.current = prompt; (keepalive ? bible.save({ worldId, prompt }, { keepalive: true }) : bible.save({ worldId, prompt })).catch(fail) }
    const t = setTimeout(() => flush(), SAVE_MS)
    return () => clearTimeout(t) // a newer word replaces the write; leaving writes it (below)
  }, [synced, prompt, stale, worldId, bible]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const out = () => flush()
    const gone = () => flush(true)
    const hide = () => { if (document.visibilityState === 'hidden') flush(true) }
    document.addEventListener('focusout', out)
    window.addEventListener('pagehide', gone)
    document.addEventListener('visibilitychange', hide)
    return () => { document.removeEventListener('focusout', out); window.removeEventListener('pagehide', gone); document.removeEventListener('visibilitychange', hide); flush() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
