// Review F4 (wave 3): a prop is drawn front-on in flat light unless its words choose a view or a light. Ordinary prop words that
// only look like one ("a brass rim", "fairy lights", "its lid back on", "from the left post") must keep both defaults: the drawing
// is the picture the 3D piece is built from, and shadows or an odd angle there end up in the mesh.
import { describe, expect, it } from 'vitest'
import { conceptPrompt } from '../conceptGraph.ts'

const FRONT = /seen flat on from the front and standing upright/
const FLAT = /flat even soft light, no shadows/
const prop = (description: string) => conceptPrompt('prop', { description })

describe('a prop keeps the front-on, flat-light defaults', () => {
  it.each([
    'A lantern with a brass rim',
    'A string of fairy lights on a wooden reel',
    'A chest with its lid back on',
    'A jar with its top on',
    'A sign hanging from the left post of a gate',
    'A lit candle in a tin holder',
    'A tail light from a delivery van',
    'A coat with a pocket on the back panel',
  ])('%s', (d) => {
    const p = prop(d)
    expect(p).toMatch(FRONT)
    expect(p).toMatch(FLAT)
  })
})

describe("the writer's own view or light still wins", () => {
  it.each([
    ['A bicycle in side view', true, false],
    ['A bicycle, side-on', true, false],
    ['A kettle seen from the left', true, false],
    ['A bench photographed from above', true, false],
    ['A mailbox seen from behind.', true, false],
    ['A mailbox, from behind', true, false],
    ['A kettle in profile', true, false],
    ['A lamp post, a low-angle shot', true, false],
    ['A vase lit from the left', false, true],
    ['A vase with a rim light along one edge', false, true],
    ['A backlit bottle', false, true],
    ['A crate under bright overhead lights', false, true],
    ['A crate in deep shadow', false, true],
    ['A crate, the warm lighting of a workshop', false, true],
    ['Street lights glint off the wet bonnet', false, true],
  ])('%s', (d, view, light) => {
    const p = prop(d)
    expect(FRONT.test(p)).toBe(!view)
    expect(FLAT.test(p)).toBe(!light)
  })
})
