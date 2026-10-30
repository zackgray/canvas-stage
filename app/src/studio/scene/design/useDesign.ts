// The Scene design's free state changes: routes, the two prompts, tags made by hand, pieces, views and panels. Nothing here
// spends; paid calls live in useDesignCalls. The design exists before the world and its Bible do: it is kept locally at once and
// as the project's draft on the server (written SAVE_MS after the last change, read back when Scene opens).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DraftDesign } from '../../../shared/sceneContract'
import type { BriefApi, PieceType } from '../briefApi'
import { appendTag, briefTags, doneRuns, type DoneRun } from './briefText'
import { CAT_OF, CATS, cap, done, lookOf, mkPiece, shownOnBoard, slugStrict, type Piece } from './model'
import { StaleSceneError } from '../../../library/api'
import { refreshScene } from '../../../library/currentScene'
import { renameTag } from './briefV2'
import { tagNames } from './buildCheck'
import { beatPersons, storyBeats, storyPart } from './storyBeats'
import { clearUnsynced, isUnsynced, loadDesign, markUnsynced, reviveDesign, saveDesign, type Design, type PanelId } from './state'

export const SAVE_MS = 600
type DraftIo = Pick<BriefApi, 'loadDraft' | 'saveDraft'>

/** something already made in the project (a saved Cast card): offered by @, used as is when tagged */
export interface LibItem { tag: string; name: string; type: PieceType; look: string | null; cardId?: string }

/** the pieces in the order the board shows them (Cast, Mood, Lighting, Materials); the mood and lighting look-types are words
 *  of the brief now, not tiles, so old saved tiles of those types stay off the board */
export const ordered = (ps: readonly Piece[]) => CATS.flatMap(([c]) => ps.filter((p) => p.onBoard && shownOnBoard(p) && CAT_OF[p.type] === c))

