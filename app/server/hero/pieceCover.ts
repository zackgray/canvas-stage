/**
 * How much of the frame each tagged set piece covers in the clay's ID pass, and whether it clearly runs out over the top edge
 * (prompt-fix pass, 2026-10-30). The cut-at-the-top sentence came from projecting a guessed piece height (kitView.ts cutAtTop), and the
 * pieces line named anything with one pixel in view: the aerial take said its grandstands ran out at the top when the ID pass shows
 * them ending a third of the way down, and the helmet close-up named a grandstand that is 53 pixels in a corner. Where the ID pass
 * has the piece's colour, its pixels decide: named only with a real share of the frame, cut only when a real share of the top row is
 * the piece. A piece the ID pass has no colour for keeps the projection, its cut gated on the clay depth's top row. Server-side
 * (pngjs); the rules are pure.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import type { ClayExport } from '../../src/shared/shotContract.ts'
import type { KitItem } from '../../src/stage3d/contract.ts'
import { readChannel0 } from './depthImage.ts'

/** a piece's pixels: its share of the whole frame, and its share of the frame's top row */
export interface PieceCover { share: number; topRow: number }

/** under this share of the frame a piece is a speck at an edge, not something the picture shows (0.02%: ~420 px of 1920x1088; the
 *  aerial take's distant car is ~1,000 px and is named, the helmet close-up's grandstand corner is 53 px and is not) */
export const MIN_SEEN_SHARE = 0.0002
/** at least this share of the top row is the piece before the words say the top edge cuts it (5%: ~96 px of 1920) */
export const MIN_TOP_ROW = 0.05

/** every `prop:<tag>` colour of the ID pass at `frame`, counted; null when the frame has no ID pass */
export function pieceCoverAt(clayDir: string, frame: number): Map<string, PieceCover> | null {
  try {
    const clay = JSON.parse(readFileSync(path.join(clayDir, 'clay.json'), 'utf8')) as ClayExport
    const id = clay.idPass
    const file = path.join(clayDir, `id_${String(frame).padStart(3, '0')}.png`)
    if (!id || !id.frames.includes(frame) || !existsSync(file)) return null
    const png = PNG.sync.read(readFileSync(file))
    const { width: w, height: h, data } = png
    const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b
    const want = new Map<number, string>()
    for (const [tag, [r, g, b]] of Object.entries(id.colors)) if (tag.startsWith('prop:')) want.set(key(r, g, b), tag)
    const n = new Map<string, { all: number; top: number }>()
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, tag = want.get(key(data[i], data[i + 1], data[i + 2]))
      if (!tag) continue
      const c = n.get(tag) ?? { all: 0, top: 0 }
      c.all++; if (y === 0) c.top++
      n.set(tag, c)
    }
    const out = new Map<string, PieceCover>()
    for (const tag of want.values()) { const c = n.get(tag); out.set(tag, { share: c ? c.all / (w * h) : 0, topRow: c ? c.top / w : 0 }) }
    return out
  } catch { return null }
}

type Piece = Pick<KitItem, 'kind' | 'pieceTag' | 'label'>

/** the share of the clay depth's top row where something is drawn (not sky); null when the depth is not there */
export function topRowSolid(zdepth: string): number | null {
  try {
    if (!zdepth || !existsSync(zdepth)) return null
    const z = readChannel0(readFileSync(zdepth))
    let n = 0
    for (let x = 0; x < z.width; x++) { const v = z.data[x]; if (v > 0 && v < z.max) n++ }
    return n / z.width
  } catch { return null }
}

/**
 * The view the WORDS read (never the material references): the pieces named, and those the top edge cuts. A piece with a pieceTag
 * is in the ID pass and its own pixels decide both. Any other piece (a copy placed again with no pieceTag is drawn black there, and
 * the kit's own kinds) keeps the projection, whose height for a generated piece is a guess, so its cut is said only when the clay's
 * depth shows something drawn along the top edge (`topSolid`, topRowSolid): the aerial take's top row is all sky, so nothing there
 * runs out at the top, while the helmet close-up's untagged grandstand copy does fill it.
 */
export function wordsView<P extends Piece, V extends { pieces?: P[]; cutTop?: P[] }>(view: V | null, cover: Map<string, PieceCover> | null, topSolid: number | null = null): V | null {
  if (!view || (!cover && topSolid === null)) return view
  const own = (k: P) => (k.pieceTag ? cover?.get(k.pieceTag) : undefined)
  const edge = topSolid === null || topSolid >= MIN_TOP_ROW
  const pieces = view.pieces?.filter((k) => { const c = own(k); return !c || c.share >= MIN_SEEN_SHARE })
  const cutTop = (view.pieces ?? view.cutTop ?? []).filter((k) => { const c = own(k); return c ? c.share >= MIN_SEEN_SHARE && c.topRow >= MIN_TOP_ROW : edge && !!view.cutTop?.includes(k) })
  return { ...view, ...(pieces ? { pieces } : {}), cutTop }
}
