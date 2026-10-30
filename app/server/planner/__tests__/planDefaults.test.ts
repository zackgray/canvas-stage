// Stage-only plan, section 5: the plan prompt taught a muddy, puddled ground for every scene (its JSON shape said "puddles": 20 and
// "mud 0.3", the compact example 15). The defaults are neutral now; a worked example has puddles only when its sentence names rain,
// wet ground, mud or puddles. Existing worlds and the world builder's own defaults are not touched. Pure.
import { describe, expect, it } from 'vitest'
import { COMPACT_NOTE, planSystemPrompt } from '../planText.ts'

const WET = /\b(rain\w*|wet|mud\w*|puddles?)\b/i

describe('the plan prompt\'s ground defaults', () => {
  const s = planSystemPrompt()
  it('the JSON shape and the compact example carry no puddles and a pale ground', () => {
    const shape = s.slice(s.indexOf('## The JSON shape'), s.indexOf('## Sky and mood'))
    expect(shape).toMatch(/"puddles": 0,/)
    expect(shape).toMatch(/"groundShade": 0\.45,/)
    expect(COMPACT_NOTE).toMatch(/"groundShade":0\.45,"puddles":0,/)
    expect(s).toMatch(/puddles` only when the sentence names rain, wet ground, mud or puddles/)
  })
  it('every worked example has puddles only when its own sentence names wet ground', () => {
    const examples = [...s.matchAll(/## Example \d+\r?\nSentence: (.+?)\r?\n```json\r?\n([\s\S]*?)\r?\n```/g)]
    expect(examples.length).toBeGreaterThanOrEqual(2)
    for (const [, sentence, json] of examples) {
      const puddles = (JSON.parse(json) as { puddles: number }).puddles
      expect(puddles > 0, sentence).toBe(WET.test(sentence))
    }
  })
  it('every "puddles" number in the prompt is 0 (no example sentence names wet ground)', () => {
    expect([...s.matchAll(/"puddles"\s*:\s*(\d+)/g)].map((m) => Number(m[1]))).toEqual(expect.arrayContaining([0]))
    expect([...s.matchAll(/"puddles"\s*:\s*(\d+)/g)].every((m) => m[1] === '0')).toBe(true)
  })
})
