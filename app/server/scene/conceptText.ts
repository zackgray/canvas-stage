/**
 * The words of a concept draw for every kind (moved out of conceptGraph.ts so the page can show the exact text a paid draw will
 * send, before the press: the Add dialog's and the prop card's "What will be sent" line). Pure: no graph, no server state.
 */
import { untag } from '../../src/shared/bibleContract.ts'
import type { ConceptKind, PropParts } from '../../src/shared/sceneContract.ts'
import { statedStyle } from '../prompt/style.ts'

// ---------------------------------------------------------------- the words

export interface ConceptWords { description: string; lighting?: string; materials?: string; parts?: PropParts }
const sentence = (s: string | undefined) => { const t = untag(s ?? '').replace(/\s+/g, ' ').trim(); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : '' }
const lower = (s: string) => sentence(s).replace(/\.$/, '').replace(/^[A-Z](?=[a-z]|\s)/, (c) => c.toLowerCase())
const join = (...parts: string[]) => parts.filter(Boolean).join(' ')
const REAL = 'Real photographic detail.'
/** the words already choose a view ("in side view", "three-quarter", "seen from behind") or a light ("overhead lights", "deep shadow").
 *  Ordinary prop words are not one (review F4): "its lid back on", "hanging from the left post", "a brass rim", "fairy lights", "a
 *  lit candle" keep the front-on, flat-light defaults; a bare "from behind" counts only where it ends the clause */
export const VIEW = /\b(low|high)[- ]angle\b|\bfrom\s+(a\s+)?(low|high)\s+angle\b|\b3\/4\b|\btop[- ]down\b|\bbird'?s[- ]eye\b|\b(side|front|rear|back|top|overhead|three[- ]quarter|profile|angled|perspective|low[- ]angle|high[- ]angle|aerial)[- ]?(view|angle|shot)\b|\b(side|front|head|end)[- ]on\b|\b(seen|viewed|shot|photographed)\s+from\s+(the\s+)?(side|front|back|behind|above|below|rear|left|right)\b|\bfrom\s+(the\s+)?(side|front|back|behind|above|below|rear)\s*([.,;:!?]|$)|\b(in|a)\s+(profile|three[- ]quarter)\b/i
/** (prop-side-view, owner 2026-10-29) the words ask for a side view: "side view", "side profile", "in (side) profile", "side-on",
 *  "seen from the side", a bare "from the side" that ends its clause, or "profile" standing alone as a clause (a View box that says
 *  only "profile"). "low-profile tyres", "a side mirror" or "hanging from the side of the cart" are no view. */
export const SIDE = /\bside[- ]?(view|angle|shot|elevation|profile|on)\b|\bprofile[- ](view|shot|angle)\b|\b(in|a)\s+(side\s+)?profile\b|\b(seen|viewed|shot|photographed|drawn)\s+(exactly\s+)?from\s+(the\s+)?(side|left|right)\b|\bfrom\s+(the\s+)?side\s*([.,;:!?]|$)|(^|[.,;:]\s*)profile\s*([.,;:!?]|$)/i
/** the firm side view a side view is sent with (prop-side-view): Qwen draws a long thing such as a car at three-quarter from plain
 *  side words (2 of 4 on the owner's race car); these words drew 12 true side views in 12 across three seeds (the draft draw, whose
 *  CFG 1 ignores the negative, so the "no three-quarter" has to be said here) */
export const SIDE_VIEW = 'a strict side profile like a flat side elevation drawing, seen exactly side-on at a right angle to its length, the camera level with its middle, its front and back ends in line, the far side hidden, no three-quarter angle and no perspective'
const views = (t: string) => VIEW.test(t) || SIDE.test(t)
const LIGHT = /\b(lighting|shadows?|glint|glow|backlit|spotlights?|sunlight|moonlight|lit\s+(by|from)|(soft|hard|warm|cold|cool|harsh|bright|dim|overhead|side|top|back|key|rim|studio|stage|flood|neon|natural|golden)[- ]lights?)\b|\blights?\s+(glint|glints|shine|shines|fall|falls|catch|catches)\b/i
/** the line is already in the description (same words, ignoring case, punctuation and spacing) */
const said = (d: string, line: string) => { const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); return !!line && n(d).includes(n(line)) }

