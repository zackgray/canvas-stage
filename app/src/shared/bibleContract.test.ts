import { describe, expect, it } from 'vitest'
import { BIBLE_ROUTES, bibleMoved, bibleMovedWhy, biblePaths, ELEMENT_KINDS, isTag, promptTags, TAG_RE, TAG_WORD, untag, type BibleRecord } from './bibleContract'

const bible = (over: Partial<BibleRecord> = {}): BibleRecord => ({
  worldId: 'loc-2026-10-25T10-00-00-000', version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '',
  elements: [], extrasSheet: null, grade: null, createdAt: '2026-10-25T10:00:00.000Z', updatedAt: '2026-10-25T10:00:00.000Z', ...over,
})

describe('bible contract', () => {
  it('reads the @tags a scene prompt mentions, once each, in order, without the @', () => {
    expect(promptTags('@brann walks past @dragon; @brann stops. mail@host.com and @Caps are not tags')).toEqual(['brann', 'dragon'])
    expect(promptTags('no tags here')).toEqual([])
    expect(promptTags('@a_b-c, @9x')).toEqual(['a_b-c'])
  })

  it('a take or still is stale when it recorded an older version, or none once the Bible has an approved master (m5)', () => {
    expect(bibleMoved(1, bible({ version: 2 }))).toBe(true)
    expect(bibleMoved(2, bible({ version: 2 }))).toBe(false)
    expect(bibleMoved(undefined, bible({ version: 2 }))).toBe(false) // made before the Bible, which has no master yet
    expect(bibleMoved(1, null)).toBe(false) // a world with no Bible
    const master = { id: 'm-1', png: '/m.png', madeBy: 'q', seed: 1, depthStrength: 0.95, jobId: null, credits: 14, createdAt: 't' }
    expect(bibleMoved(undefined, bible({ version: 3, master }))).toBe(true)
    expect(bibleMovedWhy(undefined, bible({ version: 3, master }))).toBe('before the scene had its sheet; the sheet now has an approved master (version 3)')
    expect(bibleMovedWhy(2, bible({ version: 3 }))).toBe('against scene sheet version 2; the scene is on version 3 now')
    expect(bibleMovedWhy(3, bible({ version: 3, master }))).toBeNull()
  })

  it('one tag rule (m15): the word, the whole-string check, the prompt mention and untag agree', () => {
    for (const ok of ['a', 'brann', 'old_mill-2', 'x'.repeat(32)]) expect([isTag(ok), TAG_RE.test(ok), promptTags(`see @${ok}.`)]).toEqual([true, true, [ok]])
    for (const no of ['', '9x', 'Caps', 'a b', 'x'.repeat(33), '@a']) expect(isTag(no)).toBe(false)
    expect(isTag(3)).toBe(false)
    expect(untag('@brann walks past @old_mill.')).toBe('brann walks past old_mill.')
    expect(untag('@old_mill', (t) => t.replace(/_/g, ' '))).toBe('old mill')
    expect(new RegExp(`^${TAG_WORD}$`).source).toBe(TAG_RE.source)
  })

  it('names the kinds, the route and the folder inside the world', () => {
    expect(ELEMENT_KINDS).toEqual(['cast', 'creature', 'extras', 'prop', 'material'])
    expect(BIBLE_ROUTES.bible).toBe('/__lab/bible')
    expect(biblePaths('loc-x')).toEqual({ root: 'lab-assets/locations/loc-x/bible', file: 'lab-assets/locations/loc-x/bible/bible.json',
      master: 'lab-assets/locations/loc-x/bible/master', elements: 'lab-assets/locations/loc-x/bible/elements' })
  })
})
