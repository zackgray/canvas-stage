import { DataTexture, LinearFilter, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import type { DepthImage } from '../math/depth'
import { decodePng } from '../math/png'
import type { Capture } from './capture'
import { MANIFEST_URLS, mergeManifests, parseManifest, type BankShot } from './manifest'

export type { BankDepth, BankShot } from './manifest'

const resolve = (path: string) => new URL(path, window.location.href).href

async function fetchOne(url: string): Promise<BankShot[] | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    return res.ok ? parseManifest(await res.text(), url) : null
  } catch {
    return null
  }
}

/** Shots from every manifest in MANIFEST_URLS that exists (bank, E2 MoGe maps), or null if none is there yet. */
export async function fetchManifest(): Promise<BankShot[] | null> {
  const lists = await Promise.all(MANIFEST_URLS.map(async (url) => ({ url, shots: await fetchOne(url) })))
  return mergeManifests(lists)
}

/**
 * How a still (and a performance's plate) is sampled by the warp and the lab: bilinear, never mipmapped, so a long lens
 * magnifying a plate or a minified wide shot is not run through a lower mip level and blurred; anisotropic filtering
 * (three clamps it to what the GPU has) keeps a plate seen at a grazing angle or minified on one axis from smearing.
 */
export const STILL_ANISOTROPY = 16
export function sharpSampling(t: Texture): Texture {
  t.colorSpace = SRGBColorSpace
  t.minFilter = LinearFilter
  t.magFilter = LinearFilter
  t.generateMipmaps = false
  t.anisotropy = STILL_ANISOTROPY
  return t
}

export function loadStill(path: string): Promise<Texture> {
  return new Promise((ok, fail) => {
    new TextureLoader().load(resolve(path), (t) => ok(sharpSampling(t)), undefined, () => fail(new Error(`could not load ${path}`)))
  })
}

/** Depth image normalised to [0, 1], keeping 16-bit precision when the PNG has it. */
export async function loadDepthImage(path: string): Promise<DepthImage & { bits: number }> {
  const res = await fetch(resolve(path))
  if (!res.ok) throw new Error(`could not load ${path} (${res.status})`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  try {
    const png = await decodePng(bytes)
    const max = png.bitDepth === 16 ? 65535 : 255
    const values = new Float32Array(png.width * png.height)
    for (let i = 0; i < values.length; i++) values[i] = png.data[i * png.channels] / max
    return { width: png.width, height: png.height, values, bits: png.bitDepth }
  } catch {
    // palette PNGs, JPEGs, WebP...: let the browser decode at 8 bits
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const g = canvas.getContext('2d')!
    g.drawImage(bitmap, 0, 0)
    const data = g.getImageData(0, 0, bitmap.width, bitmap.height).data
    const values = new Float32Array(bitmap.width * bitmap.height)
    for (let i = 0; i < values.length; i++) values[i] = data[i * 4] / 255
    return { width: bitmap.width, height: bitmap.height, values, bits: 8 }
  }
}

/** A captured still (top row first) as a texture; uploaded bottom row first so uv (0,0) is bottom-left. */
export function captureTexture(c: Capture): DataTexture {
  const stride = c.width * 4
  const flipped = new Uint8Array(c.rgba.length)
  for (let y = 0; y < c.height; y++) {
    flipped.set(c.rgba.subarray(y * stride, (y + 1) * stride), (c.height - 1 - y) * stride)
  }
  const t = new DataTexture(flipped, c.width, c.height)
  t.colorSpace = SRGBColorSpace
  t.minFilter = LinearFilter
  t.magFilter = LinearFilter
  t.needsUpdate = true
  return t
}