/**
 * The prompt for one kind: the piece's words plus the scene's lighting and materials lines. A prop is a piece drawn alone, so it
 * carries its own words only (the scene's materials line made the hive a straw hat); so does the extras sheet (flat-lit, a piece too).
 * When the description states a picture medium (a watercolour, an illustration …) each opener says "picture" with no "real" and
 * "Real photographic detail." is left off; the prop keeps its centred, plain-background, nothing-else shape (it feeds the 3D build).
 * Unstated: as before, word for word.
 */
export function conceptPrompt(kind: ConceptKind, w: ConceptWords): string {
  const d = lower(w.description), light = sentence(w.lighting), mats = sentence(w.materials)
  const styled = statedStyle(w.description), real = styled ? '' : REAL
  const shot = styled ? 'A picture' : 'A real photograph', still = styled ? 'A picture' : 'A real film still'
  switch (kind) {
    case 'location': return join(`${shot} from a film: a wide establishing view of ${d}, with no people in it.`, light, mats, real)
    // Guided's mood text is both the description and the light line: said once, not twice
    case 'mood': return join(`${still} that sets the mood of a scene: ${d}.`, said(d, light) ? '' : light, mats, real)
    case 'lighting': return join(`${shot} from a film that shows the light of the scene: ${d}.`, light, mats, real)
    case 'material': return join(`${styled ? 'A close picture' : 'A close real photograph'} of a surface that fills the frame: ${d}.`, light, real)
    case 'beat': return join(`${still} of one moment in the scene: ${d}.`, light, mats, real)
    // the angle and the light are the writer's when the words state them; the front view and flat light are only the defaults
    case 'prop': return join(`${styled ? 'A picture' : 'A product photograph'} of ${[d, ...propPartsSent(w.description, w.parts)].join(', ')}.`, real)
    case 'group': return join('A reference sheet of seven different extras for a film, standing side by side in one row, each seen whole from head to toe and',
      `facing the camera, evenly spaced and not overlapping, on a plain flat black background, flat even studio light: ${d}.`,
      'Every one a different person, with varied faces, builds, ages and clothes.', real)
  }
}

/** the words choose the view (a side, profile, front, top, three-quarter, rear or low-angle view) */
export const statesView = (text: string): boolean => views(text)
/** the words ask for a side view (the firm side-view words then go with it) */
export const statesSide = (text: string): boolean => SIDE.test(text)

/** (prop-draw-parts) the four parts a prop draw adds after its words, as the app writes them when nobody edits them: the view
 *  (front-on and upright; the firm side view when the words ask for a side view; left out when they state another), how the picture
 *  is taken (whole and in frame when the words or an edited View chose the view, then the plain grey backdrop), the light (left out
 *  when the words state one) and the rules. Unedited and with no side view asked, the sent text is word for word what it always was. */
export function propPartDefaults(description: string, parts?: PropParts): Required<PropParts> {
  const d = description
  const chosen = views(d) || !!(parts?.view?.trim() && views(parts.view))
  return {
    view: SIDE.test(d) ? SIDE_VIEW : VIEW.test(d) ? '' : 'seen flat on from the front and standing upright',
    setup: `${chosen ? 'shown whole and fully in frame with clear space around it, nothing cropped, ' : ''}centred on a plain neutral mid-grey background`,
    light: LIGHT.test(d) ? '' : 'flat even soft light, no shadows',
    rules: 'no hand, nothing else in the picture',
  }
}

const clause = (s: string) => s.trim().replace(/[.,;\s]+$/, '')
/** an edited View that asks for a side view goes with the firm side-view words after it (unless it already holds them) */
const firmView = (v: string) => (SIDE.test(v) && !said(v, SIDE_VIEW) ? `${clause(v)}, ${SIDE_VIEW}` : v)

/** the parts as sent, in order: each edited one replaces its default ('' leaves that part out), the others are the defaults */
export function propPartsSent(description: string, parts: PropParts | undefined): string[] {
  const def = propPartDefaults(description, parts)
  return (['view', 'setup', 'light', 'rules'] as const)
    .map((k) => clause(k === 'view' && parts?.view !== undefined ? firmView(parts.view) : parts?.[k] ?? def[k])).filter(Boolean)
}
