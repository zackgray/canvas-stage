// "In this scene", on the Setup panel (a scene with no set yet): the people and the props the scene names, as the Guided cards
// Develop (or the user) made. Each is a name and its words, editable and removable; nothing here draws. A person's look is made on
// the Stage once the set is built (The subject's panel); a prop is placed as a stand-in by Build the set, and gets its look (and
// its 3D build) from the Stage's Add. Every change goes through the Stage's one design copy.
import { useState } from 'react'
import { castCard, propCard, propsOf, type CastCard, type Guided, type PropCard } from '../../scene/design/guided'
import type { SceneCtx } from '../../scene/sceneCtx'

/** a card shown: one with a name or words, or one added here (a blank card a fresh scene starts with is not listed) */
const shown = (c: { id: string; name: string; desc: string }, added: ReadonlySet<string>) => !!(c.name.trim() || c.desc.trim()) || added.has(c.id)

function Card({ kind, id, name, desc, made, onName, onDesc, onRemove }: {
  kind: 'person' | 'prop'; id: string; name: string; desc: string; made?: boolean
  onName: (v: string) => void; onDesc: (v: string) => void; onRemove: () => void
}) {
  return (
    <li className="st-setup-card" data-testid={`setup-${kind}-${id}`}>
      <input value={name} placeholder={kind === 'person' ? 'Their name or role' : 'What it is'} aria-label="Name" spellCheck={false}
        disabled={made} data-testid={`setup-${kind}-name-${id}`} onChange={(e) => onName(e.target.value)} />
      <textarea value={desc} placeholder={kind === 'person' ? 'What they look like' : 'What it looks like, what it is made of'} aria-label="Words"
        disabled={made} data-testid={`setup-${kind}-desc-${id}`} onChange={(e) => onDesc(e.target.value)} />
      {!made && <button type="button" className="st-btn st-setup-x" data-testid={`setup-${kind}-remove-${id}`} onClick={onRemove}>Remove</button>}
    </li>
  )
}

export function SetupCards({ x, g }: { x: SceneCtx; g: Guided }) {
  const { c } = x
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set())
  const people = g.cast.filter((k) => shown(k, added))
  const props = propsOf(g).filter((k) => shown(k, added))
  const add = (k: CastCard | PropCard, into: 'cast' | 'props') => {
    setAdded((s) => new Set([...s, k.id]))
    c.setG((y) => (into === 'cast' ? { ...y, cast: [...y.cast, k as CastCard] } : { ...y, props: [...propsOf(y), k as PropCard] }))
  }
  const dropCast = (id: string) => c.setG((y) => ({ ...y, cast: y.cast.filter((k) => k.id !== id) }))
  const dropProp = (id: string) => c.setG((y) => ({ ...y, props: propsOf(y).filter((k) => k.id !== id) }))
  return (
    <section className="st-scene-card" data-testid="setup-cards">
      <h2>In this scene</h2>
      <h3>People</h3>
      <p className="st-muted">Their look is made here once the set is built.</p>
      <ul className="st-setup-list" data-testid="setup-people">
        {people.map((k) => (
          <Card key={k.id} kind="person" id={k.id} name={k.name} desc={k.desc} made={!!k.fixed}
            onName={(v) => c.patchCard(k.id, { name: v })} onDesc={(v) => c.patchCard(k.id, { desc: v })} onRemove={() => dropCast(k.id)} />
        ))}
      </ul>
      <button type="button" className="st-btn" data-testid="setup-add-person" onClick={() => add(castCard(), 'cast')}>+ Someone</button>
      <h3>Props</h3>
      <p className="st-muted">Placed as stand-ins; give one a look on the Stage to build it in 3D.</p>
      <ul className="st-setup-list" data-testid="setup-props">
        {props.map((k) => (
          <Card key={k.id} kind="prop" id={k.id} name={k.name} desc={k.desc}
            onName={(v) => c.patchProp(k.id, { name: v })} onDesc={(v) => c.patchProp(k.id, { desc: v })} onRemove={() => dropProp(k.id)} />
        ))}
      </ul>
      <button type="button" className="st-btn" data-testid="setup-add-prop" onClick={() => add(propCard(), 'props')}>+ A prop</button>
    </section>
  )
}
