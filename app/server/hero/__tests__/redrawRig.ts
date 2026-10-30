// A kit take ready for the still judge and its redraws: kitRig's take, played by "ana", with a tagged extra (@tom, his own card), an
// untagged crowd extra, an ID pass at frame 0 (hero red, @tom blue, the trunk its own orange, two lamps sharing yellow as an old
// export did), a board tile for the trunk, and a still that has ana on her mark and nobody where tom stands. Fake Cloud jobs write
// an all-magenta "redraw" so a paste outside its mask would show. No network.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { PNG } from 'pngjs'
import type { BibleElement } from '../../../src/shared/bibleContract.ts'
import type { HeroStill } from '../../../src/shared/shotContract.ts'
import { permissiveInfo } from '../../jobs/__tests__/rig.ts'
import { KitStore } from '../../stage3d/store.ts'
import { buildRedrawGraph, PROP_CROP } from '../redrawGraph.ts'
import { kitInfo, kitTake } from './kitRig.ts'

/** the ID frame is the clay's 192x108; the still is 384x216 (so every box is scaled x2) */
export const IW = 192, IH = 108, SW = 384, SH = 216
type Box = { x0: number; x1: number; y0: number; y1: number }
export const ANA: Box = { x0: 40, x1: 52, y0: 20, y1: 90 }
export const TOM: Box = { x0: 120, x1: 132, y0: 25, y1: 95 }
export const CROWD: Box = { x0: 160, x1: 166, y0: 50, y1: 70 }
export const TRUNK: Box = { x0: 70, x1: 100, y0: 70, y1: 95 }
export const LAMP: Box = { x0: 10, x1: 14, y0: 10, y1: 60 }
const RGB = { hero: [255, 0, 0], 'extra:0:0': [0, 0, 255], 'extra:1:2': [120, 255, 0], 'prop:trunk': [255, 160, 0], 'prop:lamp': [255, 255, 0], 'prop:post': [255, 255, 0] } as Record<string, [number, number, number]>

function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const p = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = px(x, y), i = (y * w + x) * 4; p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = 255 }
  return PNG.sync.write(p)
}
const inside = (b: Box, x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1

/** the ID frame: each entity in its colour on black */
export const idPng = () => png(IW, IH, (x, y) => (inside(ANA, x, y) ? RGB.hero : inside(TOM, x, y) ? RGB['extra:0:0'] : inside(CROWD, x, y) ? RGB['extra:1:2']
  : inside(TRUNK, x, y) ? RGB['prop:trunk'] : inside(LAMP, x, y) ? RGB['prop:lamp'] : [0, 0, 0]))
/** the still (2x): ana bright on her mark, a trunk, a soft ground; nobody at tom's place (`withTom` draws him) */
export const stillPng = (withTom = false) => png(SW, SH, (x, y) => {
  const gx = x / 2, gy = y / 2
  if (inside(ANA, gx, gy) || (withTom && inside(TOM, gx, gy))) return [230, 220, 210]
  if (inside(TRUNK, gx, gy)) return [90, 60, 30]
  return gy < 50 ? [120, 130, 140] : [70, 70, 70]
})
/** a still of the empty set: nobody on any mark */
export const emptyStill = () => png(SW, SH, (_x, y) => (y / 2 < 50 ? [120, 130, 140] : [70, 70, 70]))
export const MAGENTA = png(SW, SH, () => [255, 0, 255])

export const redrawJob = (id: string, o: { wait?: () => Promise<void>; status?: string; picture?: Buffer } = {}): Job => ({
  id, status: o.status ?? 'succeeded', metrics: { execution_ms: 11000 }, wait: o.wait ?? (async () => {}),
  getOutputs: (node: string) => (node === 'out' ? [{ name: 'out.png', toFile: async (p: string) => writeFileSync(p, o.picture ?? MAGENTA) }] : []),
}) as unknown as Job

export const STILL_ID = 'hero-2026-10-25T10-00-00-000-1'

export function redrawTake(o: { idPass?: boolean; withTom?: boolean; cap?: number } = {}) {
  const t = kitTake({ bible: { elements: [] }, cap: o.cap })
  // @tom's card, then the Bible: his cast element and the trunk's board tile
  const projFile = path.join(t.pub, 'lab-assets', 'projects', 'default', 'project.json')
  const proj = JSON.parse(readFileSync(projFile, 'utf8'))
  const tomFace = '/lab-assets/cast/tom/face.png'
  mkdirSync(path.join(t.pub, 'lab-assets', 'cast', 'tom'), { recursive: true }); writeFileSync(path.join(t.pub, tomFace), 'img')
  proj.ingredients.cast.push({ id: 'tom', name: 'Tom', versions: [{ version: 1, created: '2026-10-20T00:00:00.000Z', payload: { name: 'Tom', description: 'A lean young man with tousled brown hair. He carries a trunk.', references: ['/lab-assets/cast/tom/front.png', tomFace], sheets: [] } }] })
  writeFileSync(projFile, JSON.stringify(proj))
  const tile = `/lab-assets/locations/${t.kit.id}/bible/elements/trunk.png`
  mkdirSync(path.dirname(path.join(t.pub, tile)), { recursive: true }); writeFileSync(path.join(t.pub, tile), 'img')
  const bibleFile = path.join(t.pub, 'lab-assets', 'locations', t.kit.id, 'bible', 'bible.json')
  const bible = JSON.parse(readFileSync(bibleFile, 'utf8'))
  bible.elements = [{ tag: 'tom', kind: 'cast', cardId: 'tom', refs: [], line: 'Tom' }, { tag: 'trunk', kind: 'prop', refs: [tile], line: 'a heavy worn leather trunk with brass fittings.' },
    { tag: 'lamp', kind: 'prop', refs: [tile], line: 'a lamp' }] satisfies BibleElement[]
  writeFileSync(bibleFile, JSON.stringify(bible))
  new KitStore(t.pub).savePerformance(t.kit.id, { path: [[0, -20], [0, 4]], castId: 'ana',
    extras: [{ path: [[2, -10], [2, -9]], gait: 'walk', delay: 0, costume: 'modern', variant: 0, tag: 'tom', stand: true }, { path: [[4, -10], [4, -5]], gait: 'walk', delay: 0, costume: 'modern', variant: 2 }] })
  if (o.idPass !== false) {
    writeFileSync(path.join(t.clayDir, 'id_000.png'), idPng())
    const clay = JSON.parse(readFileSync(path.join(t.clayDir, 'clay.json'), 'utf8'))
    writeFileSync(path.join(t.clayDir, 'clay.json'), JSON.stringify({ ...clay, idPass: { frames: [0, 12, 24], pattern: 'id_%03d.png', colors: RGB } }))
  }
  const still: HeroStill = { id: STILL_ID, takeId: t.take.id, startKey: t.take.startKey, png: `/lab-assets/shots/${t.take.id}/hero/${STILL_ID}.png`, seed: 5, jobId: 'j-1', credits: 21,
    approved: true, createdAt: '2026-10-25T10:00:00.000Z', role: 'opening', frame: 0 }
  writeFileSync(path.join(t.heroDir, `${STILL_ID}.png`), stillPng(o.withTom))
  writeFileSync(path.join(t.heroDir, `${STILL_ID}.json`), JSON.stringify(still))
  const info = { ...kitInfo(), ...permissiveInfo(buildRedrawGraph('p', 1, PROP_CROP, 'x')) }
  return { ...t, still, info }
}
export type RedrawTake = ReturnType<typeof redrawTake>
