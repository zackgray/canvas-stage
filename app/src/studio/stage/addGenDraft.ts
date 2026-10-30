// The unsent words of "A new prop" (Add a prop), kept per scene for the page's life: the label, Describe it and the ADVANCED parts'
// edits survive Esc, Cancel and ✕ and are back when Add a prop is opened again (owner 2026-10-29: closing threw typed words away).
// Module-level and in memory only, like the Stage's memory (stageMemory.ts); a reload starts empty. Cleared when a candidate is
// placed, or when the words are all emptied by hand (saving an empty draft drops it).
import type { PropParts } from '../../shared/sceneContract'
import { currentSceneId } from '../../library/currentScene'

export interface AddGenDraft { name: string; desc: string; parts: PropParts }

const drafts = new Map<string, AddGenDraft>()
const keyOf = (scene: string | null | undefined) => scene ?? ''

export const addGenDraft = (scene: string | null = currentSceneId()): AddGenDraft | null => drafts.get(keyOf(scene)) ?? null

export function saveAddGenDraft(d: AddGenDraft, scene: string | null = currentSceneId()): void {
  if (!d.name && !d.desc && Object.keys(d.parts).length === 0) drafts.delete(keyOf(scene))
  else drafts.set(keyOf(scene), d)
}

export const clearAddGenDraft = (scene: string | null = currentSceneId()): void => { drafts.delete(keyOf(scene)) }
