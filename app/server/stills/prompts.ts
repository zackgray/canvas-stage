/**
 * Instruction assembly for Qwen Image Edit 2511 and the prompt for the Z-Image Turbo locked pass. Qwen is
 * instruction-literal: say what to keep and what to change, explicitly. Shot rules (DEMO.md): generic cars, masked
 * people, no readable generated text. Photographic wording (docs/photoreal-prompting.md): "photo of", subject first,
 * no quality tags — "photorealistic", "8k", "masterpiece", "highly detailed", HDR read as CG, not as a photograph.
 */

const SAFETY =
  'No readable text, signage, logos or badges anywhere; any vehicle is generic with no badges; ' +
  'any people wear masks or are seen from behind, with no recognisable faces.'

/** Quality tags that pull towards the CG / render look. Never sent; stripped from scene prompts too. */
export const CG_WORDS =
  /\b(?:photo-?realistic|hyper-?realistic|ultra[- ]realistic|masterpiece|best quality|highly detailed|ultra[- ]detailed|(?:4|8|16)k(?: uhd)?|ultra hd|uhd|hdr|octane render|unreal engine|trending on artstation|cinematic composition)\b/gi

/** Collapse whitespace and trailing punctuation so assembled sentences read cleanly. */
export function tidy(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().replace(/[\s.,;]+$/, '')
}

/** The scene prompt without CG quality tags (older location prompts carry "photorealistic, 35mm" and the like). */
export function stripCgWords(s: string | undefined): string {
  return tidy(s).split(',').map((c) => tidy(c.replace(CG_WORDS, ''))).filter(Boolean).join(', ')
}

/** Pass 1, full re-render: the rough projected stage view becomes a finished photograph. */
export function renderInstruction(scenePrompt: string | undefined): string {
  const scene = stripCgWords(scenePrompt)
  return [
    'Turn this rough 3D render into a real photograph.',
    ...(scene ? [`Scene: ${scene}.`] : []),
    'Keep the exact camera angle, framing, composition, architecture and lighting direction.',
    'Fill in any missing, black, magenta or empty areas naturally so they match their surroundings.',
    'Remove stretched, smeared or warped texture and give every surface real photographic detail.',
    'Natural colour and contrast, like a real camera exposure.',
    SAFETY,
  ].join(' ')
}

/**
 * Pass 1, holes only: the sampler only sees the cropped hole region, so the instruction is about the fill and kept
 * narrow (Qwen applies edits literally; small edits work better than large ones). The holes arrive black (holes
 * variant) or, with `prefilled`, as a soft blur of their surroundings (structure-locked quality). The prefilled
 * wording names no black and says what the blur is: told to fill "the black regions" of a night scene's dark blur,
 * Qwen painted the frame-edge holes black (R-01, alley: 68 % of hole pixels).
 */
export function holesInstruction(scenePrompt: string | undefined, prefilled = false): string {
  const scene = stripCgWords(scenePrompt)
  return [
    ...(prefilled
      ? ['Fill only the soft, blurred patches with no detail: they are missing parts of this photograph, most of them along the edges of the frame.',
        'Extend the surrounding surfaces into them (walls, ground, sky) with the same perspective, light and grain, so the photograph fills the whole frame edge to edge.']
      : ['Fill only the empty areas of this photograph: the black regions and any soft, blurred patches with no detail.',
        'Continue the surrounding surfaces into them (walls, ground, sky) with the same perspective, light and grain.']),
    'Keep everything else unchanged.',
    ...(scene ? [`The photograph: ${scene}.`] : []),
    'Add no text, signs, people or vehicles.',
  ].join(' ')
}

/**
 * Drop "no X" / "without X" clauses and sentences: a CFG-1 model has no working negative, and naming a thing primes
 * it. Each sentence is split on commas, so "No people." goes as well as ", no people".
 */
export function positiveOnly(s: string): string {
  const keep = (c: string) => !!c && !/^(no|without|not)\b/i.test(c)
  return tidy(s).split(/(?<=\.)\s+/)
    .map((sentence) => tidy(sentence).split(',').map((c) => c.trim()).filter(keep).join(', '))
    .filter(Boolean).join('. ')
}

/** The shot names a sign by its words (`one reads "BAR"`), so it wants that text there. */
export function hasQuotedSign(scene: string): boolean {
  return /["“][^"“”]+["”]/.test(scene)
}

/** "a bank at dusk" -> "Photo of a bank at dusk"; a prompt that already opens as a photo is kept as written. */
export function asPhoto(scene: string): string {
  if (/^(?:a\s+)?photo(?:graph)?\b/i.test(scene)) return scene
  return `Photo of ${scene.replace(/^(A|An|The)\b/, (w) => w.toLowerCase())}`
}

/**
 * Structure-locked render (Z-Image Turbo at CFG 1, steered by depth + the colour view): the shot's own prompt as a
 * photograph, subject first, then light and colour. Turbo is distilled and ignores negatives, so the safety rules
 * are phrased as what IS there (still-lock experiment: the negated "no signage" wording put a red sign on a column).
 * "Plain unmarked walls" is left out when the shot names a sign's words, or it would argue with the prompt.
 */
export function lockPrompt(scenePrompt: string | undefined): string {
  const scene = positiveOnly(stripCgWords(scenePrompt))
  return [
    scene ? `${asPhoto(scene)}.` : 'Photo of a real place.',
    'Natural light, true-to-life colour.',
    hasQuotedSign(scene) ? 'The place is empty and quiet.' : 'Plain unmarked walls and doors; the place is empty and quiet.',
  ].join(' ')
}

/** Pass 2: add characters / props to an existing still, keeping the plate. */
export function charactersInstruction(direction: string): string {
  const d = tidy(direction)
  if (!d) throw new Error('direction is empty')
  return [
    'Keep the building, the street, the camera angle, the framing and the lighting exactly as they are.',
    `Add: ${d}.`,
    'The added people and objects sit naturally in the scene with matching perspective, scale, light direction,',
    'shadows and contact with the ground.',
    SAFETY,
  ].join(' ')
}
