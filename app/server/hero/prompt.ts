/**
 * The hero-still prompt (E99/E101 rules, wording from experiments/lib/e100-prompts.ts promptA):
 *  - NEVER name fire, flames or burning: Klein draws them into the frame even for "a fire out of shot". Any clause of the
 *    world text, the lighting line or the owner's override that names one is dropped; the final prompt is checked.
 *  - no film-grain words (grain is added later, in the free finish).
 *  - the background stays exactly as in the opening frame: nothing invented, no new structures or figures.
 * Pure. Nothing here knows the scene: the world and the person come from the take's world and the cast card.
 */
import { BANNED } from '../prompt/banned.ts'

export interface HeroPromptParts {
  /** the world's own description (location prompt); camera boilerplate and banned clauses are dropped */
  world?: string
  /** the location's lighting line; empty = "as in image 1" */
  lighting?: string
  /** the cast card the face comes from */
  cast: { name: string; description: string }
  /** the take's focal in mm, when known */
  focal?: number
  /** the owner's own prompt: replaces the built one (still scrubbed) */
  override?: string
}

/** words the prompt must never carry: the one shared list (server/prompt/banned.ts) */
export { BANNED }
/** camera/lens boilerplate a location prompt carries: it describes how the world still was shot, not the frame */
const CAMERA = /\b(\d+\s*mm|lens|deep focus|panorama|photo(graph)?\b.*\b(taken|shot)|closer plate|perform perf)/i

const clean = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.!?,;:\s]+$/, '')

/** Drops every clause that names a banned word (and, for `world`, camera boilerplate); returns '' when nothing is left. */
export function scrub(text: string | undefined, o: { camera?: boolean } = {}): string {
  if (!text) return ''
  const out: string[] = []
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const kept = sentence.split(/[,;:()]/).map(clean).filter((c) => c && !BANNED.test(c) && !(o.camera && CAMERA.test(c)))
    if (kept.length) out.push(kept.join(', '))
  }
  return out.join('. ')
}

const sentence = (s: string) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}.` : '')

export function buildHeroPrompt(p: HeroPromptParts): string {
  const override = scrub(p.override)
  if (override) return finish(override)
  const world = scrub(p.world, { camera: true })
  const light = scrub(p.lighting)
  const who = scrub(p.cast.description) || scrub(p.cast.name)
  const lens = p.focal && p.focal > 0 ? ` Shot on a ${Math.round(p.focal)} mm lens.` : ''
  const parts = [
    'A real photograph re-rendering image 1, a frame from a film, with the person from image 2: the person in image 1 has the exact face of the person in image 2, ' +
      'the same eyes, brows, nose, mouth, jaw, skin marks and hair; only the face comes from image 2, not its background.',
    who ? `${sentence(`The person: ${who}`)}` : '',
    'Keep everything else exactly as in image 1: the framing and the person\'s size in the frame, the camera angle, the pose, the direction the person faces and where they look, ' +
      'and the clothing and gear as it is in image 1.',
    world ? sentence(`The whole background stays exactly as in image 1 (${world})`) : 'The whole background stays exactly as in image 1.',
    'Nothing is added to the background: no new structures, no figures, no banners, no objects.',
    light ? sentence(`Light: ${light}`) : 'The light stays as in image 1.',
    'The skin is weathered with an even natural colour: visible pores, fine lines around the eyes, small marks and freckles, no beauty retouching, no skin smoothing.',
    `A sharp photograph of the face.${lens}`,
  ]
  return finish(parts.filter(Boolean).join(' '))
}

/** The final guard: the prompt that goes out never carries a banned word, whatever was passed in. */
function finish(prompt: string): string {
  if (BANNED.test(prompt)) throw new Error('hero prompt still names a banned word')
  return prompt.endsWith('.') ? prompt : `${prompt}.`
}
