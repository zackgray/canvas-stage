// Stage-only plan, section 5: a picture whose prompt states a medium loses the negative's photo-look items (waxy, over-smooth, AI
// look); a photograph's negative is today's, byte for byte. The graph reads the flag from its own prompt. Pure.
import { describe, expect, it } from 'vitest'
import { buildQwenDepthGraph, qwenNegative, QWEN_NEG, QWEN_NEG_PEOPLE, drawNegative } from '../qwenGraph.ts'

const PHOTO_LOOK = ['蜡像感', '过度光滑', '画面具有AI感']

describe('the draw negative', () => {
  it('unstyled: today\'s exact string; the people part follows it as before', () => {
    expect(QWEN_NEG).toBe('低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感，人脸无细节，过度光滑，画面具有AI感。构图混乱。文字模糊，扭曲')
    expect(qwenNegative({})).toBe(QWEN_NEG)
    expect(qwenNegative({ noPeople: true })).toBe(`${QWEN_NEG}${QWEN_NEG_PEOPLE}`)
  })
  it('styled: the base items stay, the photo-look items go', () => {
    const n = qwenNegative({ styled: true })
    expect(n).toBe('低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，人脸无细节。构图混乱。文字模糊，扭曲')
    for (const w of PHOTO_LOOK) expect(n).not.toContain(w)
  })
  it('there is no alone part: a one-person still sends the plain negative', () => {
    expect(drawNegative({ prompt: 'A cook by a stove.' })).toBe(QWEN_NEG)
    expect(drawNegative({ prompt: 'A cook by a stove.' })).not.toMatch(/second person|two people/i)
  })
  it('the graph reads the style from its own prompt; an explicit flag wins', () => {
    const neg = (prompt: string, styled?: boolean) => buildQwenDepthGraph({ prompt, seeds: [1], prefix: 'x', styled }).neg.inputs.text
    expect(neg('Photo of a cook by a stove, in a small kitchen.')).toBe(QWEN_NEG)
    expect(neg('A watercolour of a cook by a stove, in a small kitchen.')).toBe(qwenNegative({ styled: true }))
    expect(neg('A watercolour of a cook.', false)).toBe(QWEN_NEG)
    expect(neg('Photo of a cook.', true)).toBe(qwenNegative({ styled: true }))
  })
})
