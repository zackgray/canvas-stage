// The paste-camera-flag rules (promptWarn.ts): local text rules, no AI. Camera and lens language from a prompt written elsewhere
// ("low-angle tracking shot, 85mm lens, shallow depth of field") is found; Tidy's strip takes just those phrases out and tidies
// the seams; ordinary words — even a "shot" of something — are never touched, and there is no brand, crowd, boilerplate or length
// policing. Pure, so no DOM.
import { describe, expect, it } from 'vitest'
import { cameraPhrases, hasCameraWords, stripCameraPhrases } from '../promptWarn'

describe('camera and lens language in pasted words', () => {
  it('finds the owner’s example phrases', () => {
    const found = cameraPhrases('low-angle tracking shot, 85mm lens, shallow depth of field')
    const text = found.map((p) => p.text.toLowerCase()).join('|')
    expect(text).toContain('low-angle')
    expect(text).toContain('tracking shot')
    expect(text).toContain('85mm lens')
    expect(text).toContain('shallow depth of field')
  })

  it('flags shot types, lens millimetres, depth of field, tracking, dolly and angle words', () => {
    for (const words of ['an establishing shot', 'a close-up shot', 'a 50 mm prime', 'f/2.8', 'depth of field',
      'tracking', 'a dolly in', 'pan left', 'a high-angle shot', 'over-the-shoulder shot', 'rack focus', 'bokeh']) {
      expect(hasCameraWords(words), words).toBe(true)
    }
  })

  it('leaves ordinary words alone: a "shot" of something is not camera language', () => {
    for (const words of ['A quiet kitchen at dawn, a shot of espresso on the counter.', 'Mara lifts the copper kettle.',
      'The market square at noon.']) {
      expect(hasCameraWords(words), words).toBe(false)
      expect(stripCameraPhrases(words), words).toBe(words)
    }
  })

  it('Tidy strips just the camera phrases, with their list commas and the leading article', () => {
    expect(stripCameraPhrases('A low-angle tracking shot, 85mm lens, shallow depth of field. A farmhouse kitchen at dawn.'))
      .toBe('A farmhouse kitchen at dawn.')
    expect(stripCameraPhrases('An establishing shot of a quiet harbour.')).toBe('of a quiet harbour.')
    expect(stripCameraPhrases('a dolly zoom through the hall')).toBe('through the hall')
  })

  it('a strip is final: stripping again changes nothing', () => {
    const once = stripCameraPhrases('low-angle tracking shot, 85mm lens, shallow depth of field. A farmhouse.')
    expect(stripCameraPhrases(once)).toBe(once)
    expect(once).toBe('A farmhouse.')
  })
})
