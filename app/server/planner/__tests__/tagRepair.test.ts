// Run 1 (2026-10-25): Gemma tagged two-word nouns with a space ("@honeycomb frame", "@wooden hive"); the gate refused both tries and
// 4.7 cr were billed for nothing. The fixture is that answer, verbatim (qa-2026-10-25-beekeeper/03-planner-failed-run/brief.txt).
import { describe, expect, it } from 'vitest'
import { promptTags } from '../../../src/shared/bibleContract.ts'
import { checkBriefText, parseBrief } from '../briefCheck.ts'
import { repairMentions, slugTag, TAG_RULE } from '../tagRepair.ts'
import { BRIEF } from './rig.ts'
import { RUN1_BRIEF, RUN1_IDEA } from './v2rig.ts'


describe('tag repair', () => {
  it("run 1's real answer now passes: @honeycomb frame -> @honeycomb_frame, @wooden hive -> @wooden_hive, the rest untouched", () => {
    const r = checkBriefText(RUN1_BRIEF, RUN1_IDEA)
    expect(r.ok ? [] : r.errors).toEqual([])
    if (!r.ok) return
    expect(r.brief.brief).toContain('carefully lifts a @honeycomb_frame from a @wooden_hive. Low golden sun')
    expect(promptTags(r.brief.brief)).toEqual(['beekeeper', 'honeycomb_frame', 'wooden_hive', 'bees'])
    expect(r.brief.lighting).toMatch(/low golden sunlight from behind the beekeeper/)
  })
  it('only a mention that would fail is rewritten; the longest joined tag wins; the words after it stay as written', () => {
    const tags = ['bees', 'honeycomb_frame', 'old_oak_tree', 'cart']
    expect(repairMentions('@bees drift past', tags)).toBe('@bees drift past')
    expect(repairMentions('under the @old oak tree, @bees hum', tags)).toBe('under the @old_oak_tree, @bees hum')
    expect(repairMentions('a @honeycomb-frame and a @Honeycomb Frame.', tags)).toBe('a @honeycomb_frame and a @honeycomb_frame.')
    // "cart" is a tag on its own, so "@cart horse" is the cart followed by a word, never re-joined
    expect(repairMentions('the @cart horse waits', [...tags, 'cart_horse'])).toBe('the @cart horse waits')
    // nothing matches: left for the gate to refuse (and name the rule)
    expect(repairMentions('a @wooden hive', tags)).toBe('a @wooden hive')
    expect(repairMentions('mail me@wooden hive', ['wooden_hive'])).toBe('mail me@wooden hive')
  })
  it('an element tag with spaces or capitals is made one token', () => {
    expect(slugTag('@Wooden Hive')).toBe('wooden_hive')
    expect(slugTag('honeycomb frame')).toBe('honeycomb_frame')
    expect(slugTag('drummer_boy')).toBe('drummer_boy')
    const r = parseBrief({ ...BRIEF, brief: `${BRIEF.brief} A @water tank stands by.`, elements: [...BRIEF.elements, { name: 'Water tank', tag: 'water tank', type: 'prop', look: 'a rusted tank', supported: true }] })
    expect(r.ok && r.brief.elements.map((e) => e.tag)).toEqual(['soldier', 'cart', 'water_tank'])
    expect(r.ok && r.brief.brief).toMatch(/A @water_tank stands by\.$/)
  })
  it('what cannot be repaired is refused with the rule named, so the retry message teaches it', () => {
    const r = parseBrief({ ...BRIEF, brief: `${BRIEF.brief} A @ghost horse waits.` })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toBe(`brief: @ghost has no element; ${TAG_RULE}: write the element's tag exactly, add it to elements, or remove the @`)
  })
})
