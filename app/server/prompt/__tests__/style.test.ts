// Stage-only plan, section 5: one detector of a stated picture medium, phrase-level, so a scene that mentions a painted door or an
// animated talk is still a photograph. Pure.
import { describe, expect, it } from 'vitest'
import { MEDIUM, statedStyle } from '../style.ts'

const STATED = [
  'an illustration of a cook', 'an illustrated page', 'a painting of a harbour', 'painted in oils', 'painted in a loose impressionist style',
  'an oil painting', 'a watercolour of a lamp', 'a watercolor of a lamp', 'gouache on paper', 'an acrylic painting', 'a pastel drawing',
  'a charcoal drawing', 'a charcoal sketch', 'a pencil drawing', 'a pencil sketch', 'an ink drawing', 'an ink illustration', 'ink wash',
  'clean line art', 'a sketch of a kettle', 'just a sketch', 'a comic-book panel', 'a comic book panel', 'a comic strip', 'manga style',
  'Anime', 'a cartoon', 'an animated film', 'an animation still', 'cel-shaded', 'cel shaded', 'pixel art', 'a 3D render', 'a 3d-rendered room',
  'CGI', 'low-poly', 'low poly', 'claymation', 'stop-motion', 'stop motion', 'papercraft', 'vector art', 'concept art', 'digital art',
  'a storybook page', 'a woodcut', 'a linocut', 'an engraving', 'stained glass', 'a mosaic', 'stylised', 'stylized',
  'in the style of an old print',
]
const PHOTO = [
  'drawing water from a well', 'a painted door', 'an animated conversation', 'inky clouds', 'a comic moment', 'a sketchy part of town',
  'a photograph', 'film still', '35mm', 'Photo of a cook by a stove, in a small kitchen. Photoreal.', 'a door painted in bright red',
  'animated faces', 'a sketchy alley', '',
]

describe('statedStyle', () => {
  it.each(STATED)('fires on a stated medium: %s', (t) => expect(statedStyle(t)).toBe(true))
  it.each(PHOTO)('does not fire on a photograph or a word that only looks like a medium: %s', (t) => expect(statedStyle(t)).toBe(false))
  it('reads any of several texts; empty or missing texts are not a style', () => {
    expect(statedStyle('a cook by a stove', null, undefined, 'a watercolour')).toBe(true)
    expect(statedStyle('a cook by a stove', null, undefined, '')).toBe(false)
    expect(statedStyle()).toBe(false)
  })
  it('MEDIUM is case-insensitive and whole-word', () => {
    expect(MEDIUM.test('PIXEL ART')).toBe(true)
    expect(MEDIUM.test('animes')).toBe(false)
    expect(MEDIUM.test('non-illustration')).toBe(false)
  })
})
