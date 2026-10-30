// F2 (prompt-wave fix pass): a world built before the v2 brief (no `brief` on its Bible) whose scene prompt the Guided stepper wrote
// with its labels ("Set in …", "Cast: @…", "Materials: …"). The no-brief still and the master read that prompt for their place; the
// labels must not reach the master (the no-words fallback, by the same unlabel the render uses). Since the stage-only review's F1 the
// still's scene words are the user's own and go whole, labels included (nothing writes the stepper's labels any more). Pure; nothing paid.
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { masterPrompt } from '../../bible/masterDraw.ts'
import { buildDrawPrompt } from '../kitStillPrompt.ts'

const GUIDED: BibleRecord = {
  worldId: 'loc-x', version: 2, prompt: 'Set in An old apple orchard. Cast: @keeper. Materials: @hive.', master: null, candidates: [],
  lighting: 'Soft light from the left.', materials: '', extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't',
  elements: [{ tag: 'keeper', kind: 'cast', cardId: 'kp', refs: [], line: '' }, { tag: 'hive', kind: 'prop', refs: [], line: '' }],
} as BibleRecord

describe('F2: the no-brief still and master never send a Guided label', () => {
  it('the still with scene words: the words are the user\'s and go as written, labels included (stage-only review F1)', () => {
    const t = buildDrawPrompt({ bible: GUIDED, plan: { sentence: BATTLEFIELD.sentence, kit: BATTLEFIELD.kit },
      cast: { cardId: 'kp', name: 'Keeper', description: 'An old woman in a straw hat' }, view: null, action: 'walking towards us', focal: 35 })
    // stage-only: the scene words lead (tags in words, nothing cut: nothing writes the stepper's labels any more, so a "Set in …" here
    // is the user's own); the tag is replaced by the card, no second card block; the motion word is not a clip's own pose, so not said
    expect(t).toMatch(/^Set in An old apple orchard\. Cast: an old woman in a straw hat\. Materials: the hive\./)
    expect(t).not.toMatch(/Keeper:|A photograph\./)
  })
  it('the master: "Photo of an old apple orchard."', () => {
    const t = masterPrompt(GUIDED, BATTLEFIELD)
    expect(t).toMatch(/^Photo of an old apple orchard\./)
    expect(t).not.toMatch(/Set in|Cast:|Materials:/)
  })
})
