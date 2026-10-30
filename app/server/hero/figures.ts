/**
 * Where each figure stands in a kit still's frame and how tall it is, for the E130 prompt rule: say each figure's size and place
 * in the frame (E130 b1: layout 0.58-0.63, the hero at 1.2x the clay's height and within 1% of its place, where a prompt that
 * described a person large drew one 4x too large). Read from the clay's ID pass at that frame when it has one (every tagged
 * entity, exact), else, at frame 0, from the hero's start point projected through the opening camera. Props are not figures.
 * Server-side (pngjs); the words are pure.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { PNG } from 'pngjs'
import type { ClayExport } from '../../src/shared/shotContract.ts'
import { cameraOf, type OpeningCamera } from './kitView.ts'

/** one figure in the frame, in fractions of the frame (0 = left / top, 1 = right / bottom; past 0..1 = cut by that edge). x0..x1 is
 *  its left-right extent (recipe wave: the still's people strip crops each person by it); the prompt words read cx, top and bottom only. */
export interface Figure { tag: string; cx: number; top: number; bottom: number; x0: number; x1: number }

/** fewer ID pixels than this is an antialiased edge or a speck, not a figure */
const MIN_PIXELS = 40
const isFigure = (tag: string) => tag === 'hero' || tag.startsWith('extra:') || tag.startsWith('creature:')

/** every figure the ID pass drew at this frame, hero first, then by height */
export function figuresFromId(file: string, colors: Record<string, [number, number, number]>): Figure[] {
  const png = PNG.sync.read(readFileSync(file))
  const { width: w, height: h, data } = png
  const keyOf = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b
  const want = new Map<number, string>()
  for (const [tag, [r, g, b]] of Object.entries(colors)) if (isFigure(tag)) want.set(keyOf(r, g, b), tag)
  // (recipe wave) each prop has its own colour now: one a prop also wears is ambiguous, never read as a figure
  for (const [tag, [r, g, b]] of Object.entries(colors)) if (!isFigure(tag)) want.delete(keyOf(r, g, b))
  const box = new Map<string, { n: number; x0: number; x1: number; y0: number; y1: number }>()
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, tag = want.get(keyOf(data[i], data[i + 1], data[i + 2]))
    if (!tag) continue
    const bx = box.get(tag) ?? { n: 0, x0: x, x1: x, y0: y, y1: y }
    bx.n++; bx.x0 = Math.min(bx.x0, x); bx.x1 = Math.max(bx.x1, x); bx.y0 = Math.min(bx.y0, y); bx.y1 = Math.max(bx.y1, y)
    box.set(tag, bx)
  }
  const out: Figure[] = []
  for (const [tag, b] of box) {
    if (b.n < MIN_PIXELS) continue
    // a figure touching an edge is cut by it: push that side just past the frame so the words say so
    out.push({ tag, cx: (b.x0 + b.x1 + 1) / 2 / w, top: b.y0 === 0 ? -0.01 : b.y0 / h, bottom: b.y1 === h - 1 ? 1.01 : (b.y1 + 1) / h, x0: b.x0 / w, x1: (b.x1 + 1) / w })
  }
  return out.sort((a, b) => Number(b.tag === 'hero') - Number(a.tag === 'hero') || (b.bottom - b.top) - (a.bottom - a.top))
}

/** a standing figure's shoulder width against its height (0.45 m on 1.8 m): the projected hero's left-right extent */
const WIDTH_PER_HEIGHT = 0.25

/** the hero at its start point through the opening camera (feet on the ground, `height` m tall); null when out of the picture */
export function heroFromCamera(start: [number, number], c: OpeningCamera, height = 1.8): Figure | null {
  const cam = cameraOf(c)
  const feet = new THREE.Vector3(start[0], 0, start[1]).project(cam), head = new THREE.Vector3(start[0], height, start[1]).project(cam)
  if (feet.z > 1 || head.z > 1) return null
  const cx = (feet.x + 1) / 2, top = (1 - head.y) / 2, bottom = (1 - feet.y) / 2
  if (cx < 0 || cx > 1 || bottom < 0 || top > 1) return null
  const half = ((bottom - top) * WIDTH_PER_HEIGHT) / cam.aspect / 2 // a fraction of the frame's height, as a fraction of its width
  return { tag: 'hero', cx, top, bottom, x0: cx - half, x1: cx + half }
}

