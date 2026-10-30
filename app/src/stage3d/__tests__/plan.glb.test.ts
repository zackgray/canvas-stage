// The plan gate for generated pieces (recipe wave): a glb item is accepted with a plain-noun kind (not a KIT key) and a mesh under
// /lab-assets only; it skips the KIT lookup and the corridor check; anything else about it is refused by name, and the repairer
// keeps a readable one whole and drops a broken one. The piece-kind table sizes nouns.
import { describe, expect, it } from 'vitest'
import { parsePlan, repairPlan } from '../plan.ts'
import { pieceKindOf, pieceNounOf, DEFAULT_PIECE_KIND } from '../pieceKinds.ts'
import { PLANS } from '../presets.ts'

const URL = '/lab-assets/locations/loc-x/pieces/engine/p-1/mesh.glb'
const glbItem = (o: Record<string, unknown> = {}, g: Record<string, unknown> = {}) =>
  ({ kind: 'steam locomotive', at: [0, -10], pieceTag: 'prop:engine', glb: { url: URL, yawOffsetDeg: 90, unitScale: 8.5, ...g }, ...o })
const withKit = (...kit: unknown[]) => ({ ...JSON.parse(JSON.stringify(PLANS['open-field-day'])), kit })
const errorsOf = (raw: unknown) => { const r = parsePlan(raw); return r.ok ? '' : r.errors.join('\n') }

describe('generated pieces in a plan', () => {
  it('a glb item parses with a plain-noun kind, even standing in the walk corridor (it has no KIT footprint)', () => {
    expect(errorsOf(withKit(glbItem(), glbItem({ kind: 'platform', pieceTag: 'prop:platform' }, { massingUrl: URL.replace('mesh', 'massing'), sink: 0.66 })))).toBe('')
  })

  const cases: [string, unknown, RegExp][] = [
    ['another origin', glbItem({}, { url: 'https://evil.example/x.glb' }), /glb\.url: must be a \.glb path under \/lab-assets\//],
    ['a path out of the assets', glbItem({}, { url: '/lab-assets/../secret.glb' }), /glb\.url/],
    ['not a glb', glbItem({}, { url: '/lab-assets/x.png' }), /glb\.url/],
    ['a bad massing url', glbItem({}, { massingUrl: 'file:///c/x.glb' }), /glb\.massingUrl/],
    ['unit scale out of range', glbItem({}, { unitScale: 0 }), /glb\.unitScale/],
    ['sink out of range', glbItem({}, { sink: 9 }), /glb\.sink/],
    ['an unknown glb field', glbItem({}, { texture: 'x' }), /glb: unknown field "texture"/],
    ['a kind that is not a noun', glbItem({ kind: 'Steam Locomotive!' }), /kind: a generated piece's kind is a plain lower-case noun/],
    ['args on a glb', glbItem({ args: [1] }), /args: a generated piece takes no args/],
    ['a pieceTag that is not a prop', glbItem({ pieceTag: 'hero' }), /pieceTag: must be "prop:<tag>"/],
    ['a pieceTag with capitals', glbItem({ pieceTag: 'prop:Engine' }), /pieceTag/],
  ]
  for (const [name, item, re] of cases) it(`refused: ${name}`, () => expect(errorsOf(withKit(item))).toMatch(re))

  it('a code-built kind is still checked against the KIT (no glb, unknown kind)', () => {
    expect(errorsOf(withKit({ kind: 'steam locomotive', at: [9, -10] }))).toMatch(/kind: unknown kind "steam locomotive"/)
  })

  it('repair keeps a readable glb item whole and drops a broken one', () => {
    const { plan, notes } = repairPlan(withKit(glbItem(), glbItem({ pieceTag: 'prop:b' }, { url: 'https://x/y.glb' })))
    expect(plan.kit).toHaveLength(1)
    expect(plan.kit[0]).toEqual({ kind: 'steam locomotive', at: [0, -10], pieceTag: 'prop:engine', glb: { url: URL, yawOffsetDeg: 90, unitScale: 8.5 } })
    expect(notes.join('\n')).toMatch(/kit\[1\]: generated piece "steam locomotive" is not readable, dropped/)
    expect(parsePlan(plan).ok).toBe(true)
  })
})

describe('piece kinds', () => {
  it('sizes nouns from E137 (locomotive ~10 m, lamp post 3.8 m, trunk 0.9 m) and sinks walk-on ones', () => {
    expect(pieceKindOf('steam locomotive').size).toBe(10)
    expect(pieceKindOf('platform lamp post').size).toBe(3.8)
    expect(pieceKindOf('leather trunk').size).toBe(0.9)
    expect(pieceKindOf('station platform under a canopy').sinkFrac).toBeGreaterThan(0)
    expect(pieceKindOf('luggage cart').size).toBe(1.8) // a cart, not luggage
    expect(pieceKindOf('weathervane')).toBe(DEFAULT_PIECE_KIND)
  })
  it('a tile name becomes a plain noun', () => {
    expect(pieceNounOf('Steam Locomotive!')).toBe('steam locomotive')
    expect(pieceNounOf('  Café   kiosk ')).toBe('cafe kiosk')
    expect(pieceNounOf('!!!')).toBeNull()
  })
})
