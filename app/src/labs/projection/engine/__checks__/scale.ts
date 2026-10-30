// A5 browser check (headless Chromium, scale.check.mjs drives it): on the 766 fixture world, the warp export's frame at the
// master camera before (s = 1) and after the world root scale (+ ground match), set pixels PSNR; then the surround's hi-res
// colour through the real loader and GPU: 8192 under the budget, and the 4096 fallback on a GPU limit and a decode failure.
// Results land on window.__a5. Reads the fixture copies and (read-only) the E60 8192 upscale.
import { PerspectiveCamera } from 'three'
import { parsePerformance } from '../../../../project/performance'
import { focalFromVfov, toRad } from '../../math/camera'
import { decodePng } from '../../math/png'
import { cropActors } from '../../performance/decode'
import { PerformanceLayer } from '../../performance/PerformanceLayer'
import { renderColor, renderDepth } from '../capture'
import { parseLevelFile } from '../level'
import { shotSource } from '../modes'
import { loadDepthImage, loadStill } from '../sources'
import { Stage } from '../Stage'
import { withSurroundCapture } from '../surround'
import { decodeBitmap, textureBytes, type ColourDecoder } from '../surroundColour'
import { distanceMetres } from '../surroundMesh'
import { lensVfovOf, worldScaleOf } from '../worldScale'
import { setFloorOf } from '../worldScaleFetch'

const FIX = '/src/labs/projection/engine/__fixtures__/world766'
const HD_URL = '/lab-assets/experiments/e60/b-nomos-8192.png' // E60's 8192 Nomos upscale (571's pano), read only
const W = 960, H = 544
const out: Record<string, unknown> = {}
declare global { interface Window { __a5?: Record<string, unknown> } }

const json = async (u: string) => (await fetch(u)).json()
const png = async (u: string) => decodePng(new Uint8Array(await (await fetch(u)).arrayBuffer()))

function psnr(a: Uint8Array, b: Uint8Array, mask: (i: number) => boolean): { db: number; pixels: number; maxDiff: number } {
  let se = 0, n = 0, maxDiff = 0
  for (let i = 0; i < a.length / 4; i++) {
    if (!mask(i)) continue
    for (let c = 0; c < 3; c++) { const d = a[i * 4 + c] - b[i * 4 + c]; se += d * d; maxDiff = Math.max(maxDiff, Math.abs(d)) }
    n++
  }
  const mse = se / Math.max(1, n * 3)
  return { db: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), pixels: n, maxDiff }
}

