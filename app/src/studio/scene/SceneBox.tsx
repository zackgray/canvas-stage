// The front door: one box at the start of the Brief. The user describes the scene in their own words or pastes a prompt, and one
// priced press (Develop it, the planner's develop call) fills the five steps from it: the place, the light and mood, a draft cast
// card and prop card per thing it names (each still needs its look drawn), the story. The steps stay below it, reachable and
// editable; the box is a shortcut, never a gate. When the steps already hold words it asks before it replaces them.
import { useState } from 'react'
import { Ask, Elapsed, PriceButton } from '../ui'
import { guidedHasWords } from './design/developGuided'
import type { Guided } from './design/guided'
import { DEVELOP_TARGET, developBlock } from './design/useDevelop'
import type { SceneCtx } from './sceneCtx'

/** the box's neutral prompt (Home's box and the Setup panel say the same) */
export const SCENE_BOX_PLACEHOLDER = 'Where it happens, the light, who is in it and what they look like, the things that matter, and what happens. Write it in your own words, or paste a prompt you already have.'
const PLACEHOLDER = SCENE_BOX_PLACEHOLDER

export function SceneBox({ x, g }: { x: SceneCtx; g: Guided }) {
  const { c } = x
  const dv = c.develop
  const [asking, setAsking] = useState(false)
  const text = g.idea?.text ?? ''
  const since = c.busy[DEVELOP_TARGET]
  const why = since ? null : developBlock(text, dv.price, dv.status)
  const go = () => { setAsking(false); dv.press() }
  const press = () => (guidedHasWords(g) ? setAsking(true) : go())
  const notes = g.idea?.notes
  return (
    <section className="sd-box" data-testid="scene-box">
      <h2>Describe your scene, or paste a prompt</h2>
      <textarea value={text} placeholder={PLACEHOLDER} spellCheck={false} disabled={!!since} data-testid="scene-box-text"
        onChange={(e) => { setAsking(false); dv.setIdea(e.target.value) }} />
      <div className="sd-boxf">
        {asking ? (
          <Ask label="Replace the steps" yes="Replace them" no="Keep mine" testId="scene-box-ask" onYes={go} onNo={() => setAsking(false)}>
            This will replace what is in the five steps with what Develop finds in your text. Cast and prop cards you already drew are kept.
          </Ask>
        ) : (<>
          <span className="sd-cnt" data-testid="scene-box-why">
            {since ? 'Reading your text and filling the steps (about a minute)…' : why ?? 'Fills the five steps below for you to check and change.'}
          </span>
          {since ? <Elapsed since={since} /> : null}
          <PriceButton primary={!why && !since && !notes}verb={since ? 'Developing…' : 'Develop it'} price={dv.price} disabled={!!why || !!since} testId="scene-box-develop"
            title={why ?? `One planner call (${dv.price} cr; twice that if it has to try again). Nothing is drawn: each cast card still needs its look.`} onClick={press} />
        </>)}
      </div>
      {notes && (
        <div className="sd-boxn" data-testid="scene-box-filled">
          <p>Filled in from your text. Check each step below, then draw a look for each cast card.</p>
          {notes.length > 0 && <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}
      <p className="sd-boxor">or write it step by step below</p>
    </section>
  )
}
