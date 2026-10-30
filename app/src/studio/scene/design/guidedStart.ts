// Where Guided starts: the cast the design already has (a drawn or saved one used as is, a draft one to give a look) and each
// stage's description from the developed lines. The brief itself starts empty and assembles from the picks. Pure.
import { castCard, freshGuided, type CastCard, type Guided } from './guided'
import { lookOf } from './model'
import type { Design } from './state'

const CAST = new Set(['person', 'creature', 'group'])

export function initialGuided(d: Design): Guided | null {
  const cast: CastCard[] = d.pieces.filter((p) => CAST.has(p.type)).map((p) => castCard(p.name, p.type as CastCard['type'], p.line,
    p.state !== 'draft' || (p.onBoard && p.looks.length) ? { tag: p.tag, look: lookOf(p), ...(p.cardId ? { cardId: p.cardId } : {}) } : undefined))
  if (!cast.length && !d.lighting && !d.materials) return null
  const g = freshGuided(cast.length ? cast : [castCard()])
  g.st.mood.text = d.lighting
  g.st.mats.text = d.materials
  return g
}
