// Review F13: a stand-in's label (its prop's line) carries sizes; the size shaped the clay, so no image prompt names it. Pure.
import { describe, expect, it } from 'vitest'
import { sizeless } from '../sizeless.ts'
import { buildDrawPrompt, type StillPromptParts } from '../../hero/kitStillPrompt.ts'

describe('sizeless', () => {
  it('drops size phrases in every common shape and keeps the words', () => {
    expect(sizeless('A white-painted hive, 1.2 m tall, iron hoops')).toBe('A white-painted hive, iron hoops')
    expect(sizeless('a 3-metre pole with a flag')).toBe('a pole with a flag')
    expect(sizeless('an oak table about 2 x 1 m, worn top')).toBe('an oak table, worn top')
    expect(sizeless('a crate (40 cm across) of apples')).toBe('a crate of apples')
    expect(sizeless('a 6 ft ladder')).toBe('a ladder')
    expect(sizeless('a 1.2-metre-tall barrel')).toBe('a barrel')
  })
  it('leaves text with no size alone, numbers that are not sizes included', () => {
    expect(sizeless('two baskets in a row, 10 frames inside')).toBe('two baskets in a row, 10 frames inside')
    expect(sizeless('2 in a row')).toBe('2 in a row')
    expect(sizeless(undefined)).toBe('')
  })
})

describe('a stand-in label with sizes never reaches an image prompt', () => {
  // the new stand-in's own label is covered in planner/__tests__/propStandIns.test.ts (sized from the words, label without them)
  it('an older plan whose label kept its size: the still and master name the thing only', () => {
    const parts: StillPromptParts = { bible: null, cast: { name: 'Ana', description: 'A woman in a white suit' },
      plan: { sentence: 'An orchard.', kit: [{ kind: 'barrels', pieceTag: 'prop:hive', label: 'A white-painted hive, 1.2 m tall, iron hoops' }] } as never,
      view: null, figures: null, focal: 50 }
    for (const t of [buildDrawPrompt(parts), buildDrawPrompt({ ...parts, mode: 'master' })]) {
      expect(t).toMatch(/a white-painted hive, iron hoops/)
      expect(t).not.toMatch(/1\.2|\bm tall/)
    }
  })
})