/** `scene`: the library scene this design is (its local copy is kept under its own key) */
export function useDesign(lib: readonly LibItem[], io?: DraftIo, scene: string | null = null) {
  const [d, setD] = useState<Design>(() => loadDesign(scene))
  const [note, setNote] = useState<string | null>(null)
  const ref = useRef(d)
  useLayoutEffect(() => { ref.current = d })
  useEffect(() => { saveDesign(d, scene) }, [d, scene])
  // the server's draft: read once when Scene opens (it wins over the local copy), then written after each change settles
  const [synced, setSynced] = useState(!io)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** another tab wrote this scene's draft (m7): nothing more is saved over it until the page is reloaded */
  const [stale, setStale] = useState(false)
  const fail = useCallback((what: string, e: unknown) => {
    // stale: the other tab's draft wins on reload, so nothing local is waiting to be written
    if (e instanceof StaleSceneError) { setStale(true); setSaveError(e.message); clearUnsynced(scene) } else setSaveError(`${what}: ${e instanceof Error ? e.message : String(e)}`)
  }, [scene])
  useEffect(() => {
    if (!io) return
    let live = true
    // a local copy newer than the server's draft (a tab closed before the last write landed) stands, and is written below
    io.loadDraft().then((saved) => { if (live && saved && !isUnsynced(scene)) setD(reviveDesign(saved as Partial<Design>)) })
      .catch(() => { /* no server draft route (an old server): the local copy stands */ })
      .finally(() => { if (live) setSynced(true) })
    return () => { live = false }
  }, [io, scene])
  /** changes made so far: a write clears the unsynced mark only when no change came after what it sent */
  const changes = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const send = useCallback((keepalive: boolean) => {
    if (!io) return
    const n = changes.current
    io.saveDraft(ref.current as unknown as DraftDesign, keepalive ? { keepalive: true } : undefined)
      .then(() => { if (changes.current === n) clearUnsynced(scene); setSaveError(null); void refreshScene() }, (e: unknown) => fail('The draft was not saved', e))
  }, [io, scene, fail])
  const sendRef = useRef(send)
  useLayoutEffect(() => { sendRef.current = send })
  // a pause that has not run out yet when the page is hidden, closed or left is written now (before the save effect below, so its
  // cleanup on unmount runs first and still finds the pause pending)
  useEffect(() => {
    const flush = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; sendRef.current(true) } }
    const hide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hide)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hide); flush() }
  }, [])
  useEffect(() => {
    if (!io || !synced || stale) return
    timer.current = setTimeout(() => { timer.current = null; send(false) }, SAVE_MS)
    return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  }, [io, synced, stale, d, send])

  const set = useCallback((p: Partial<Design> | ((d: Design) => Partial<Design>)) => {
    changes.current++
    markUnsynced(scene)
    setD((x) => ({ ...x, ...(typeof p === 'function' ? p(x) : p) }))
  }, [scene])
  const say = useCallback((t: string | null) => setNote(t), [])

  /** a library item as a piece of this scene (yours, used as is) */
  const adopt = useCallback((it: LibItem) => set((x) => x.pieces.some((p) => p.tag === it.tag) ? {} : {
    pieces: [...x.pieces, mkPiece(it.tag, it.name, it.type, { state: 'yours', looks: it.look ? [it.look] : [], onBoard: x.phase !== 'empty', ...(it.cardId ? { cardId: it.cardId } : {}) })],
  }), [set])

  /**
   * A hand edit of the brief: a finished @name that names nothing becomes a draft tile (a library one is used as is). A tag makes
   * a tile only when it is committed — the separator that finishes it typed, or it chosen from the @ list: a run this edit only
   * retyped (a letter lands inside "@tends", making "@jtends", "@jutends"…) is the same tag being written, never a new tile, and
   * so is a partial tag that is a prefix of a draft the typing made (the tag mid-delete, "@frame" back to "@f"). A draft the
   * typing made whose tag is gone from the text again — or shrunk to a partial of it mid-delete — drops at once: it names
   * nothing. When the set is built (the sheet's structured brief exists), the story's beats are re-derived from the new words
   * and the sheet is told to sync, so a re-render reads them; an edit that leaves no story keeps the old beats.
   */
  const editBrief = useCallback((text: string) => {
    const x = ref.current
    // a tag the scene already names (a Develop person or prop with no look yet) is said as that name, never a draft tile: a draft
    // would hold Build the set back, and the Stage has no way to approve one
    const known = new Set([...x.pieces.map((p) => p.tag), ...tagNames(x).keys()])
    const before = doneRuns(x.brief)
    /** a tile the typing itself made: no line, no draw, no look — never a drawn or adopted one */
    const madeByTyping = (p: Piece) => p.state === 'draft' && !p.line.trim() && !p.loading && !p.looks.length
    // the longest piece of one tag that also sits in the other: 3+ shared characters over the same span = the same word retyped
    const shared = (a: string, b: string) => {
      let best = 0
      for (let i = 0; i < a.length - best; i++) for (let n = a.length - i; n > best; n--) if (b.includes(a.slice(i, i + n))) { best = n; break }
      return best
    }
    const retyping = (r: DoneRun) => before.some((p) => r.start < p.end && p.start < r.end && shared(r.tag, p.tag) >= 3)
    const made: Piece[] = []
    for (const r of doneRuns(text)) {
      if (known.has(r.tag) || retyping(r)) continue
      if (x.pieces.some((p) => madeByTyping(p) && p.tag.startsWith(r.tag))) continue // a prefix of a draft being deleted: not a new tile
      const it = lib.find((l) => l.tag === r.tag)
      if (it) { adopt(it); known.add(r.tag); continue }
      made.push(mkPiece(r.tag, cap(r.tag), 'person', { onBoard: x.phase !== 'empty' }))
      known.add(r.tag)
    }
    set((y) => {
      // a draft the typing made keeps while the text holds its tag or a prefix of it (a partial tag mid-delete); a drawn or
      // adopted tile never drops here
      const tags = briefTags(text)
      const pieces = [...y.pieces, ...made.filter((p) => !y.pieces.some((q) => q.tag === p.tag))]
        .filter((p) => !(madeByTyping(p) && !tags.some((t) => p.tag.startsWith(t))))
      const next: Partial<Design> = { brief: text, edited: true, pieces }
      if (!y.v2) return next
      const beats = storyBeats(storyPart(text), beatPersons(pieces, y.v2))
      return { ...next, v2: beats.length ? { ...y.v2, beats } : y.v2, v2Stale: true }
    })
    if (made.length) say(`New draft tile ${made.map((p) => `@${p.tag}`).join(' ')}`)
  }, [lib, adopt, set, say])

  const addPiece = useCallback((p: Piece, tag = true) => set((x) => ({ pieces: [...x.pieces, p], brief: tag ? appendTag(x.brief, p.tag) : x.brief })), [set])
  const patchPiece = useCallback((id: string, p: Partial<Piece>) => set((x) => ({ pieces: x.pieces.map((q) => (q.id === id ? { ...q, ...p } : q)) })), [set])
  const removePiece = useCallback((id: string) => set((x) => ({ pieces: x.pieces.filter((p) => p.id !== id), sel: x.sel === id ? null : x.sel })), [set])
  /**
   * A tag rename keeps the brief's chips in step. Returns why it was refused (m3: empty, not a tag, or another tile's), else null;
   * a refused rename changes nothing, the brief's @ref included.
   */
  const retag = useCallback((id: string, raw: string): string | null => {
    const x = ref.current
    const p = x.pieces.find((q) => q.id === id)
    const tag = slugStrict(raw)
    if (!p) return null
    if (!tag) return 'A tag needs a name that starts with a letter, like @market.'
    if (tag === p.tag) return null
    if (x.pieces.some((q) => q.tag === tag)) return `@${tag} is already another tile's tag.`
    set((y) => ({ pieces: y.pieces.map((q) => (q.id === id ? { ...q, tag } : q)), brief: y.brief.replace(new RegExp(`@${p.tag}(?![a-z0-9_-])`, 'g'), `@${tag}`), ...(y.v2 ? { v2: renameTag(y.v2, p.tag, tag) } : {}) }))
    return null
  }, [ref, set])

  /** open a piece from its tile or the brief's chip: it edits in a dialog over the board */
  const openPiece = useCallback((id: string) => set({ sel: id }), [set])
  const closePiece = useCallback(() => set({ sel: null }), [set])
  const approve = useCallback((id: string) => set((x) => {
    const p = x.pieces.find((q) => q.id === id)
    if (!p) return {}
    const state = p.state === 'approved' ? 'draft' as const : 'approved' as const
    const pieces = x.pieces.map((q) => (q.id === id ? { ...q, state } : q))
    // approving moves on to the next draft, so a board is approved in a row of clicks
    const all = ordered(pieces), k = all.findIndex((q) => q.id === id)
    const next = state === 'approved' ? [...all.slice(k + 1), ...all.slice(0, k)].find((q) => q.state === 'draft') : undefined
    return { pieces, sel: next?.id ?? id }
  }), [set])
  /** Approve all: every drawn tile that has a look and is not still drawing (the rest wait) */
  const approveAll = useCallback(() => set((x) => ({ pieces: x.pieces.map((p) => (p.onBoard && shownOnBoard(p) && p.state === 'draft' && !p.loading && lookOf(p) ? { ...p, state: 'approved' as const } : p)) })), [set])
  const togglePanel = useCallback((id: PanelId) => set((x) => ({ panels: { ...x.panels, [id]: !x.panels[id] } })), [set])
  const board = useMemo(() => ordered(d.pieces), [d.pieces])
  const ready = d.phase === 'board' && board.length > 0 && board.every(done)
  return { d, set, note, say, adopt, editBrief, addPiece, patchPiece, removePiece, retag, openPiece, closePiece, approve, approveAll, togglePanel, board, ready, ref, synced, saveError, stale }
}
export type DesignState = ReturnType<typeof useDesign>
