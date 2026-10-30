// Track C (no-house-style-defaults): the cast card prompt forces no wear, lens or expression; the description alone says what the
// person wears and how worn it is.
import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, VIEW_PROMPTS, frontPrompt } from '../prompts.ts'

describe('cast card prompt', () => {
  const p = frontPrompt('A woman of fifty in a pressed linen shirt and clean white trousers, grey hair tied back')
  it('has no forced wear, lens or expression', () => {
    expect(p).not.toMatch(/\bwear\b/i)
    expect(p).not.toMatch(/50\s*mm|lens/i)
    expect(p).not.toMatch(/\bcalm\b/i)
    expect(Object.values(VIEW_PROMPTS).join(' ')).not.toMatch(/\bcalm\b/i)
  })
  it('keeps the contest rules and the full-head framing, and the default rules say nothing of weathering', () => {
    for (const phrase of ['original character', 'Real fabrics', 'full head, hair and face']) expect(p).toContain(phrase)
    expect(DEFAULT_RULES).not.toMatch(/creases|weave|stitching|pores/i)
  })
})
