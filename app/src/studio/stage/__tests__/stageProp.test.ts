// A drawn or uploaded candidate picked on the Stage becomes the scene's own prop (stageProp.ts, Fable F2): an approved prop tile in
// the Stage's one design with the candidate as its look, under a tag unique in the scene, its save landed; then the labelled
// stand-in carrying pieceTag prop:<tag> at the marked spot, then its Bible element, then its one build — in that order, each
// waiting for the one before. A refused save is said in words, its tile taken back out, and nothing is placed or built.
import { describe, expect, it, vi } from 'vitest'
import type { Piece } from '../../scene/design/model'
import { placeStageProp, stagePropTag, UPLOAD_DESC, type StagePropDeps } from '../stageProp'

const CART = { tag: 'cart', name: 'Cart', type: 'prop', state: 'approved', looks: ['/a.png'], look: 0, line: '', onBoard: true } as unknown as Piece
const world = { id: 'loc-1', plan: { kit: [{ pieceTag: 'prop:cart2' }, {}] } }

function deps(saved: (id: string) => Promise<void> = async () => {}) {
  const calls: string[] = []
  const pieces: Piece[] = [CART]
  const d = {
    design: {
      pieces: () => pieces,
      add: vi.fn((t: Piece) => { calls.push('add'); pieces.push(t) }),
      drop: vi.fn((id: string) => { calls.push('drop'); pieces.splice(pieces.findIndex((p) => p.id === id), 1) }),
      saved: vi.fn(async (id: string) => { calls.push('saved'); await saved(id) }),
    },
    bible: { putElement: vi.fn(async () => { calls.push('element'); return { bible: null, running: null } }) },
    place: vi.fn(async () => { calls.push('place'); return true }),
    build: vi.fn(() => { calls.push('build') }),
  }
  return { d: d as unknown as StagePropDeps & typeof d, calls, pieces }
}

describe('a picked Stage candidate becomes a prop of the scene', () => {
  it('its tag is its name, made unique against the design tiles, the set’s props and the Bible’s elements', () => {
    expect(stagePropTag('Cart', [{ tag: 'cart' }], [{ pieceTag: 'prop:cart2' }], ['cart3'])).toBe('cart4')
    expect(stagePropTag('Old Lantern', [], [], [])).toBe('old-lantern')
  })

  it('the tile into the design, its save landed, then the tagged stand-in at the spot, then its element, then its one build', async () => {
    const { d, calls, pieces } = deps()
    const tag = await placeStageProp(d, { world, name: 'Cart', look: '/c/1.png', desc: 'a green hand cart', at: [1, 2], elementTags: ['cart3'] })
    expect(tag).toBe('cart4')
    expect(calls).toEqual(['add', 'saved', 'place', 'element', 'build'])
    expect(pieces).toHaveLength(2)
    expect(pieces[1]).toMatchObject({ tag: 'cart4', name: 'Cart', type: 'prop', state: 'approved', looks: ['/c/1.png'], look: 0, line: 'a green hand cart', onBoard: true })
    expect(d.design.saved).toHaveBeenCalledWith(pieces[1].id)
    expect(d.place).toHaveBeenCalledWith('crates', [1, 2], 'Cart', 'prop:cart4')
    expect(d.bible.putElement).toHaveBeenCalledWith({ worldId: 'loc-1', element: { tag: 'cart4', kind: 'prop', refs: ['/c/1.png'], line: 'a green hand cart' } })
    expect(d.build).toHaveBeenCalledWith('loc-1', 'cart4')
  })

  it('an upload’s words are its label, not "Uploaded as is."', async () => {
    const { d, pieces } = deps()
    await placeStageProp(d, { world, name: 'Stool', look: '/u/1.png', desc: UPLOAD_DESC, at: [0, 0], elementTags: [] })
    expect(pieces[1].line).toBe('Stool')
  })

  it('a save the design refused: said in words, the tile taken back out, nothing placed, nothing built', async () => {
    const { d, calls, pieces } = deps(async () => { throw new Error('the draft was not saved: the disk is full, try again') })
    await expect(placeStageProp(d, { world, name: 'Cart', look: '/c/1.png', desc: 'x', at: [1, 2], elementTags: [] })).rejects.toThrow(/disk is full, try again/)
    expect(calls).toEqual(['add', 'saved', 'drop'])
    expect(pieces).toEqual([CART])
    expect(d.build).not.toHaveBeenCalled()
  })

  it('a stand-in the set refused: the tile taken back out, nothing built', async () => {
    const { d, pieces } = deps()
    d.place.mockResolvedValue(false)
    await expect(placeStageProp(d, { world, name: 'Cart', look: '/c/1.png', desc: 'x', at: [1, 2], elementTags: [] })).rejects.toThrow(/stand-in, try again/)
    expect(pieces).toEqual([CART])
    expect(d.build).not.toHaveBeenCalled()
  })

  it('an element refusal leaves the prop placed and building (the build does not need it)', async () => {
    const { d } = deps()
    d.bible.putElement.mockRejectedValue(new Error('no bible'))
    await placeStageProp(d, { world, name: 'Cart', look: '/c/1.png', desc: 'x', at: [1, 2], elementTags: [] })
    expect(d.build).toHaveBeenCalledTimes(1)
  })
})
