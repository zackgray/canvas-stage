import { describe, expect, it } from 'vitest'
import { buildDrawPrompt } from '../../hero/kitStillPrompt.ts'
import { buildL2RPrompt } from '../prompt.ts'

// QA 2026-10-24: "patched, dusty tunic and breeches" showed up in a canyon render. Wardrobe and setting words come only from the
// scene's own sentence and cast card; with neither, the prompts must add none.
const WARDROBE = /\b(tunic|breeches|doublet|cloak|armou?r|chainmail|helmet|peasant|medieval|soldier|camp|campfire|tent|palisade|banner)\b/i

describe('render prompts add no wardrobe or war-camp words of their own', () => {
  it('the Layout-To-Render prompt with no cast and no place', () => {
    expect(buildL2RPrompt({ place: '', cast: [] })).not.toMatch(WARDROBE)
  })
  it('the kit still draw with an empty plan and a bare cast card', () => {
    const p = buildDrawPrompt({ bible: null, plan: { sentence: '', kit: [] }, cast: { name: 'Mara', description: '' } })
    expect(p).not.toMatch(WARDROBE)
  })
  it('the cast card words pass through unchanged and nothing is added beside them', () => {
    const p = buildL2RPrompt({ place: 'a desert canyon', cast: [{ name: 'Mara', description: 'a woman in a denim jacket' }] })
    expect(p).toMatch(/denim jacket/)
    expect(p).not.toMatch(WARDROBE)
  })
})
