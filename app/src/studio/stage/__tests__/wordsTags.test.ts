// The words box's tag helpers: tags the scene lacks, and selected words turned into an @tag. Pure.
import { describe, expect, it } from 'vitest'
import { tagFromSelection, unknownNote, unknownTags } from '../wordsTags'

describe('tags the scene lacks', () => {
  it('lists, in order and once, the tags the words name that nothing answers to', () => {
    expect(unknownTags('@ana meets @old-man and @ana again, @crate too', ['ana', 'crate'])).toEqual(['old-man'])
    expect(unknownTags('no tags here', [])).toEqual([])
  })
  it('says it in plain words, singular and plural', () => {
    expect(unknownNote(['old-man'])).toMatch(/^@old-man is not in this scene/)
    expect(unknownNote(['a', 'b'])).toMatch(/^@a, @b are not in this scene/)
  })
})

describe('selected words become an @tag', () => {
  const text = 'The old keeper walks past a lantern at dusk.'
  it('replaces the selection, leaving a leading article outside the tag', () => {
    const at = text.indexOf('The old keeper')
    const r = tagFromSelection(text, at, at + 'The old keeper'.length, [])!
    expect(r.text).toBe('The @old-keeper walks past a lantern at dusk.')
    expect(r.tag).toBe('old-keeper')
    expect(r.name).toBe('Old keeper')
    expect(r.caret).toBe('The @old-keeper '.length) // past the tag, so the @ pick-list stays shut
    expect(tagFromSelection('a lantern', 2, 9, [])!.text).toBe('a @lantern ') // a tag at the very end gets its space
  })
  it('keeps the tag unique among the scene tags', () => {
    expect(tagFromSelection('a lantern', 2, 9, ['lantern'])!.tag).toBe('lantern2')
  })
  it('offers nothing for an empty selection, a sentence, a line break, digits only, or words already part of a tag', () => {
    expect(tagFromSelection(text, 5, 5, [])).toBeNull()
    const long = `${text} Then the rain comes.`
    expect(tagFromSelection(long, 0, long.length, [])).toBeNull()
    expect(tagFromSelection('one\ntwo', 0, 7, [])).toBeNull()
    expect(tagFromSelection('go 123 now', 3, 6, [])).toBeNull()
    expect(tagFromSelection('see @maker now', 5, 8, [])).toBeNull() // inside @maker
    expect(tagFromSelection('see @maker now', 3, 10, [])).toBeNull() // the tag itself
  })
})
