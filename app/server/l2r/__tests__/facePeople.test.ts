// Who a face pass can fix: every staged person (the hero by perf.castId, each extra bound to a Bible cast tag), the card face they
// must end up with, and why a person is not offered (no ID pass, no card face, a shared ID colour, too small, already big).
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { peopleFrom, type PeopleInput } from '../facePeople.ts'

const bible = { worldId: 'w', version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't',
  elements: [{ tag: 'tom', kind: 'cast', cardId: 'tom', refs: [], line: '' }, { tag: 'crate', kind: 'prop', refs: [], line: '' }] } as unknown as BibleRecord
const face = (id: string) => ({ cardId: id, name: id.toUpperCase(), description: `the ${id} card`, faceFile: `/f/${id}.png` })
const base = (o: Partial<PeopleInput> = {}): PeopleInput => ({ castId: 'mara', extras: [{ variant: 2 }, { tag: 'tom', variant: 1 }, { tag: 'crate', variant: 3 }], bible,
  colors: { hero: [255, 0, 0], 'extra:0:2': [0, 255, 150], 'extra:1:1': [0, 200, 60], 'extra:2:3': [60, 160, 0] },
  heads: { hero: 50, 'extra:1:1': 30, 'extra:2:3': 25 }, faces: { mara: face('mara'), tom: face('tom') }, depth: true, ...o })

describe('peopleFrom', () => {
  it('the hero and each extra bound to a cast tag; an unbound extra is background', () => {
    const p = peopleFrom(base())
    expect(p.map((x) => x.subject)).toEqual(['hero', 'extra:1:1', 'extra:2:3'])
    expect(p[0]).toMatchObject({ name: 'MARA', faceFile: '/f/mara.png', color: [255, 0, 0], headPx: 50, small: true, why: null })
    expect(p[1]).toMatchObject({ name: 'TOM', why: null })
    expect(p[2].why).toMatch(/@crate is not a cast card/)
  })
  it('says why a person is not offered', () => {
    expect(peopleFrom(base({ colors: null }))[0].why).toMatch(/no ID pass/)
    expect(peopleFrom(base({ depth: false }))[0].why).toMatch(/kept no depth/)
    expect(peopleFrom(base({ faces: { mara: null } }))[0].why).toMatch(/no face image/)
    expect(peopleFrom(base({ heads: { hero: 400 } }))[0]).toMatchObject({ small: false, why: expect.stringMatching(/Big enough/) })
    expect(peopleFrom(base({ heads: { hero: 8 } }))[0].why).toMatch(/Too small/)
    expect(peopleFrom(base({ heads: {} }))[0].why).toMatch(/Not seen/)
    const twins = base({ colors: { hero: [255, 0, 0], 'extra:1:1': [255, 0, 0] } })
    expect(peopleFrom(twins)[0].why).toMatch(/Shares its ID colour/)
  })
  it('no one cast to play the performer: the hero is still staged (the judge shows them too), listed and not offered, saying why', () => {
    const p = peopleFrom(base({ castId: null }))
    expect(p.map((x) => x.subject)).toEqual(['hero', 'extra:1:1', 'extra:2:3'])
    expect(p[0]).toMatchObject({ name: 'the performer', why: expect.stringMatching(/No cast card plays the performer/) })
  })
})
