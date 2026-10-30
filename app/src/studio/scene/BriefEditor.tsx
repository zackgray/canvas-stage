// The scene brief: read as text with @chips (clicking one opens its piece), edited as text. Typing "@" opens a menu of tiles
// and saved cards with thumbnails; a tag makes a draft tile only when it is committed — a separator, Enter, or a menu pick — never
// per keystroke, and a draft whose tag leaves the text drops at once. A click inside the text box only focuses it: editing ends
// when the press lands outside the card, never on its own timer, and only the panel's title row opens and closes the panel.
// A chip whose tile was deleted turns red. Dropping an image names it and inserts its tag.
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { AtMenu, ChipPop, DropAsk } from './BriefExtras'
import { atRows, type AtRow } from './design/routes'
import { atToken, putTag, runs, type Mark } from './design/briefText'
import { mkPiece, slug, uniqTag, type Piece } from './design/model'
import { Chip } from './parts'
import { SelectionTagPop, type MadeKind } from '../stage/SelectionTagPop'
import { tagFromSelection } from '../stage/wordsTags'
import { useAutoGrow } from '../stage/useAutoGrow'
import { TagHighlight } from '../stage/TagHighlight'
import type { SceneCtx } from './sceneCtx'

const BRIEF_PLACEHOLDER = 'The developed brief appears here, every element an @tag. Type @ to bring in a reference, or drop images here.'

/**
 * bare: a plain always-open text box with no hint line or chips under it (the first-words card); default off.
 * words: the Stage's words drawer (default off): the box grows with its words, shows its @tags as chips while editing, and selected
 * words offer "Make this a character / prop".
 */
