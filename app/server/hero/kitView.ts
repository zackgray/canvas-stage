/**
 * What the opening camera of a kit take actually sees, for the kit hero prompt (fix 2026-10-24, take-2026-10-23T15-39-24-203:
 * a 5 m crane on 84 mm looking down came back as an eye-level frontal still with a palisade, tents and fire that were not in the
 * frame, because the prompt named every piece in the plan and nothing about the camera). Pure: the plan, the performance's start
 * point and the take's frame-0 camera in, the visible kit kinds and plain camera/framing words out. Plan coordinates are the
 * stage's (the kit layer places the plan at the origin), so the projection needs no world offset.
 */
import * as THREE from 'three'
import type { KitItem, ScenePlan } from '../../src/stage3d/contract.ts'

/** the hero still is 1920x1088; a 36 mm-wide gate, as the take's focal is */
const ASPECT = 1920 / 1088
/** rough height (m) of each kind's top at its default args, so a tall piece whose base is out of frame still counts (tree: 6 m + crown lobes) */
const TOP: Record<string, number> = { palisade: 3.2, tent: 2.1, hut: 3, deadTree: 7, tree: 7, treeline: 10, banner: 3, spear: 2.4, wagon: 1.6, cart: 1.4, haystack: 2, weaponRack: 2, barricade: 1.2, fence: 1.2, fire: 1.4, campfireRing: 1 }
/** a generated piece (KitItem.glb) or any kind TOP does not know: tall enough that a building-sized piece cut at the base counts */
const TOP_UNKNOWN = 2.5
const MAX_DIST = 160 // the far band beyond this is sky dome and fog, never named

export interface OpeningCamera { position: number[]; quaternion: number[]; focal: number }
/** `pieces`: the visible pieces themselves (plan order), so a generated piece's Bible tile can be found by its pieceTag; `angle`:
 *  the recipe's short camera sentence ('' at eye level) */
export interface KitView { kinds: string[]; camera: string; framing: string; angle?: string; pieces?: KitItem[]; /** visible pieces cut by the top edge */ cutTop?: KitItem[] }

export function cameraOf(c: OpeningCamera): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(2 * Math.atan(18 / ASPECT / c.focal) * (180 / Math.PI), ASPECT, 0.05, 3000)
  cam.position.fromArray(c.position); cam.quaternion.fromArray(c.quaternion); cam.updateMatrixWorld(); cam.updateProjectionMatrix()
  return cam
}

const topOf = (k: KitItem) => (TOP[k.kind] ?? (k.glb ? TOP_UNKNOWN : 1)) * (k.scale ?? 1)
const inFrame = (v: THREE.Vector3, m = 1.05) => v.z > -1 && v.z < 1 && Math.abs(v.x) <= m && Math.abs(v.y) <= m

/** every kit piece with any part inside the frame, in plan order (a kind need not be a KIT key: a generated piece's is a plain noun) */
export function visiblePieces(plan: Pick<ScenePlan, 'kit'>, c: OpeningCamera): KitItem[] {
  const cam = cameraOf(c)
  return plan.kit.filter((k) => {
    const [x, z] = k.at, top = topOf(k)
    if (Math.hypot(x - c.position[0], z - c.position[2]) > MAX_DIST) return false
    return [0, top / 2, top].some((y) => inFrame(new THREE.Vector3(x, y, z).project(cam)))
  })
}

/**
 * the visible pieces whose top runs out over the top edge of the picture (E146: a tree canopy cut by the edge was drawn as a giant
 * hat with a face; the prompt then says the edge cuts that piece, so the dark shape there reads as the piece, not as something new)
 */
export function cutAtTop(pieces: KitItem[], c: OpeningCamera): KitItem[] {
  const cam = cameraOf(c)
  return pieces.filter((k) => { const v = new THREE.Vector3(k.at[0], topOf(k), k.at[1]).project(cam); return v.z > -1 && v.z < 1 && v.y > 1 && Math.abs(v.x) <= 1.05 })
}

/** the kit kinds with any part inside the frame, in plan order, each once */
export const visibleKinds = (plan: Pick<ScenePlan, 'kit'>, c: OpeningCamera): string[] => [...new Set(visiblePieces(plan, c).map((k) => k.kind))]

const pitchOf = (c: OpeningCamera) => {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().fromArray(c.quaternion))
  return Math.asin(Math.max(-1, Math.min(1, f.y))) * (180 / Math.PI)
}

