// The scene's name in the top bar, editable in place (the same rename Home's list does: a revision-checked write of the scene).
import { useState } from 'react'
import { DEFAULT_SCENE_NAME, SCENE_NAME_MAX } from '../../shared/libraryContract'
import { renameScene } from '../../library/currentScene'
import './sceneTitle.css'

export function SceneTitle({ name }: { name: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const next = draft?.trim()
    setDraft(null)
    if (next && next !== name) void renameScene(next)
  }
  if (draft === null) {
    return (
      <button type="button" className="st-proj st-proj-edit" data-testid="studio-project" title={name} onClick={() => setDraft(name === DEFAULT_SCENE_NAME ? '' : name)}>
        {name}
      </button>
    )
  }
  return (
    <input className="st-proj st-proj-input" autoFocus value={draft} maxLength={SCENE_NAME_MAX} aria-label="Scene name" placeholder={name} data-testid="scene-title-input"
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null) }} />
  )
}