export function BriefEditor({ x, testId = 'brief', placeholder = BRIEF_PLACEHOLDER, bare = false, words = false }: { x: SceneCtx; testId?: string; placeholder?: string; bare?: boolean; words?: boolean }) {
  const { s, lib } = x
  const d = s.d
  const [editing, setEditing] = useState(false)
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [pop, setPop] = useState<Piece | null>(null)
  const [drop, setDrop] = useState<{ file: File; preview: string | null } | null>(null)
  const [over, setOver] = useState(false)
  const [sel, setSel] = useState({ start: 0, end: 0 })
  const [made, setMade] = useState<string | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const card = useRef<HTMLDivElement>(null)
  // editing ends only when a press lands outside the card: a click inside the text box — or on its @ menu — never ends it
  useEffect(() => {
    if (!editing) return
    // the box opens with the cursor where the click put it (the end), not at the start
    ta.current?.setSelectionRange(caret, caret)
    const down = (e: MouseEvent) => { if (!card.current?.contains(e.target as Node)) setEditing(false) }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [editing])

  const tok = editing ? atToken(d.brief, caret) : null
  const rows = tok ? atRows(d.pieces, lib, tok.q) : []
  const pick = (r: AtRow) => {
    if (!tok) return
    if (r.lib) s.adopt(r.lib)
    const next = putTag(d.brief, tok.start, caret, r.tag)
    s.editBrief(next.text); setCaret(next.caret)
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(next.caret, next.caret) })
  }
  const chip = (tag: string) => {
    const p = d.pieces.find((q) => q.tag === tag)
    if (!p) { s.say(`@${tag} was deleted. Retype it to make a draft again.`); return }
    if (p.onBoard && d.phase !== 'empty') s.openPiece(p.id)
    else setPop(p)
  }
  // selected words become a draft tile with an @tag (free: nothing is drawn), then its card (a new item, not drawn yet) opens
  const make = (kind: MadeKind) => {
    const r = tagFromSelection(d.brief, sel.start, sel.end, d.pieces.map((p) => p.tag))
    if (!r) return
    s.editBrief(r.text); setCaret(r.caret); setSel({ start: r.caret, end: r.caret })
    s.set((y) => {
      const mine = y.pieces.some((p) => p.tag === r.tag)
      const pieces = mine ? y.pieces.map((p) => (p.tag === r.tag ? { ...p, name: r.name, type: kind } : p)) : [...y.pieces, mkPiece(r.tag, r.name, kind, { onBoard: y.phase !== 'empty' })]
      return { pieces }
    })
    setMade(r.tag)
  }
  useEffect(() => {
    const p = made ? d.pieces.find((q) => q.tag === made) : null
    if (!p) return
    setMade(null)
    setPop(p)
  }, [made, d.pieces]) // eslint-disable-line react-hooks/exhaustive-deps
  const known = (tag: string) => d.pieces.some((p) => p.tag === tag)
  const typeOf = (tag: string) => d.pieces.find((p) => p.tag === tag)?.type

  const onDrop = (e: DragEvent) => {
    setOver(false)
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'))
    if (!f) return
    e.preventDefault()
    setDrop({ file: f, preview: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null })
  }
  const addDropped = async (name: string, type: Piece['type']) => {
    if (!drop) return
    const file = drop.file
    setDrop(null)
    const url = await x.c.upload(file)
    if (!url) return
    const tag = uniqTag(slug(name), d.pieces.map((p) => p.tag))
    s.addPiece(mkPiece(tag, name, type, { state: 'yours', looks: [url], onBoard: d.phase !== 'empty' }))
  }

  useAutoGrow(ta, d.brief, words && (editing || bare || !d.brief.trim()))
  const marks: Mark[] = runs(d.brief).map((r) => ({ ...r, added: false }))
  const showInput = bare || editing || !d.brief.trim()
  return (
    <div ref={card} className={`sd-card${over ? ' over' : ''}`} data-testid={`${testId}-card`}
      onDragOver={(e) => { if ([...(e.dataTransfer?.types ?? [])].includes('Files')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)} onDrop={onDrop}>
      {showInput ? wrapWords(words, <TagHighlight ta={ta} text={d.brief} look={(tag) => ({ type: typeOf(tag), gone: !known(tag) })} />,
        <textarea ref={ta} className="sd-pin" value={d.brief} autoFocus={editing || bare} spellCheck={false} data-testid={`${testId}-input`}
          placeholder={placeholder}
          // an empty box focused (the Stage's Prompt box on a new scene) is being edited: the first letter must not swap it for the view
          onFocus={() => { if (!editing) { setCaret(d.brief.length); setEditing(true) } }}
          onChange={(e) => { s.editBrief(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); setActive(0) }}
          onSelect={(e) => { setCaret(e.currentTarget.selectionStart ?? 0); setSel({ start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 }) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!rows.length) return
              e.preventDefault(); setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length)
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              // no menu rows: Enter commits the half-typed tag itself (a tag is committed, not made per keystroke)
              const fresh = !rows.length && !!tok && /^[a-z]/i.test(tok.q)
              if (!rows.length && !fresh) return
              e.preventDefault()
              if (rows.length) { pick(rows[Math.min(active, rows.length - 1)]); return }
              const next = putTag(d.brief, tok!.start, caret, tok!.q.toLowerCase())
              s.editBrief(next.text); setCaret(next.caret)
              requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(next.caret, next.caret) })
            }
          }} />)
      : (
        <div className="sd-pin view" role="textbox" tabIndex={0} data-testid={`${testId}-view`} onClick={() => { setCaret(d.brief.length); setEditing(true) }}>
          {marks.map((m, i) => m.tag !== undefined
            ? <Chip key={i} tag={m.tag} type={typeOf(m.tag)} gone={!known(m.tag)} added={m.added} onClick={() => chip(m.tag!)} testId={`chip-${m.tag}`} />
            : <span key={i} className={m.added ? 'sd-add' : undefined}>{m.text}</span>)}
        </div>
      )}
      {words && editing && <SelectionTagPop text={d.brief} start={sel.start} end={sel.end} taken={d.pieces.map((p) => p.tag)} onMake={make} />}
      {rows.length > 0 && <AtMenu rows={rows} active={Math.min(active, rows.length - 1)} onPick={pick} />}
      {pop && <ChipPop p={pop} q={d.quality} onClose={() => setPop(null)} />}
      {drop && <DropAsk file={drop.file} preview={drop.preview} onAdd={(n, t) => void addDropped(n, t)} onCancel={() => setDrop(null)} />}
      {!bare && <BriefBar x={x} />}
    </div>
  )
}

/** the Stage's words box (`words`): its @tags shown as chips behind the text box (TagHighlight.tsx); elsewhere the box alone */
const wrapWords = (words: boolean, copy: ReactNode, box: ReactNode) => (words ? <div className="st-hl-wrap">{box}{copy}</div> : box)

/** under the brief: notes and hints */
function BriefBar({ x }: { x: SceneCtx }) {
  const { s } = x
  return (
    <div className="sd-bbar" data-testid="brief-bar">
      <span className="sd-bm">Click a chip to open its piece. Type <b>@name</b> to add a new draft tile.</span>
      {s.note && <span className="sd-chip g" data-testid="brief-note">{s.note}</span>}
    </div>
  )
}
