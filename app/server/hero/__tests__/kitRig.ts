// A kit take ready for the depth-locked still: the hero rig's temp public dir, a kit world played by "ana" (face + front card),
// a 25-frame take on it, a done kit clay with metric depth at frames 0, 8 and 24 (the keyframes: 8 is 25's middle on the 8-grid) (small 16-bit zdepth PNGs: a near box on
// far ground, sky above), and fake Cloud jobs that write real PNGs (a picture of the same box, or of something else). No network.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { PNG } from 'pngjs'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { biblePaths } from '../../../src/shared/bibleContract.ts'
import type { ClayExport } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import type { ObjectInfo } from '../../comfy/index.ts'
import { permissiveInfo } from '../../jobs/__tests__/rig.ts'
import { KitStore } from '../../stage3d/store.ts'
import { approveSetOnDisk } from '../../bible/__tests__/approveFixture.ts'
import { buildHeroGraph } from '../graph.ts'
import { buildQwenDepthGraph } from '../qwenGraph.ts'
import { world, type WorldOpts } from './rig.ts'

export const W = 192, H = 108, FRAMES = 25
/** the box the clay and a matching still both show: x 60..110, y 30..100 (of 192x108) */
export const BOX = { x0: 60, x1: 110, y0: 30, y1: 100 }

/** a 16-bit grey zdepth: sky (0) above y 50, ground at 40 m below, the box at 6 m (or shifted by `dx`) */
export function zdepthPng(dx = 0): Buffer {
  const png = new PNG({ width: W, height: H, bitDepth: 16, colorType: 0, inputColorType: 0, inputHasAlpha: false })
  const data = Buffer.alloc(W * H * 2)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inBox = x >= BOX.x0 + dx && x < BOX.x1 + dx && y >= BOX.y0 && y < BOX.y1
    data.writeUInt16LE(inBox ? 600 : y < 50 ? 0 : 4000, (y * W + x) * 2) // pngjs takes 16-bit input in platform (LE) order, writes BE
  }
  png.data = data
  return PNG.sync.write(png, { bitDepth: 16, colorType: 0, inputColorType: 0, inputHasAlpha: false })
}

/** an 8-bit RGB picture: grey sky, dark ground, a lit box where `box` says (matching the clay, or not) */
export function stillPng(box = BOX, w = 1920, h = 1088): Buffer {
  const png = new PNG({ width: w, height: h })
  const sx = w / W, sy = h / H
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = x / sx, gy = y / sy, inBox = gx >= box.x0 && gx < box.x1 && gy >= box.y0 && gy < box.y1
    const v = inBox ? 200 : gy < 50 ? 150 : 60, i = (y * w + x) * 4
    png.data[i] = v; png.data[i + 1] = v; png.data[i + 2] = v; png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}

/** a fake Cloud job whose every save node (s<seed> for the draw, o_<id> for the finish) writes `png` */
export const pngJob = (id: string, png: Buffer): Job => ({
  id, status: 'succeeded', metrics: { execution_ms: 9000 }, wait: async () => {},
  getOutputs: (node: string) => (/^(s\d+|o_)/.test(node) ? [{ name: 'out.png', toFile: async (p: string) => writeFileSync(p, png) }] : []),
}) as unknown as Job

export interface KitTakeOpts extends WorldOpts { depth?: boolean; castId?: string | null; bible?: Partial<BibleRecord> | null
  /** the owner approved the set (default true: a press needs it); false leaves it unapproved */ approved?: boolean }

export function kitTake(o: KitTakeOpts = {}) {
  const w = world(o)
  const kit = new KitStore(w.pub).create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]], ...(o.castId === null ? {} : { castId: o.castId ?? 'ana' }) }, description: 'kit still test' })
  if (o.approved !== false) approveSetOnDisk(w.pub, kit.id)
  const take = { ...w.take, worldId: kit.id, packId: 'mocap-0000beef', frames: FRAMES }
  writeFileSync(path.join(w.shot, 'take.json'), JSON.stringify(take))
  const clayDir = path.join(w.shot, 'clay')
  mkdirSync(clayDir, { recursive: true })
  const clay: ClayExport = { takeId: take.id, startKey: take.startKey, mp4: `/lab-assets/shots/${take.id}/clay/clay.mp4`, frames: FRAMES, width: 1920, height: 1088, status: 'done', method: 'browser',
    depth: o.depth === false ? null : { kind: 'planar', unitM: 0.01, frames: FRAMES, width: 1920, height: 1088, pattern: 'zdepth_%03d.png' } }
  writeFileSync(path.join(clayDir, 'clay.json'), JSON.stringify(clay))
  if (o.depth !== false) for (const f of [0, 8, 24]) writeFileSync(path.join(clayDir, `zdepth_${String(f).padStart(3, '0')}.png`), zdepthPng())
  if (o.bible !== undefined && o.bible !== null) {
    const bp = biblePaths(kit.id)
    mkdirSync(path.join(w.pub, bp.master), { recursive: true })
    writeFileSync(path.join(w.pub, bp.master, 'm1.png'), stillPng())
    const bible: BibleRecord = { worldId: kit.id, version: 3, prompt: '', master: null, candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null,
      createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z', ...o.bible }
    writeFileSync(path.join(w.pub, bp.file), JSON.stringify(bible))
  }
  return { ...w, take, kit, clayDir }
}
export type KitTake = ReturnType<typeof kitTake>

/** object_info that accepts the one-step hero graph, the Qwen draw and the Klein finish */
export const kitInfo = (): ObjectInfo => ({
  ...permissiveInfo(buildHeroGraph({ prompt: 'p', picks: [{ id: 'hero-x', seed: 1 }], prefix: 'x' })),
  ...permissiveInfo(buildQwenDepthGraph({ prompt: 'p', seeds: [1], prefix: 'x' })),
}) as ObjectInfo

/** the Bible's approved master as the rig writes it */
export const masterOf = (worldId: string) => ({ id: 'm1', png: `/${biblePaths(worldId).master}/m1.png`, madeBy: 'qwen-image-2512+union-depth', seed: 1, depthStrength: 0.95, jobId: null, credits: 14, createdAt: '2026-10-25T00:00:00.000Z' })
