// The surround's hi-res colour: what loads under which GPU limit and memory budget, the 4096 fallback on a GPU limit, a
// tight budget, a decode failure or an upload refusal, and the layer swapping it in (2048 colour kept when nothing loads).
import { LinearFilter, PerspectiveCamera, type Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { SurroundLayer } from './surround'
import { colourPlan, COLOUR_BUDGET_BYTES, loadColour, textureBytes, type ColourDecoder, type ColourGpu } from './surroundColour'

const HD = { url: '/c.png', width: 8192, height: 4096 }
const fakeImage = (w: number, h: number) => ({ width: w, height: h }) as unknown as ImageBitmap

/** a decoder that records what it was asked and fails on the sizes in `fail` */
function decoder(fail: number[] = []) {
  const asked: { width: number; native: boolean }[] = []
  const decode: ColourDecoder = async (_url, size, native) => {
    asked.push({ width: size.width, native })
    if (fail.includes(size.width)) throw new Error('decode failed')
    return fakeImage(size.width, size.height)
  }
  return { decode, asked }
}
const gpu = (o: Partial<ColourGpu> = {}): ColourGpu & { uploads: number[] } => {
  const uploads: number[] = []
  return { maxTextureSize: 16384, upload: (t: Texture) => { uploads.push((t.image as { width: number }).width); return true }, uploads, ...o }
}

describe('the plan', () => {
  it('8192 fits the default budget (134 MB, no mipmaps); 4096 follows as the fallback', () => {
    expect(textureBytes(HD)).toBe(134_217_728)
    expect(textureBytes(HD)).toBeLessThanOrEqual(COLOUR_BUDGET_BYTES)
    expect(colourPlan(HD, 16384).map((s) => s.width)).toEqual([8192, 4096])
    expect(colourPlan(HD, 8192).map((s) => s.width)).toEqual([8192, 4096])
  })
  it('a GPU limited to 4096 or a tight budget skips straight to 4096; a 4096 file has no fallback but the 2048', () => {
    expect(colourPlan(HD, 4096).map((s) => s.width)).toEqual([4096])
    expect(colourPlan(HD, 16384, 100e6).map((s) => s.width)).toEqual([4096])
    expect(colourPlan({ url: '', width: 4096, height: 2048 }, 16384).map((s) => s.width)).toEqual([4096])
    expect(colourPlan(HD, 2048)).toEqual([])
  })
})

describe('loading', () => {
  it('8192 decodes natively and uploads, sampled like a still (linear, no mipmaps, max anisotropy, top row first)', async () => {
    const d = decoder(), g = gpu()
    const got = (await loadColour(HD, g, d.decode))!
    expect(got.state).toEqual({ width: 8192, fellBack: null })
    expect(d.asked).toEqual([{ width: 8192, native: true }])
    const t = got.texture
    expect([t.minFilter, t.magFilter, t.generateMipmaps, t.anisotropy, t.flipY]).toEqual([LinearFilter, LinearFilter, false, 16, false])
  })
  it('falls back to 4096 (resized while decoding) on a decode failure, an upload refusal, a GPU limit or the budget', async () => {
    let d = decoder([8192])
    expect((await loadColour(HD, gpu(), d.decode))!.state).toEqual({ width: 4096, fellBack: 'decode failed' })
    expect(d.asked).toEqual([{ width: 8192, native: true }, { width: 4096, native: false }])
    const g = gpu({ upload: (t: Texture) => (t.image as { width: number }).width <= 4096 })
    expect((await loadColour(HD, g, decoder().decode))!.state).toEqual({ width: 4096, fellBack: 'upload failed' })
    d = decoder()
    expect((await loadColour(HD, gpu({ maxTextureSize: 4096 }), d.decode))!.state).toEqual({ width: 4096, fellBack: 'gpu limit' })
    expect(d.asked).toEqual([{ width: 4096, native: false }])
    expect((await loadColour(HD, gpu({ budget: 100e6 }), decoder().decode))!.state).toEqual({ width: 4096, fellBack: 'budget' })
  })
  it('nothing fits or loads: null (the layer keeps its 2048 colour); a cancelled load stops', async () => {
    expect(await loadColour(HD, gpu(), decoder([8192, 4096]).decode)).toBeNull()
    expect(await loadColour(HD, gpu({ maxTextureSize: 2048 }), decoder().decode)).toBeNull()
    expect(await loadColour(HD, gpu(), decoder().decode, () => true)).toBeNull()
  })
})

describe('the layer', () => {
  const W = 16, H = 8
  const meta = (o: Record<string, unknown> = {}) => ({
    url: '', distUrl: '', width: W, height: H, distMetersPerUnit: 1, up: [0, 1, 0] as [number, number, number], levelMethod: 'floor-ransac' as const,
    interior: false, batch: '', seed: 1, prompt: '', scaleToStill: 1, residualMedianPct: 0, skyShare: 0, pickedAt: 't', ...o,
  })
  const layerWith = (m: ReturnType<typeof meta>) => {
    const layer = new SurroundLayer(new PerspectiveCamera())
    layer.setData({ meta: m, rgb: new Uint8Array(W * H * 3), channels: 3, dist: new Float32Array(W * H).fill(5) })
    return layer
  }
  const mapOf = (l: SurroundLayer) => (l.far!.material as unknown as { uniforms: { map: { value: Texture } } }).uniforms.map.value

  it('swaps the far mesh to the hi-res colour; the dome stays on the 2048 grid', async () => {
    const layer = layerWith(meta({ colourUrl: '/hd.png', colourWidth: 8192, colourHeight: 4096 }))
    const base = mapOf(layer)
    layer.gpu = gpu()
    layer.decoder = decoder().decode
    await layer.loadHiRes(layer.meta!)
    expect(layer.colour).toEqual({ width: 8192, fellBack: null })
    expect(mapOf(layer)).not.toBe(base)
    expect((mapOf(layer).image as { width: number }).width).toBe(8192)
    expect(((layer.dome!.material as unknown as { uniforms: { sky: { value: Texture } } }).uniforms.sky.value.image as { width: number }).width).toBe(W)
  })
  it('keeps the 2048 colour on a world without one, without a GPU, or when nothing loads', async () => {
    for (const [m, g, d] of [
      [meta(), gpu(), decoder()], [meta({ colourUrl: '/hd.png', colourWidth: 8192, colourHeight: 4096 }), null, decoder()],
      [meta({ colourUrl: '/hd.png', colourWidth: 8192, colourHeight: 4096 }), gpu(), decoder([8192, 4096])],
    ] as const) {
      const layer = layerWith(m)
      const base = mapOf(layer)
      layer.gpu = g
      layer.decoder = d.decode
      await layer.loadHiRes(layer.meta!)
      expect(mapOf(layer)).toBe(base)
    }
  })
})
