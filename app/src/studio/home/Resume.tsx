// Home's Resume list: the user's scenes, newest first. "Remove from list" hides a scene (asked first); nothing is deleted.
import { useState } from 'react'
import type { SceneSummary } from '../../shared/libraryContract'
import { sceneHash } from '../route'
import { Ask } from '../ui'
import { reachedLabel } from './steps'
import { ago } from './when'

interface Props {
  scenes: SceneSummary[]
  onRename: (s: SceneSummary, name: string) => void
  onRemove: (s: SceneSummary) => void
  now?: number
}

export function Resume({ scenes, onRename, onRemove, now }: Props) {
  const [asking, setAsking] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const rename = (s: SceneSummary) => { setEditing(null); if (draft.trim() && draft.trim() !== s.name) onRename(s, draft.trim()) }
  return (
    <ul className="st-resume" data-testid="resume-list">
      {scenes.map((s) => (
        <li key={s.id} className="st-resume-row" data-testid={`resume-${s.id}`}>
          <a className="st-resume-open" href={sceneHash(s.id)} data-testid={`resume-open-${s.id}`}>
            <i className="st-thumb" style={s.thumbnail ? { backgroundImage: `url("${s.thumbnail}")` } : undefined} />
          </a>
          <div className="st-resume-text">
            {editing === s.id
              ? <input className="st-resume-name" autoFocus value={draft} maxLength={80} aria-label="Scene name" data-testid="resume-rename-input"
                  onChange={(e) => setDraft(e.target.value)} onBlur={() => rename(s)}
                  onKeyDown={(e) => { if (e.key === 'Enter') rename(s); if (e.key === 'Escape') setEditing(null) }} />
              : <a className="st-resume-title" href={sceneHash(s.id)} data-testid={`resume-name-${s.id}`}>{s.name}</a>}
            <small data-testid={`resume-meta-${s.id}`}>{reachedLabel(s.stage)} · edited {ago(s.lastEdited, now)}</small>
          </div>
          {asking === s.id
            ? <Ask label="Remove from list" yes="Remove" no="Keep it" testId="remove-ask" onNo={() => setAsking(null)}
                onYes={() => { setAsking(null); onRemove(s) }}>Remove this scene from your list? Nothing is deleted.</Ask>
            : <span className="st-resume-acts">
                <button type="button" className="st-link" onClick={() => { setDraft(s.name); setEditing(s.id) }} data-testid={`resume-rename-${s.id}`}>Rename</button>
                <button type="button" className="st-link" onClick={() => setAsking(s.id)} data-testid={`resume-remove-${s.id}`}>Remove from list</button>
              </span>}
        </li>
      ))}
    </ul>
  )
}
