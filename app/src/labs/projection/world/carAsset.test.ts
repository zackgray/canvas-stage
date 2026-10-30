import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAR_ASSET, CAR_LAB_ASSET, carMesh, loadCar, loadCarFrom, parseCar, type CarMeta } from './carAsset'

/** A one-triangle car in the e24_car.ts layout: positions, colours, indices back to back. */
function tinyCar() {
  const pos = new Float32Array([-2.25, 0, -1, 2.25, 0, -1, 0, 1.4, 1])
  const col = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
  const idx = new Uint32Array([0, 1, 2])
  const bin = new Uint8Array(pos.byteLength + col.byteLength + idx.byteLength)
  bin.set(new Uint8Array(pos.buffer), 0)
  bin.set(new Uint8Array(col.buffer), 36)
  bin.set(new Uint8Array(idx.buffer), 72)
  const meta: CarMeta = { vertices: 3, layout: { positions: [0, 36], colors: [36, 36], indices: [72, 12] }, sizeM: [4.5, 1.4, 2] }
  return { meta, bin: bin.buffer }
}

afterEach(() => vi.unstubAllGlobals())

describe('car asset (car-a.bin / .json)', () => {
  it('slices the bin by the layout into a coloured, indexed mesh', () => {
    const { meta, bin } = tinyCar()
    const a = parseCar(meta, bin)
    expect([...a.positions.slice(3, 6)]).toEqual([2.25, 0, -1])
    expect([...a.indices]).toEqual([0, 1, 2])
    expect(a.size).toEqual([4.5, 1.4, 2])
    const m = carMesh(a)
    expect(m.geometry.getAttribute('color').count).toBe(3)
    expect(m.geometry.getAttribute('normal').count).toBe(3)
  })
  it('measures the size when the meta has none; throws on a short bin', () => {
    const { meta, bin } = tinyCar()
    expect(parseCar({ ...meta, sizeM: undefined }, bin).size.map((v) => +v.toFixed(3))).toEqual([4.5, 1.4, 2])
    expect(() => parseCar(meta, bin.slice(0, 40))).toThrow(/too short/)
  })
  it('missing on disk (404, or the dev server\'s HTML fallback): a reason, not a throw', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    expect(await loadCarFrom('/x')).toEqual({ missing: '/x.bin/.json not found' })
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    expect(await loadCarFrom('/x')).toEqual({ missing: '/x.bin/.json not found' })
    expect(await loadCar()).toEqual({ missing: `${CAR_ASSET}.bin/.json not found; ${CAR_LAB_ASSET}.bin/.json not found` })
  })
  it('loads json + bin through fetch', async () => {
    const { meta, bin } = tinyCar()
    vi.stubGlobal('fetch', async (url: string) => url.endsWith('.json')
      ? new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } })
      : new Response(bin))
    const got = await loadCarFrom('/lab-assets/experiments/e24/car-a')
    expect('mesh' in got && got.size).toEqual([4.5, 1.4, 2])
  })
  it('the committed car first; the raw lab mesh only when the committed one is missing', async () => {
    const { meta, bin } = tinyCar()
    const asked: string[] = []
    const serve = (has: string[]) => async (url: string) => {
      asked.push(url)
      if (!has.some((b) => url.startsWith(b))) return new Response('', { status: 404 })
      return url.endsWith('.json') ? new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }) : new Response(bin)
    }
    vi.stubGlobal('fetch', serve([CAR_ASSET, CAR_LAB_ASSET]))
    expect(await loadCar()).toMatchObject({ base: CAR_ASSET })
    expect(asked.some((u) => u.startsWith(CAR_LAB_ASSET))).toBe(false)
    vi.stubGlobal('fetch', serve([CAR_LAB_ASSET]))
    expect(await loadCar()).toMatchObject({ base: CAR_LAB_ASSET })
  })
  it('baked normals are used as stored, not recomputed', () => {
    const { meta, bin } = tinyCar()
    const nor = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0])
    const withN = new Uint8Array(bin.byteLength + 36)
    withN.set(new Uint8Array(bin), 0)
    withN.set(new Uint8Array(nor.buffer), bin.byteLength)
    const m = carMesh(parseCar({ ...meta, layout: { ...meta.layout, normals: [bin.byteLength, 36] } }, withN.buffer))
    expect([...m.geometry.getAttribute('normal').array]).toEqual([...nor])
  })
})

describe('the committed car (public/assets/car)', () => {
  const read = (ext: string) => readFileSync(new URL(`../../../../public${CAR_ASSET}.${ext}`, import.meta.url))
  it('is the decimated, normals-baked, coloured stage car in the E24 frame', () => {
    const meta = JSON.parse(read('json').toString('utf8')) as CarMeta & { triangles: number }
    const raw = read('bin')
    const a = parseCar(meta, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))
    expect(meta.triangles).toBeLessThanOrEqual(100_000)
    expect(a.indices.length).toBe(meta.triangles * 3)
    expect(raw.byteLength).toBeLessThan(5_000_000)
    expect(a.normals).not.toBeNull()
    expect(a.colors).not.toBeNull()
    expect(a.size[0]).toBeCloseTo(4.5, 1)
    expect(a.size[2]).toBeCloseTo(2, 1)
    expect(a.indices.reduce((m, i) => Math.max(m, i), 0)).toBeLessThan(meta.vertices)
  })
})
