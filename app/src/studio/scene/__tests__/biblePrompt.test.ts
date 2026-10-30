// The prompt the Bible keeps from a design: element tags stay tags, look tags become their words once (Guided writes the tag and
// then the same words), and a look tile with no words (an upload, a second pick) leaves no empty clause behind.
import { describe, expect, it } from 'vitest'
import { biblePrompt } from '../design/briefText'
import { mkPiece } from '../design/model'

describe('biblePrompt', () => {
  it("Guided's live brief: the location's words once, an upload's empty clause gone, the group a tag", () => {
    const pieces = [
      mkPiece('location', 'The location', 'location', { line: 'A narrow muddy track through a ruined hamlet' }),
      mkPiece('villagers', 'Villagers', 'group', { onBoard: true }),
      mkPiece('mood', 'The mood', 'mood'),
    ]
    expect(biblePrompt('Set in @location, A narrow muddy track through a ruined hamlet. Cast: @villagers. Mood and light: @mood.', pieces))
      .toBe('Set in A narrow muddy track through a ruined hamlet. Cast: @villagers.')
  })
  it("Quick's brief: a look tag becomes its line where it stands; unknown tags are left as words", () => {
    const pieces = [mkPiece('light', 'Light', 'lighting', { line: 'low dusk sun from behind' }), mkPiece('robin', 'Robin', 'person', { onBoard: true })]
    expect(biblePrompt('@robin runs through the trees under @light, past @cart.', pieces)).toBe('@robin runs through the trees under low dusk sun from behind, past cart.')
  })
  it('a tag with no element behind it is said as its name: no tile (its words), a tile not in the scene (its name)', () => {
    // the Bible check refuses a prompt tag with no element, and only tiles in the scene become elements (bibleWrite)
    const pieces = [mkPiece('cook', 'The cook', 'person'), mkPiece('stool', 'Stool', 'prop', { onBoard: true })]
    expect(biblePrompt('@cook sets the @copper_kettle down by the @stool.', pieces)).toBe('The cook sets the copper kettle down by the @stool.')
  })
})
