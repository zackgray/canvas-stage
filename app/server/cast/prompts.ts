/**
 * Cast prompts, the sheet's view list and the estimates. Pure: shared by the endpoint (server/cast) and the page
 * (src/labs/projection/cast). The view order IS the contract (docs/perform-contract.md, Cast): sheets are stored and
 * referenced as front, three-quarter, side, back, face, face-side, hands.
 */
import { stripOpener } from '../prompt/sceneWords.ts'
import { statedStyle } from '../prompt/style.ts'

export const SHEET_VIEWS = ['front', 'three-quarter', 'side', 'back', 'face', 'face-side', 'hands'] as const
export type SheetView = (typeof SHEET_VIEWS)[number]
/** the views the edit model makes from the picked front (everything but the front itself) */
export type EditView = Exclude<SheetView, 'front'>
export const EDIT_VIEWS = SHEET_VIEWS.filter((v) => v !== 'front') as EditView[]
export const isView = (v: unknown): v is SheetView => typeof v === 'string' && (SHEET_VIEWS as readonly string[]).includes(v)

/** Credits, re-based 2026-10-25 (server/priceBasis.ts): a sheet billed 9-14 (views 15 stands); a front job billed 2.8 for two
 *  candidates warm but 5-8.6 cold (the app's own traveller pair billed 9), 6.4 for three, 5.3-6.7 for four. A cold start is paid
 *  once per job, so the price is that once plus 2 a candidate: a pair shows 9, three 11, four 13, each at or over the dearest bill. */
export const FRONT_COLD_CR = 5
export const FRONT_CR_EACH = 2
export const VIEWS_CR = 15
export const VIEW_CR = 3
export const MIN_CANDIDATES = 1
export const MAX_CANDIDATES = 4
export const DEFAULT_CANDIDATES = 3
export const frontCredits = (n: number) => FRONT_COLD_CR + n * FRONT_CR_EACH
export const characterCredits = (n: number) => frontCredits(n) + VIEWS_CR

/** The part of the prompt the user edits: rules every character must follow (an original likeness with no brand marks, + what E34 measured). */
export const DEFAULT_RULES =
  'An original character: no likeness of any real person, film, comic, game or franchise character, no logo or emblem. ' +
  'No logos, printed text, brand marks or patches; plain straps; no resemblance to any real person. ' +
  'A distinct silhouette: a clearly different build, hair and outfit shape from other characters. ' +
  'Real fabrics, not plastic or latex; natural skin.'

/**
 * The front is the card's face reference and the hero still's gear image, so the head is never optional: E-QA runs drew neck-down
 * coats and gowns when the description led with clothes. The head and face are named first and again in the tail, with space above.
 */
export const FRONT_HEAD = 'Full-length character reference photo, front view, head to toe, of an original character whose face is clearly visible:'
export const FRONT_TAIL =
  'Relaxed neutral stance, arms hanging slightly away from the sides, feet shoulder-width apart, looking straight at ' +
  'the camera. The whole figure is in frame, head to shoes, centred: the full head, hair and face ' +
  'are in frame and sharp, with clear space above the head and below the feet; never cropped at the neck or shoulders. ' +
  'Plain light-grey studio background, soft even front lighting.'

export function descriptionProblem(description: string): string | null {
  const d = description.trim()
  if (d.length < 12) return 'describe the character in a sentence or more (build, face, hair, clothes)'
  if (d.length > 900) return 'description too long (900 characters at most)'
  return null
}
export const rulesProblem = (rules: string) => (rules.length > 1500 ? 'rules too long (1500 characters at most)' : null)
/** the person maker's "How the picture is taken", when edited: as long as the rules may be */
export const framingProblem = (framing: string) => (framing.length > 1500 ? 'the picture words are too long (1500 characters at most)' : null)

/** the head as sent: a description or rules that ask for a painting, an illustration and the like get "picture", not "photo" (audit F2) */
export const frontHead = (description: string, rules = '') => (statedStyle(description, rules) ? FRONT_HEAD.replace('reference photo', 'reference picture') : FRONT_HEAD)
/** "How the picture is taken" as the person maker shows it before an edit: the head and the tail as one text */
export const defaultFraming = (description = '', rules = '') => `${frontHead(description, rules).replace(/:$/, '.')} ${FRONT_TAIL}`

/**
 * The front's prompt. Unedited (no `framing`): the head, the description, the rules, the tail, exactly as ever. An edited
 * "How the picture is taken" replaces the head and the tail: it leads, then the description, then the rules.
 */
export function frontPrompt(description: string, rules: string = DEFAULT_RULES, framing?: string): string {
  // a card an old Develop wrote opens "A detailed character concept sheet for …": that says how a sheet was drawn, not who the person
  // is, and would ask the look model for a sheet; it comes off as in the draw and the render (stripOpener; review F10)
  const d = stripOpener(description.trim()).replace(/[.\s]+$/, '')
  const out = framing === undefined ? `${frontHead(d, rules)} ${d}. ${rules.trim()} ${FRONT_TAIL}` : `${framing.trim()} ${d}. ${rules.trim()}`
  return out.replace(/\s+/g, ' ').trim()
}

const KEEP =
  'Keep the same person: the same face, hair, body proportions and outfit, fabrics and colours exactly. ' +
  'Plain light-grey studio background, soft even light.'
/** E33: the fists came out oversized like gloves, so the hands view says what size they are. */
const HANDS_SIZE = 'Natural human hands, each fist about the size of the face and no bigger, with visible knuckles and fingers, not gloves.'

export const VIEW_PROMPTS: Record<EditView, string> = {
  'three-quarter': `Rotate the camera 45 degrees to the person's right so they are seen in a three-quarter front view, full body from head to shoes, same neutral stance. ${KEEP}`,
  side: `Show the same person in a full side profile view facing left, full body from head to shoes, same neutral stance, arms relaxed. ${KEEP}`,
  back: `Show the same person from directly behind, a full back view, full body from head to shoes, same neutral stance; the back of the outfit as it would really be. ${KEEP}`,
  face: `A close-up head-and-shoulders portrait of the same person facing the camera, neutral expression, eyes open, face fully visible. ${KEEP}`,
  'face-side': `A close-up head-and-shoulders portrait of the same person in profile facing left, neutral expression, face fully visible. ${KEEP}`,
  hands: `A close-up of the same person's two hands raised in front of the chest, one open with all five fingers spread and visible, one clenched in a fist. ${HANDS_SIZE} ${KEEP}`,
}
