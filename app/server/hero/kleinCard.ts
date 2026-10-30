/**
 * The kit still's Klein 4B finish: which reference images go, and the instruction that says what each supplies (BFL's edit pattern:
 * roles by position, what changes, what stays; prose, no style words). Prompt wave, 2026-10-25 (owner decision 6): at most FOUR images
 * in all (BFL documents 4 for Klein), identical files sent once (run 1 sent the cast's front image as both face and gear), and when
 * there are too many the last material goes first, then the master, then the gear
 * (draw-from-master plan section 5: a material tile is dropped before the master, so the master reaches the finish). Each material clause names
 * the object in image 1 it dresses. Pure.
 */

/** BFL's documented reference count for FLUX.2 [klein], image 1 (the draw) included */
export const KLEIN_MAX_IMAGES = 4

/** `face` null: no one is cast and nobody is in the frame (nobody.ts), so no face image goes */
export interface KleinRefInput<M> { face: string | null; gear: string | null; master: string | null; materials: M[]; fileOf: (m: M) => string }
export interface KleinRefs<M> { gear: string | null; master: string | null; materials: M[]; /** what was left out, in plain words */ dropped: string[] }

/**
 * The references the finish sends beside image 1: duplicates removed (`same` compares two files; by path unless the caller reads
 * them), then capped at KLEIN_MAX_IMAGES dropping materials from the end first, then the master, then the gear. The face always goes (none with nobody cast).
 */
export function kleinRefs<M>(i: KleinRefInput<M>, same: (a: string, b: string) => boolean = (a, b) => a === b): KleinRefs<M> {
  const seen: string[] = i.face ? [i.face] : []
  const fresh = (f: string | null) => { if (!f || seen.some((s) => same(s, f))) return null; seen.push(f); return f }
  const dropped: string[] = []
  let gear = fresh(i.gear)
  if (i.gear && !gear) dropped.push('the gear image (the same file as the face)')
  let master = fresh(i.master)
  if (i.master && !master) dropped.push('the master (the same file as another reference)')
  const materials = i.materials.filter((m) => { const ok = !!fresh(i.fileOf(m)); if (!ok) dropped.push('a material image (the same file as another reference)'); return ok })
  const count = () => 1 + (i.face ? 1 : 0) + (gear ? 1 : 0) + (master ? 1 : 0) + materials.length
  while (count() > KLEIN_MAX_IMAGES && materials.length) { materials.pop(); dropped.push('a material image (Klein takes 4 images at most, and the master comes first)') }
  if (count() > KLEIN_MAX_IMAGES && master) { master = null; dropped.push('the master (Klein takes 4 images at most)') }
  if (count() > KLEIN_MAX_IMAGES && gear) { gear = null; dropped.push('the gear image (Klein takes 4 images at most)') }
  return { gear, master, materials, dropped }
}

/** one material reference as the card names it: the object in image 1 it dresses, and what its surface is */
export interface CardMaterial { object: string; detail: string }

/**
 * The Klein finish's prompt: image 1 kept exactly, the person in it made to look like the cast card's; then the master and each
 * material's object. (prompt-fix pass, 2026-10-30) The person line is said for any card, a face photo or a closed helmet ("the exact
 * face of image 2" grew a face behind a closed visor), and never asks for a face the card does not show. The keep-list always holds
 * the time of day, the weather, the light and the colours (a daytime board tile turned a night still to day). `face: false`: nobody is
 * in the frame (no one cast, or the cast's figure is out of it, nobody.ts), so no face or gear image goes and the card says no person.
 * `styled` (the draw states a picture medium, kitStillPrompt.ts drawStyled): "A picture" leads and no photographic-detail line closes.
 * Short on purpose: BFL cites 50-80 words for Klein (one person and one material: about 100 words, no longer than before the pass); the person's pose,
 * framing and background are in the keep-list, so no second sentence says what not to take from the card.
 */
export function buildCardPrompt(o: { gear: boolean; master: boolean; materials: CardMaterial[]; styled?: boolean; face?: boolean }): string {
  if (o.face === false) return nobodyCard(o)
  let n = 2
  const face = n++, gear = o.gear ? n++ : 0, master = o.master ? n++ : 0
  const from = gear ? `images ${face} and ${gear}` : `image ${face}`
  const look = gear ? `the same face or helmet and hair as image ${face}, the same clothes and colours as image ${gear}`
    : 'the same face or helmet, hair, clothes and colours'
  const mats = o.materials.map((m) => materialLine(m, n++))
  const parts = [
    `${o.styled ? 'A picture' : 'A real photograph'}: image 1 exactly as it is, with the person in it looking like the person in ${from}, exactly as they appear there: ${look}.`,
    `Never add or reveal a face that image ${face} does not show.`,
    `Keep everything else from image 1: camera, framing, their pose, size and place, background, ${KEEP_TAIL}.`,
    master ? `Image ${master} is the scene's master shot: the same place and light; take nothing else from it.` : '',
    ...mats,
    o.styled ? '' : 'Real photographic detail.',
  ]
  return parts.filter(Boolean).join(' ')
}

/** what every keep-list ends with: a reference image never changes when or in what weather the picture is */
const KEEP_TAIL = 'the time of day, the weather, the light and the colours'
/** said when nobody is in the frame: the cockpit of a car close-up grew a driver with a face */
export const NO_PERSON_LINE = 'There is no person in this shot: do not add anyone.'

/** one material clause: the object in image 1 it dresses (its short name, never a raw tag), and the image it takes the surface from */
function materialLine(m: CardMaterial, at: number): string {
  const what = m.object.replace(/[.\s]+$/, '').replace(/^(a|an|the|one) /i, '').replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())
  return `The ${what} in image 1 has the surface of image ${at}: only its material texture, not its shape, place, light, weather or time of day.`
}

/** the finish with nobody in the frame: image 1 kept, no person, no face; the master and materials as ever (no face or gear goes) */
function nobodyCard(o: { master: boolean; materials: CardMaterial[]; styled?: boolean }): string {
  let n = 2
  const master = o.master ? n++ : 0
  return [
    `${o.styled ? 'A picture' : 'A real photograph'}: image 1 exactly as it is.`,
    NO_PERSON_LINE,
    `Keep everything from image 1: camera, framing, background, ${KEEP_TAIL}.`,
    master ? `Image ${master} is the scene's master shot: the same place and light; take nothing else from it.` : '',
    ...o.materials.map((m) => materialLine(m, n++)),
    o.styled ? '' : 'Real photographic detail.',
  ].filter(Boolean).join(' ')
}
