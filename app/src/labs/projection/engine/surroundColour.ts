// The Surround's hi-res colour (plan-build-1022 L4, E60): a separate equirect (8192 wide, or 4096) that only the far mesh
// samples; the mesh and the sky dome stay on the 2048 distance grid. 8192 × 4096 RGBA is 128 MiB (~134 MB) of GPU memory
// with no mipmaps, so it loads only when the GPU takes a texture that wide and the budget allows it; else, or when the
// decode or the upload fails, it falls back to 4096 (the same file resized while decoding), and past that to the 2048
// colour the layer already has. Sampled like a still (sources.ts sharpSampling): linear, no mipmaps, max anisotropy.
import { Texture } from 'three'
import type { SurroundColour } from '../../../shared/worldContract.ts'
import { sharpSampling } from './sources'

/** GPU bytes the hi-res colour may take (8192 × 4096 × 4 = 134 MB fits; tests pass smaller ones to force the fallback) */
export const COLOUR_BUDGET_BYTES = 160 * 1024 * 1024
/** the fallback width */
export const FALLBACK_WIDTH = 4096

export interface ColourSize { width: number; height: number }
export const textureBytes = (s: ColourSize) => s.width * s.height * 4

/** The sizes to try, largest first: the file's own, then 4096, each only if the GPU and the budget take it. */
export function colourPlan(c: SurroundColour, maxTextureSize: number, budget = COLOUR_BUDGET_BYTES): ColourSize[] {
  const sizes: ColourSize[] = [{ width: c.width, height: c.height }]
  if (c.width > FALLBACK_WIDTH) sizes.push({ width: FALLBACK_WIDTH, height: FALLBACK_WIDTH / 2 })
  return sizes.filter((s) => s.width <= maxTextureSize && textureBytes(s) <= budget)
}

/** What the far mesh draws now: the hi-res colour at `width`, or the 2048 base (`width` 0 = not hi-res). */
export interface ColourState {
  width: number
  /** why the file's own size was not used ('gpu limit', 'budget', 'decode failed', 'upload failed'), null when it was */
  fellBack: string | null
}

/** Decodes the file at a size (the file's own, or resized while decoding); throws when it cannot. */
export type ColourDecoder = (url: string, size: ColourSize, native: boolean) => Promise<TexImageSource & { width: number; height: number; close?: () => void }>

/** The browser's decoder: one fetch, then createImageBitmap (resized when asked); top row first, as the far mesh's uv. */
export const decodeBitmap: ColourDecoder = async (url, size, native) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const blob = await res.blob()
  const opts: ImageBitmapOptions = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }
  return createImageBitmap(blob, native ? opts : { ...opts, resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' })
}

export interface ColourGpu {
  maxTextureSize: number
  /** upload the texture now; false when the GPU refused it (out of memory) */
  upload(t: Texture): boolean
  budget?: number
}

/**
 * Load the hi-res colour: the first size in the plan that decodes and uploads. Null (keep the 2048 colour) when nothing
 * fits or every attempt fails. `cancelled` stops between attempts (a newer world was asked for).
 */
export async function loadColour(c: SurroundColour, gpu: ColourGpu, decode: ColourDecoder = decodeBitmap, cancelled: () => boolean = () => false):
  Promise<{ texture: Texture; state: ColourState } | null> {
  const plan = colourPlan(c, gpu.maxTextureSize, gpu.budget)
  let why: string | null = plan[0]?.width === c.width ? null : c.width > gpu.maxTextureSize ? 'gpu limit' : 'budget'
  for (const size of plan) {
    if (cancelled()) return null
    let img: Awaited<ReturnType<ColourDecoder>>
    try { img = await decode(c.url, size, size.width === c.width) } catch { why ??= 'decode failed'; continue }
    if (cancelled()) { img.close?.(); return null }
    const t = sharpSampling(new Texture(img as TexImageSource))
    t.flipY = false
    t.needsUpdate = true
    if (!gpu.upload(t)) { t.dispose(); img.close?.(); why ??= 'upload failed'; continue }
    return { texture: t, state: { width: size.width, fellBack: why } }
  }
  return null
}
