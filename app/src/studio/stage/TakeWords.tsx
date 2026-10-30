// The take on show's own words, in the words drawer above the scene's (per-shot-prompts, owner 10-28 PM): what this take's draw and
// render read. A new take starts as a copy of the take before it's words (the first take: the words typed before it); typing here
// changes this take only (saved at a pause in the typing, when the box is left, and when it goes away: useTakeWordsSave.ts). The
// drawer names the take under "Prompt" (PromptDrawer.tsx). "Start from…" copies another take's or another scene's words in, a copy and
// never a link. The words underneath (the scene prompt) are never shown by that name, so no "changed since" note or "Update from
// scene" is offered (one-prompt, owner 10-29). A first frame drawn from other words is then
// asked about at Render: redraw it from the new words, or render the new words on it (wordsOnFrame.ts). The box shows its @tags as the
// folded line's chips while it stays a plain text box (TagHighlight.tsx).
import { useRef, useState } from 'react'
import type { TakeBoardRow, WordsSource } from '../../shared/takeWordsContract'
import { displayName } from '../names'
import { useCurrentTakeId } from '../shoot/currentTake'
import { useTakeBoard } from '../shoot/takeBoard'
import { fetchSources } from '../shoot/takeWordsApi'
import { AtMenu, ChipPop } from '../scene/BriefExtras'
import { mkPiece, type Piece } from '../scene/design/model'
import { tagNames } from '../scene/design/buildCheck'
import { useStageScene } from './scene/StageScene'
import { SelectionTagPop, type MadeKind } from './SelectionTagPop'
import { TagHighlight } from './TagHighlight'
import { useAtMenu } from './useAtMenu'
import { useAutoGrow } from './useAutoGrow'
import { useTakeWordsSave } from './useTakeWordsSave'
import { NoTagHint, UnknownTagsNote } from './WordsNotes'
import { tagFromSelection, unknownTags } from './wordsTags'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** the take on show's row, or null (no take on show, or not this world's) */
export function useTakeRowOnShow(worldId: string | null): TakeBoardRow | null {
  const cur = useCurrentTakeId()
  const { rows } = useTakeBoard(worldId)
  return rows.find((r) => r.id === cur) ?? null
}

export function TakeWords({ worldId }: { worldId: string | null }) {
  const row = useTakeRowOnShow(worldId)
  return row ? <TakeWordsBox key={row.id} row={row} /> : null
}

const sourceLabel = (s: WordsSource) => (s.kind === 'scene' ? `Scene: ${s.name ?? s.id}` : `${s.name || displayName(s.id)}${s.scene ? ` (${s.scene})` : ''}`)

function TakeWordsBox({ row }: { row: TakeBoardRow }) {
  const { text, setText, editing, setEditing, leave, writeNow, write, error, setError, waiting } = useTakeWordsSave(row.id, row.words)
  const [sources, setSources] = useState<WordsSource[] | null>(null)
  const [caret, setCaret] = useState({ start: 0, end: 0 })
  const [pop, setPop] = useState<Piece | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const st = useStageScene()
  const taken = st?.x.s.d.pieces.map((p) => p.tag) ?? []
  // the tags the scene answers to: its tiles, and the names its design gives tags without a tile
  const known = st ? [...taken, ...tagNames(st.x.s.d).keys()] : null
  const unknown = known ? unknownTags(text, known) : []
  useAutoGrow(ta, text)
  // the tags as the folded line shows them (PromptDrawer.tsx): a tag with no tile in the scene is a gone (red) chip
  const look = (tag: string) => ({ type: st?.x.s.d.pieces.find((p) => p.tag === tag)?.type, gone: !!st && !taken.includes(tag) })
  // the same "@" pick-list the scene words have
  const at = useAtMenu(text, caret.start, editing, (t, c) => {
    setText(t); setCaret({ start: c, end: c })
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(c, c) })
  })
  // selected words become a draft tile with an @tag in this take's words (free: nothing drawn), then its card opens
  const make = (kind: MadeKind) => {
    const r = tagFromSelection(text, caret.start, caret.end, taken)
    if (!r || !st) return
    const piece = mkPiece(r.tag, r.name, kind, { onBoard: st.x.s.d.phase !== 'empty' })
    st.x.s.addPiece(piece, false)
    setCaret({ start: r.caret, end: r.caret }); setPop(piece)
    writeNow(r.text)
  }
  const loadSources = () => { if (!sources) fetchSources(row.id).then(setSources, (e) => setError(msg(e))) }
  const startFrom = (i: number) => { const s = sources?.[i]; if (s) void write({ takeId: row.id, prompt: s.words, rebase: true }) }
  return (
    <div className="st-takewords" data-testid="take-words">
      <div className="st-takewords-box">
        <div className="st-hl-wrap">
          <textarea ref={ta} data-testid="take-words-input" value={text} readOnly={waiting} aria-busy={waiting} spellCheck={false} placeholder="The words this take is drawn and rendered from"
            onFocus={() => setEditing(true)} onBlur={leave}
            onChange={(e) => { setText(e.target.value); setCaret({ start: e.target.selectionStart ?? 0, end: e.target.selectionEnd ?? 0 }) }}
            onSelect={(e) => setCaret({ start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 })}
            onKeyDown={(e) => { e.stopPropagation(); at.onKey(e) }} />
          <TagHighlight ta={ta} text={text} look={look} fill />
        </div>
        {editing && st && <SelectionTagPop text={text} start={caret.start} end={caret.end} taken={taken} onMake={make} />}
        {at.rows.length > 0 && <AtMenu rows={at.rows} active={at.active} onPick={at.pick} />}
        {pop && st && <ChipPop p={pop} q={st.x.s.d.quality} onClose={() => setPop(null)} />}
      </div>
      <UnknownTagsNote tags={unknown} />
      <NoTagHint brief={text} />
      <div className="st-takewords-row">
        <label>Start from…{' '}
          <select data-testid="take-words-from" value="" onFocus={loadSources} onMouseDown={loadSources} onChange={(e) => startFrom(Number(e.target.value))}
            title="Copies those words into this take (a copy: later edits there do not change this take)">
            <option value="" disabled>{sources === null ? 'another take or scene' : sources.length ? 'pick one to copy' : 'nothing to copy yet'}</option>
            {(sources ?? []).map((s, i) => <option key={`${s.kind}-${s.id}`} value={i}>{sourceLabel(s)}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="st-warn" role="alert" data-testid="take-words-error">{error}</p>}
    </div>
  )
}
