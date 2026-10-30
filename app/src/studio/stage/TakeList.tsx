// The Stage's take list (coverage, owner 10-28 PM): one compact row of the world's takes in the draw bar, newest first. Each take
// shows its approved first frame (when it has one), its name and where it is: open (being filmed, not locked yet), locked, drawn
// (an approved first frame) or rendered. A click switches to it (takeSwitch.ts: the existing pick, so the still, Render and the
// overlay follow it, and the camera goes to where it starts); the take on show can be renamed and discarded (asked first, the
// existing Discard). + New take starts an open take from what is on screen, as the Camera panel's New take does (newTake.ts: the
// take on show's walk and set copied into the scene, nothing recorded); the open row is the scene's setup, a click brings it back
// on show (openTake.ts, takeShow.ts openSceneTake), and it stays until a take is locked or it is discarded. The takes here stay saved.
import { useState } from 'react'
import { useTicker } from '../../labs/controller/ui/useTicker'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import type { TakeBoardRow } from '../../shared/takeWordsContract'
import { displayName } from '../names'
import { useCurrentTakeId, useMemoryTakeLocked } from '../shoot/currentTake'
import { DISCARD_BUSY, useTakeDiscard } from '../shoot/takeDiscard'
import { refreshBoard, useTakeBoard } from '../shoot/takeBoard'
import { keepsSummary, relockWords } from '../shoot/takeKeeps'
import { renameTake } from '../shoot/takeWordsApi'
import { useLockedTakes } from '../shoot/worldTakes'
import { NEW_TAKE_ASK, NEW_TAKE_TITLE, useNewTake } from '../shoot/newTake'
import { useOpenTake } from '../shoot/openTake'
import { endOpenTake, openSceneTake } from '../shoot/takeShow'
import { Ask } from '../ui'
import { switchTake } from './takeSwitch'
import { useAllKeeps } from './useTakeKeeps'
import './takeList.css'

export const takeLabel = (r: Pick<TakeBoardRow, 'id' | 'name'>) => r.name || displayName(r.id)