/** the recipe's camera sentence: nothing at eye level (the lens line says the rest), else how high and how steep */
export function angleWords(c: OpeningCamera): string {
  const pitch = pitchOf(c), h = c.position[1]
  if (pitch < -25) return `Seen from high above${h > 3 ? `, about ${Math.round(h)} metres up` : ''}, looking steeply down.`
  if (pitch < -8) return 'Seen from slightly above, looking down.'
  if (pitch > 8) return 'Seen from low down, looking up.'
  return ''
}

/** which way the performer walks at the start, as the camera sees it: towards us, away, or across */
export function headingWords(path: [number, number][] | undefined, c: OpeningCamera): string {
  if (!path || path.length < 2) return ''
  const [a, b] = path
  return directionWords(b[0] - a[0], b[1] - a[1], c)
}

/** a ground direction (dx, dz) as the camera sees it: towards us, away, or across ('' for no direction) */
export function directionWords(dx: number, dz: number, c: OpeningCamera): string {
  const len = Math.hypot(dx, dz)
  if (len < 1e-3) return ''
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().fromArray(c.quaternion))
  const fl = Math.hypot(f.x, f.z) || 1, dot = (dx * f.x + dz * f.z) / (len * fl)
  return dot < -0.5 ? 'towards us' : dot > 0.5 ? 'away from us' : 'across the frame'
}

/** the lens FEEL of a real focal (36 mm-wide gate): wide up to 30 mm, long from 60 mm (geometry, never a millimetre in a prompt) */
export const lensFeelOf = (focal: number | undefined): 'wide' | 'normal' | 'long' | '' =>
  !(focal && focal > 0) ? '' : focal <= 30 ? 'wide' : focal >= 60 ? 'long' : 'normal'

/** the lens feel as the still says it ('' for a normal lens: nothing to say); `people`: there is someone for the space to be around */
export function lensFeelWords(focal: number | undefined, people: boolean): string {
  const feel = lensFeelOf(focal)
  if (feel === 'wide') return people ? 'A wide-angle view with deep space around them.' : 'A wide-angle view with deep space.'
  if (feel === 'long') return people ? 'A long-lens view, the background compressed close behind them.' : 'A long-lens view, the distance compressed.'
  return ''
}

/** "seen from high above, looking steeply down" … from the camera's pitch and height */
export function cameraWords(c: OpeningCamera): string {
  const pitch = pitchOf(c), h = c.position[1]
  const angle = pitch < -25 ? `seen from high above${h > 3 ? `, about ${Math.round(h)} metres up` : ''}, the camera looking steeply down on them`
    : pitch < -8 ? 'seen from slightly above, the camera looking down on them'
      : pitch > 8 ? 'seen from low down, the camera looking up at them'
        : 'seen at eye level'
  const feel = lensFeelOf(c.focal)
  const lens = feel === 'long' ? 'a long telephoto lens: a narrow view, the background compressed and close behind them'
    : feel === 'wide' ? 'a wide-angle lens: a broad view with deep space around them' : 'a normal lens'
  return `The person is ${angle}, through ${lens}.`
}

/** how much of the person is in the picture at frame 0: whole, cut at the top or bottom, or not in frame */
export function framingWords(start: [number, number], c: OpeningCamera, height = 1.8): string {
  const cam = cameraOf(c), feet = new THREE.Vector3(start[0], 0, start[1]).project(cam), head = new THREE.Vector3(start[0], height, start[1]).project(cam)
  const xIn = Math.abs(feet.x) <= 1 || Math.abs(head.x) <= 1
  if (!xIn || (feet.y > 1 && head.y > 1) || (feet.y < -1 && head.y < -1)) return 'The person is not in the picture at the start.'
  const cutTop = head.y > 1, cutBottom = feet.y < -1, size = Math.abs(head.y - feet.y) / 2
  if (cutTop && cutBottom) return 'The person fills the picture, cut off at both the top and the bottom edges.'
  if (cutTop) return 'The person is framed close, their head cut off by the top edge of the picture.'
  if (cutBottom) return 'The person is framed close, cut off by the bottom edge of the picture.'
  return size < 0.25 ? 'The person is small in the picture, seen whole.' : 'The person is seen whole, from head to feet.'
}

export function kitView(plan: Pick<ScenePlan, 'kit'>, start: [number, number] | undefined, c: OpeningCamera): KitView {
  const pieces = visiblePieces(plan, c)
  return { kinds: [...new Set(pieces.map((k) => k.kind))], pieces, cutTop: cutAtTop(pieces, c), camera: cameraWords(c), angle: angleWords(c), framing: start ? framingWords(start, c) : '' }
}
