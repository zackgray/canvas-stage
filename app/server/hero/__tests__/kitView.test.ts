// The kit still's draw names only what the opening camera sees, plus its angle and lens feel (fix 2026-10-24: take 2, a 5 m crane on
// 84 mm looking down with his head cut off, came back as an eye-level frontal still with a palisade, tents and fire not in frame).
import { describe, expect, it } from 'vitest'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { buildHeroGraph } from '../graph.ts'
import { buildDrawPrompt } from '../kitStillPrompt.ts'
import { headingWords, kitView } from '../kitView.ts'
import { NODES } from '../spec.ts'

/** take-2026-10-23T15-39-24-203's frame 0: 5 m up, 84 mm, pitched 35° down onto the walk's start */
const CRANE = { position: [-4.9903, 5, -9.3003], quaternion: [-0.2604, -0.47632, -0.15011, 0.8263], focal: 83.84 }
/** the spike's master: chest height on the walk, 24 mm, looking down -z */
const MASTER = { position: [0.6, 1.5, -7.7], quaternion: [0, 0, 0, 1], focal: 24 }
const START: [number, number] = [0.6, -12.5]
const CAST = { name: 'Sloane', description: 'a woman in a navy suit' }

describe('kitView: what the opening camera sees', () => {
  it('the crane sees only spears, from high above on a long lens, his head cut by the top edge', () => {
    const v = kitView(BATTLEFIELD, START, CRANE)
    expect(v.kinds).toEqual(['spear'])
    expect(v.camera).toMatch(/high above.*5 metres up.*looking steeply down.*long telephoto/)
    expect(v.framing).toMatch(/their head cut off by the top edge/)
  })
  it('the master sees the palisade, fire, fences and tents, at eye level on a wide lens, him whole', () => {
    const v = kitView(BATTLEFIELD, START, MASTER)
    expect(v.kinds).toEqual(expect.arrayContaining(['palisade', 'fire', 'fence', 'tent']))
    expect(v.camera).toMatch(/eye level.*wide-angle/)
    expect(v.framing).toMatch(/whole/)
  })
})

describe('kitView: a foliage tree counts by its crown (prompt wave join)', () => {
  it('a tree whose trunk is below the frame is still seen by its crown (TOP knows the tree kind)', () => {
    const tree = { kind: 'tree', at: [0, -40] as [number, number], args: [3, 6, 4] }
    const LEVEL = { position: [0, 6, 0], quaternion: [0, 0, 0, 1], focal: 200 } // a 200 mm level look 6 m up: the frame spans ~4-8 m at 40 m
    expect(kitView({ ...BATTLEFIELD, kit: [tree] }, undefined, LEVEL).kinds).toEqual(['tree'])
  })
})

describe('kitView on the recipe still (generated pieces, angle, heading)', () => {
  const train = { kind: 'steam_train', at: [0.6, -20] as [number, number], glb: { url: '/x.glb' }, pieceTag: 'prop:steam_train' }
  const plan = { ...BATTLEFIELD, kit: [...BATTLEFIELD.kit, train] }
  it('a generated piece in frame counts by its plain-noun kind and comes back as a piece (its pieceTag kept)', () => {
    const v = kitView(plan, START, MASTER)
    expect(v.kinds).toContain('steam_train')
    expect(v.pieces?.find((k) => k.kind === 'steam_train')?.pieceTag).toBe('prop:steam_train')
    expect(kitView(plan, START, CRANE).kinds).not.toContain('steam_train') // out of the crane's frame
  })
  it('the angle sentence is empty at eye level and says the crane; the walk heads towards or away from the camera', () => {
    expect(kitView(BATTLEFIELD, START, MASTER).angle).toBe('')
    expect(kitView(BATTLEFIELD, START, CRANE).angle).toMatch(/^Seen from high above, about 5 metres up, looking steeply down\.$/)
    expect(headingWords([[0, -20], [0, 4]], { position: [0, 1.6, 4], quaternion: [0, 0, 0, 1], focal: 50 })).toBe('towards us')
    expect(headingWords([[0, 4], [0, -20]], { position: [0, 1.6, 8], quaternion: [0, 0, 0, 1], focal: 50 })).toBe('away from us')
    expect(headingWords([[-5, 0], [5, 0]], { position: [0, 1.6, 8], quaternion: [0, 0, 0, 1], focal: 50 })).toBe('across the frame')
  })
})

describe('the still draw with a view', () => {
  const draw = (view: ReturnType<typeof kitView> | null, focal?: number) => buildDrawPrompt({ bible: null, plan: BATTLEFIELD, cast: CAST, view, focal })
  it('names no piece and no fire outside the frame, and carries the angle sentence', () => {
    const p = draw(kitView(BATTLEFIELD, START, CRANE), CRANE.focal)
    expect(p).toMatch(/spear/)
    expect(p).not.toMatch(/palisade|tents|wagon|cart|flame|fire|burning/i)
    expect(p).toMatch(/looking steeply down/)
  })
  it('a view that sees the fire may name it; without a view the plan\'s pieces are named', () => {
    expect(draw(kitView(BATTLEFIELD, START, MASTER))).toMatch(/\bfires?\b/) // several in view read as "fires" (debris fix)
    expect(draw(null)).toMatch(/palisade/)
  })
})

describe('the hero graph', () => {
  it('a kit take feeds the face card lighter than the frame; the default stays 1 MP', () => {
    const mp = (g: ReturnType<typeof buildHeroGraph>, k: string) => (g[`${k}_s`].inputs as { megapixels: number }).megapixels
    const kit = buildHeroGraph({ prompt: 'x', picks: [{ id: 'h', seed: 1 }], prefix: 'p', faceMegapixels: 0.5 })
    const pano = buildHeroGraph({ prompt: 'x', picks: [{ id: 'h', seed: 1 }], prefix: 'p' })
    expect([mp(kit, NODES.opening), mp(kit, NODES.face), mp(pano, NODES.face)]).toEqual([1, 0.5, 1])
  })
})