async function warpCheck(stage: Stage) {
  const meta = await json(`${FIX}/meta.json`)
  const level = parseLevelFile(await json(`${FIX}/level.json`))
  const [texture, image] = await Promise.all([loadStill(`${FIX}/still.png`), loadDepthImage(`${FIX}/depth-moge-2.png`)])
  const shot = { id: 'world766', width: 1920, height: 1088 } as never
  const src = shotSource({ shot, texture, image, convention: 'near-dark', bits: image.bits }, { mode: 'linear', scale: meta.depth.metersPerUnit * 65535, shift: 0 }, { dequantize: false, sharpen: 3, edge: 0.04 })
  stage.setProjectorLens(focalFromVfov(toRad(meta.lens.vfovDeg), 1920 / 1088), 1920 / 1088)
  stage.setSource(src)
  stage.rebuild({ step: 2, edgeThreshold: 0.04, planeAware: true, grazeDeg: 86 })
  // the surround from the fixture's distance (colour: a lon/lat ramp, so its pixels are checkable too)
  const dist = await png(`${FIX}/surround-dist.png`)
  const s = meta.surround
  const rgb = new Uint8Array(s.width * s.height * 3)
  for (let i = 0; i < s.width * s.height; i++) { rgb[i * 3] = (i % s.width) * 255 / s.width; rgb[i * 3 + 1] = Math.floor(i / s.width) * 255 / s.height; rgb[i * 3 + 2] = ((i * 7) % 97) * 2 }
  stage.surround.setData({ meta: s, rgb, channels: 3, dist: distanceMetres(dist.data, s.distMetersPerUnit) })
  // the E78 soldier's frame 0 on the clock (colour blank: the fixture keeps depth + mask only)
  const pack = parsePerformance(await (await fetch(`${FIX}/e78/manifest.json`)).text())
  const blank = { width: pack.width, height: pack.height, channels: 3 as const, bitDepth: 8 as const, data: new Uint8Array(pack.width * pack.height * 3).fill(200) }
  const crops = await Promise.all(Array.from({ length: pack.frames }, async (_, i) => i === 0
    ? cropActors(0, blank, await png(`${FIX}/e78/frames/depth_000.png`), await png(`${FIX}/e78/frames/mask_000.png`), pack.depth.metersPerUnit)
    : { index: i, x0: 0, y0: 0, w: 0, h: 0, rgba: new Uint8Array(0), depth: new Uint16Array(0), metersPerUnit: pack.depth.metersPerUnit }))
  stage.world.setPerformance(new PerformanceLayer(pack, crops))
  // the warp export's render at the master camera (warpExport.ts: offscreenAt + withSurroundCapture, 960 × 544)
  const cam = new PerspectiveCamera(stage.projector.fov, W / H, stage.view.near, stage.view.far)
  cam.position.copy(stage.projector.position)
  cam.quaternion.copy(stage.projector.quaternion)
  cam.updateMatrixWorld(true)
  const frame = () => withSurroundCapture(stage, () => stage.offscreenAt(0, () => ({
    rgba: renderColor(stage.renderer, stage.scene, cam, W, H), depth: renderDepth(stage.renderer, stage.scene, cam, W, H),
  })))
  const setOnly = () => stage.offscreenAt(0, () => renderDepth(stage.renderer, stage.scene, cam, W, H)) // no surround: the set (+ actor)
  stage.setWorldScale(1, null)
  const before = frame(), setBefore = setOnly()
  const ws = worldScaleOf(meta, level, lensVfovOf(meta))
  stage.setWorldScale(ws.s, setFloorOf(ws))
  const after = frame(), setAfter = setOnly()
  const set = (i: number) => setBefore[i] > 0 && setAfter[i] > 0
  out.warp = {
    s: ws.s, groundMatched: stage.surround.groundMatched,
    setPixels: psnr(before.rgba, after.rgba, set), allPixels: psnr(before.rgba, after.rgba, () => true),
    surroundPixels: psnr(before.rgba, after.rgba, (i) => !set(i)),
    depthRatio: (() => { const r: number[] = []; for (let i = 0; i < W * H; i += 97) if (set(i)) r.push(setAfter[i] / setBefore[i]); r.sort((a, b) => a - b); return r[r.length >> 1] })(),
  }
}

async function colourCheck(stage: Stage) {
  const layer = stage.surround
  const gpu = layer.gpu!
  const meta = { ...layer.meta!, colourUrl: HD_URL, colourWidth: 8192, colourHeight: 4096 }
  const run = async (label: string, o: { maxTextureSize?: number; decoder?: ColourDecoder }) => {
    layer.gpu = { ...gpu, maxTextureSize: o.maxTextureSize ?? gpu.maxTextureSize }
    layer.decoder = o.decoder
    const t0 = performance.now()
    await layer.loadHiRes(meta as never)
    const ms = performance.now() - t0
    const w = layer.colour.width
    out[label] = { ...layer.colour, ms: Math.round(ms), gpuBytes: w ? textureBytes({ width: w, height: w / 2 }) : 0, budget: 160 * 1024 * 1024 }
  }
  out.maxTextureSize = gpu.maxTextureSize
  await run('hd8192', {})
  await run('gpuLimit4096', { maxTextureSize: 4096 })
  const failNative: ColourDecoder = async (url, size, native) => { if (native) throw new Error('simulated decode failure'); return decodeBitmap(url, size, native) }
  await run('decodeFail', { decoder: failNative })
  layer.gpu = gpu
  layer.decoder = undefined
}

async function main() {
  const stage = new Stage(document.getElementById('host')!)
  try {
    await warpCheck(stage)
    await colourCheck(stage)
  } catch (e) {
    out.error = e instanceof Error ? `${e.message}\n${e.stack}` : String(e)
  }
  window.__a5 = out
}
void main()
