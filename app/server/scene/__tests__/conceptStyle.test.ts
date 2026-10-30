// Stage-only plan, section 5: a concept tile whose words state a picture medium is not told it is a real photograph, and its negative
// loses the photo-look items; unstated words read exactly as before (pinned below from f0ac1e6, word for word). Pure.
import { describe, expect, it } from 'vitest'
import { buildConceptGraph, conceptPrompt } from '../conceptGraph.ts'
import { SIDE_VIEW } from '../conceptText.ts'
import { QWEN_NEG, qwenNegative } from '../../hero/qwenGraph.ts'

const LANE = { description: 'A narrow lane between stone walls', lighting: 'Low late sun from behind.', materials: 'Old timber, wet slate.' }
const KETTLE = { description: 'A copper kettle on a stool, seen from the side', lighting: 'Soft lamp light', materials: 'Brass.' }
const tail = 'Low late sun from behind. Old timber, wet slate. Real photographic detail.'

describe('concept prompts and a stated style', () => {
  it('unstated: byte-identical to f0ac1e6, every kind', () => {
    expect(conceptPrompt('location', LANE)).toBe(`A real photograph from a film: a wide establishing view of a narrow lane between stone walls, with no people in it. ${tail}`)
    expect(conceptPrompt('mood', LANE)).toBe(`A real film still that sets the mood of a scene: a narrow lane between stone walls. ${tail}`)
    expect(conceptPrompt('lighting', LANE)).toBe(`A real photograph from a film that shows the light of the scene: a narrow lane between stone walls. ${tail}`)
    expect(conceptPrompt('material', LANE)).toBe('A close real photograph of a surface that fills the frame: a narrow lane between stone walls. Low late sun from behind. Real photographic detail.')
    expect(conceptPrompt('beat', LANE)).toBe(`A real film still of one moment in the scene: a narrow lane between stone walls. ${tail}`)
    // (prop-side-view, owner 2026-10-29) the one change since: a side view asked for goes with the firm side-view words
    expect(conceptPrompt('prop', KETTLE)).toBe(`A product photograph of a copper kettle on a stool, seen from the side, ${SIDE_VIEW}, shown whole and fully in frame with clear space around it, nothing cropped, ` +
      'centred on a plain neutral mid-grey background, flat even soft light, no shadows, no hand, nothing else in the picture. Real photographic detail.')
    expect(conceptPrompt('group', LANE)).toBe('A reference sheet of seven different extras for a film, standing side by side in one row, each seen whole from head to toe and facing the camera, ' +
      'evenly spaced and not overlapping, on a plain flat black background, flat even studio light: a narrow lane between stone walls. Every one a different person, with varied faces, builds, ages and clothes. Real photographic detail.')
  })
  it('styled: "picture", never "real photograph", no "Real photographic detail."', () => {
    const w = { ...LANE, description: 'A watercolour of a narrow lane between stone walls' }
    expect(conceptPrompt('location', w)).toMatch(/^A picture from a film: a wide establishing view of a watercolour of a narrow lane/)
    expect(conceptPrompt('mood', w)).toMatch(/^A picture that sets the mood of a scene: /)
    expect(conceptPrompt('material', w)).toMatch(/^A close picture of a surface that fills the frame: /)
    expect(conceptPrompt('beat', w)).toMatch(/^A picture of one moment in the scene: /)
    for (const k of ['location', 'mood', 'lighting', 'material', 'beat', 'prop', 'group'] as const) {
      expect(conceptPrompt(k, w), k).not.toMatch(/real photograph|real film still|Real photographic detail|product photograph/i)
    }
  })
  it('a styled prop keeps its centred, plain-background, nothing-else shape (it feeds the 3D build), and says "picture"', () => {
    expect(conceptPrompt('prop', { description: 'a watercolour of a teapot' })).toBe('A picture of a watercolour of a teapot, seen flat on from the front and standing upright, ' +
      'centred on a plain neutral mid-grey background, flat even soft light, no shadows, no hand, nothing else in the picture.')
  })
  it('the negative: the photograph\'s for unstated words, the short one for a stated medium', () => {
    const g = (prompt: string) => buildConceptGraph({ prompt, seeds: [1], quality: 'full', kind: 'prop', prefix: 'x' }).neg.inputs.text
    expect(g(conceptPrompt('prop', KETTLE))).toBe(QWEN_NEG)
    expect(g(conceptPrompt('prop', { description: 'a watercolour of a teapot' }))).toBe(qwenNegative({ styled: true }))
    expect(qwenNegative({ styled: true })).not.toMatch(/蜡像感|过度光滑|AI感/)
  })
})