export function TakeList({ lab }: { lab: ProjectionLabState }) {
  useTicker(4) // the take being filmed lives in the mutable engine: sample it
  const world = lab.s.source ?? null
  const { rows } = useTakeBoard(world)
  const takes = useLockedTakes(world)
  const cur = useCurrentTakeId()
  const keeps = useAllKeeps(lab)
  const memoryLocked = useMemoryTakeLocked()
  const engine = lab.op.engine
  const d = useTakeDiscard(refreshBoard)
  const [error, setError] = useState<string | null>(null)
  const recording = !!engine.deck.recording
  // a take filmed and not locked yet (or filming now) is the open one, and so is the scene's setup after New take (openTake.ts):
  // it joins the list once it is locked
  const unlocked = !!engine.deck.take && !memoryLocked
  const flagged = useOpenTake(world)
  const nt = useNewTake(lab, unlocked && !recording)
  const open = recording || unlocked || flagged
  // the open row is the one on show: while filming, with a recording in memory, or with no locked take current (the scene's setup)
  const openOn = recording || unlocked || (flagged && !cur)
  if (!world || (!rows.length && !open)) return null
  const go = (id: string) => { const t = takes.find((x) => x.id === id); if (t && !switchTake(engine, t)) setError('Stop filming first.') }
  const back = () => { if (!openOn && !recording) openSceneTake(world) }
  return (
    <div className="st-takelist" data-testid="take-list">
      <span className="st-takelist-label">Takes</span>
      {open && (
        <span className={`st-takerow${openOn ? ' st-takerow-on' : ''}`} data-testid="take-row-open">
          <button type="button" className="st-takerow-pick" data-testid="take-pick-open" aria-pressed={openOn} disabled={recording}
            title={openOn ? "On show: the scene's walk and set, for the next take" : "Back to the new take: the scene's walk and set, as you left them"} onClick={back}>
            <span className="st-takerow-thumb" /><span className="st-takerow-name">New take</span><span className="st-takerow-state">open</span>
          </button>
          {openOn && flagged && !recording && !unlocked && (
            <button type="button" className="st-link" data-testid="take-discard-open" title="Take the new take off the list (the scene's walk and set stay as they are)"
              onClick={() => endOpenTake(world)}>Discard</button>
          )}
        </span>
      )}
      {rows.map((r) => {
        const on = r.id === cur && !openOn
        const k = keeps.get(r.id)
        const relock = k ? relockWords(k) : null
        const kept = k ? keepsSummary(takes.find((x) => x.id === r.id) ?? {}, k) : ''
        return (
          <span key={r.id} className={`st-takerow${on ? ' st-takerow-on' : ''}`} data-testid={`take-row-${r.id}`}>
            <button type="button" className="st-takerow-pick" data-testid={`take-pick-${r.id}`} aria-pressed={on} disabled={recording}
              title={`${on ? 'On show: the first frame and Render use this take' : 'Switch to this take: its camera, first frame and render'}${kept ? `. ${kept}` : ''}`} onClick={() => go(r.id)}>
              {r.thumb ? <img className="st-takerow-thumb" src={r.thumb} alt="" /> : <span className="st-takerow-thumb" />}
              <span className="st-takerow-name">{takeLabel(r)}</span>
              <span className="st-takerow-state" data-testid={`take-state-${r.id}`}>{r.state}</span>
              {relock && <span className="st-takerow-relock" data-testid={`take-relock-${r.id}`} title={`${relock}. Its first frame and renders still open.`}>Lock again</span>}
            </button>
            {on && <TakeRename row={r} onError={setError} />}
            {on && (d.asking === r.id
              ? <Ask label="Discard this take" yes="Discard" no="Keep it" testId={`take-discard-ask-${r.id}`} onYes={() => void d.discard(r.id)} onNo={() => d.ask(null)}>
                Take it off the list? Its stills and renders are kept on disk.</Ask>
              : <button type="button" className="st-link" data-testid={`take-discard-${r.id}`} disabled={d.busy(r.id)} title={d.busy(r.id) ? DISCARD_BUSY : 'Take it off the list (its files are kept)'}
                onClick={() => d.ask(r.id)}>Discard</button>)}
          </span>
        )
      })}
      {nt.asking
        ? <Ask label="Start a new take" yes="New take" no="Cancel" testId="take-add-ask" onYes={nt.confirm} onNo={nt.cancel}>{NEW_TAKE_ASK}</Ask>
        : <button type="button" className="st-btn" data-testid="take-add" disabled={recording || nt.busy} title={NEW_TAKE_TITLE} onClick={nt.press}>+ New take</button>}
      {(error ?? d.error ?? nt.error) && <span className="st-warn" role="alert" data-testid="take-list-error">{error ?? d.error ?? nt.error}</span>}
    </div>
  )
}

/** the take on show's name: a click opens it to type; Enter or leaving saves, Escape keeps the old one, empty = the id's name */
function TakeRename({ row, onError }: { row: TakeBoardRow; onError: (m: string | null) => void }) {
  const [text, setText] = useState<string | null>(null)
  if (text === null) return <button type="button" className="st-link" data-testid={`take-rename-${row.id}`} title="Rename this take" onClick={() => setText(row.name ?? '')}>Rename</button>
  const save = async () => {
    const name = text.trim()
    setText(null)
    if (name === (row.name ?? '')) return
    try { onError(null); await renameTake(row.id, name) } catch (e) { onError(e instanceof Error ? e.message : 'The take could not be renamed.') }
  }
  return (
    <input className="st-takerow-input" data-testid={`take-name-${row.id}`} value={text} autoFocus maxLength={60} placeholder={displayName(row.id)} aria-label="Take name"
      onChange={(e) => setText(e.target.value)} onBlur={() => void save()}
      onKeyDown={(e) => { if (e.key === 'Enter') void save(); else if (e.key === 'Escape') setText(null); e.stopPropagation() }} />
  )
}
