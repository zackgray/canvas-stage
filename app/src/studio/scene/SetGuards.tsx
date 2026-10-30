// What the scene's set needs said around it (M3, M4): the question before a second build, the note that the brief moved on since
// the set was built, and the way back to an earlier set. All read the scene's facts (src/library); nothing here spends.
import { useState } from 'react'
import { pickSceneWorld, useCurrentScene } from '../../library/currentScene'
import { Ask } from '../ui'

/** the facts the guards read: null until the scene is read */
export function useSetFacts() {
  const v = useCurrentScene().view
  return { setBuilt: !!v?.facts.setBuilt, briefChanged: !!v?.facts.briefChanged, worlds: v?.worlds ?? [], current: v?.worldId ?? null, takes: v?.facts.takes ?? {} }
}

/** M3: in place of the Build button's second press */
export function BuildAsk({ cr, onYes, onNo }: { cr: number; onYes: () => void; onNo: () => void }) {
  return (
    <Ask label="Build the set again" yes={`Build a new set (≈ ${cr} cr)`} no="Keep the current set" testId="build-ask" onYes={onYes} onNo={onNo}>
      This scene already has a set. Building again makes a new one, about {cr} cr. The current set and its takes stay available.
    </Ask>
  )
}

/** M4: the set was built from an earlier brief */
export function StaleSetNote({ onRebuild }: { onRebuild?: () => void }) {
  const { briefChanged } = useSetFacts()
  if (!briefChanged) return null
  return (
    <p className="st-warn" role="status" data-testid="set-stale">
      The brief, lighting, materials or action changed after this set was built, so the set was made from the earlier version.
      {onRebuild && <> <button type="button" className="st-btn" onClick={onRebuild} data-testid="set-stale-rebuild">Go to the board to rebuild</button></>}
    </p>
  )
}

/**
 * (recipe wave) A piece landed in or moved on the set after the approved master was drawn: the master's colours and Klein's
 * place reference describe a set without that change (E137 #6), so the look is drawn again from the set as it stands.
 */
export function piecesMovedSince(setChangedAt: string | null | undefined, masterAt: string | null | undefined): boolean {
  return !!setChangedAt && !!masterAt && Date.parse(setChangedAt) > Date.parse(masterAt)
}

export function PiecesMovedNote({ cr }: { cr: number }) {
  return (
    <p className="st-warn" role="status" data-testid="set-pieces-moved">
      The master was drawn before these pieces moved — redraw the look (≈{cr} cr).
    </p>
  )
}

const when = (t: string) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? t : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

/** M3: a scene that has been built more than once can go back to an earlier set (its takes come with it) */
export function WorldPicker() {
  const { worlds, current, takes } = useSetFacts()
  const [busy, setBusy] = useState(false)
  if (worlds.length < 2) return null
  const earlier = worlds.filter((w) => w.id !== current).reverse()
  return (
    <div className="sd-worlds" data-testid="set-worlds">
      <span className="sd-il">Earlier sets</span>
      {earlier.map((w) => (
        <button type="button" key={w.id} className="st-btn" disabled={busy} data-testid={`set-world-${w.id}`}
          onClick={() => { setBusy(true); void pickSceneWorld(w.id).finally(() => setBusy(false)) }}>
          Go back to the set from {when(w.builtAt)}{takes[w.id] ? ` · ${takes[w.id]} ${takes[w.id] === 1 ? 'take' : 'takes'}` : ''}
        </button>
      ))}
    </div>
  )
}