/** The figures of a kit still at `frame`: the ID pass there, else (frame 0) the projected hero; null = not known at this frame. */
export function figuresAt(clayDir: string, frame: number, start: [number, number] | undefined, cam: OpeningCamera | null): Figure[] | null {
  try {
    const clay = JSON.parse(readFileSync(path.join(clayDir, 'clay.json'), 'utf8')) as ClayExport
    const id = clay.idPass
    const file = path.join(clayDir, `id_${String(frame).padStart(3, '0')}.png`)
    if (id && id.frames.includes(frame) && existsSync(file)) return figuresFromId(file, id.colors)
  } catch { /* no clay record, or an unreadable ID PNG: fall back */ }
  if (frame === 0 && start && cam) { const h = heroFromCamera(start, cam); return h ? [h] : [] }
  return null
}

const SIZES: [number, string][] = [[1 / 10, 'a tenth'], [1 / 8, 'an eighth'], [1 / 6, 'a sixth'], [1 / 4, 'a quarter'], [1 / 3, 'a third'], [1 / 2, 'half'], [2 / 3, 'two thirds'], [3 / 4, 'three quarters']]
const sizeWord = (h: number) => SIZES.reduce((a, b) => (Math.abs(Math.log(b[0] / h)) < Math.abs(Math.log(a[0] / h)) ? b : a))[1]

function placeWords(cx: number): string {
  if (cx < 0.12) return 'At the far left edge of the frame'
  if (cx < 0.38) return 'On the left of the frame'
  if (cx <= 0.62) return 'In the middle of the frame'
  if (cx <= 0.88) return 'On the right of the frame'
  return 'At the far right edge of the frame'
}

const ORDINAL = ['a second', 'a third', 'a fourth', 'a fifth', 'a sixth']

/**
 * One sentence per figure: where it is, how much of the frame it fills, then who it is (the hero's card description; an
 * extra is "a figure", a creature its tag's word). Never a lens, a millimetre or a background claim.
 */
export function figureWords(figures: Figure[], heroWho: string): string[] {
  let others = 0
  return figures.map((f) => {
    const top = Math.max(0, f.top), bottom = Math.min(1, f.bottom), h = Math.max(0.01, bottom - top)
    const cutTop = f.top < 0.005, cutBottom = f.bottom > 0.995
    const far = h < 0.2
    const kind = f.tag === 'hero' ? `one ${far ? 'small distant ' : h >= 0.45 ? 'close ' : ''}figure`
      : f.tag.startsWith('creature:') ? `the ${f.tag.slice('creature:'.length).replace(/[_-]+/g, ' ')}`
        : `${ORDINAL[Math.min(others++, ORDINAL.length - 1)]} ${far ? 'small distant ' : ''}figure`
    const how = cutTop && cutBottom ? 'filling the frame from top to bottom'
      : cutTop ? `cut off by the top edge of the frame, ${sizeWord(h)} of the frame tall`
        : cutBottom ? `cut off by the bottom edge of the frame, ${sizeWord(h)} of the frame tall`
          : `seen whole, ${far ? 'only ' : 'about '}${sizeWord(h)} of the frame tall`
    const who = f.tag === 'hero' && heroWho ? `: ${heroWho.replace(/[.\s]+$/, '').replace(/^(A|An|The) /, (m) => m.toLowerCase())}` : ''
    return `${placeWords(f.cx)}, ${far ? 'far away, ' : ''}${kind} ${how}${who}.`
  })
}
