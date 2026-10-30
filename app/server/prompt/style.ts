/**
 * The one detector of a stated picture medium (stage-only plan, section 5: one style detector for every prompt). When the words,
 * the brief's style, a card or a prop description ask for a painting, an illustration, anime, a 3D render and the like, a prompt
 * writer drops its photo framing ("Photo of", "Photoreal.", "A real photograph", "Real photographic detail") and the draw's negative
 * loses its photo-look items (qwenGraph.ts qwenNegative). Unstated: every prompt reads as today. Consumers: the draw and the render
 * prompt writers (wave 1), the concept and finish prompts, the person-look prompt and the draw's negative (qwenGraph.ts).
 * Phrase-level and whole words, so a scene that only mentions a painted door, drawing water or an animated talk is still a
 * photograph. Pure.
 */
const PHRASES = [
  'illustrations?', 'illustrated',
  'paintings?', 'painted in (?:oils?|watercolou?rs?|gouache|acrylics?|tempera|inks?|pastels?|(?:a|an|the) (?:[\\w-]+ ){0,3}style)',
  'watercolou?rs?', 'gouache', 'pastel drawings?', '(?:charcoal|pencil) (?:drawings?|sketch(?:es)?)', 'ink (?:drawings?|illustrations?|wash)',
  'line art', 'sketch of', 'a sketch',
  'comic(?:-| )books?', 'comic strips?', 'manga', 'anime', 'cartoon(?:s|ish|y)?', 'animated (?:film|movie|feature)s?', 'animation stills?',
  'cel(?:-| )shad(?:ed|ing)', 'pixel art', '3d(?:-| )render(?:s|ed|ing)?', 'cgi', 'low(?:-| )poly', 'claymation', 'stop(?:-| )motion', 'papercraft',
  'vector art', 'concept art', 'digital art', 'storybook', 'woodcut', 'linocut', 'engraving', 'stained glass', 'mosaic',
  'styli[sz]ed', 'in the style of',
]

/** a stated medium other than a photograph, anywhere in a text (case-insensitive, whole words) */
export const MEDIUM = new RegExp(String.raw`(?<![\w-])(?:${PHRASES.join('|')})(?![\w-])`, 'i')

/** true when any text states a picture medium other than a photograph */
export function statedStyle(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && MEDIUM.test(t))
}
