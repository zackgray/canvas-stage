// E39 viewport preview (lab-only): the fitted 3D bodies of a performance, baked per frame in the pack's source-camera
// space (experiments/e39_viewport_export.ts). One shared index buffer + static colours + per-frame positions per object.

export const BODIES_URL = '/lab-assets/experiments/e39/viewport'

export interface BodyObject {
  id: string
  name: string
  kind: 'body' | 'gear'
  verts: number
  tris: number
  colorsOffset: number
  indexOffset: number
  posOffset: number
}
export interface BodiesMeta { packId: string; frames: number; fps: number; bytes: number; objects: BodyObject[] }

export interface BodyData {
  meta: BodiesMeta
  objects: { obj: BodyObject; colors: Uint8Array; indices: Uint32Array; positions: Float32Array }[]
}

type Fetch = typeof fetch

/** The preview cache for this pack, or null when there is none (a missing file is the normal case). */
export async function fetchBodiesMeta(packId: string, f: Fetch = fetch): Promise<BodiesMeta | null> {
  try {
    const res = await f(`${BODIES_URL}/bodies.json`, { cache: 'no-store' })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null
    const m = (await res.json()) as BodiesMeta
    return m && m.packId === packId && Array.isArray(m.objects) && m.frames > 0 ? m : null
  } catch { return null }
}

export async function fetchBodies(meta: BodiesMeta, f: Fetch = fetch): Promise<BodyData> {
  const res = await f(`${BODIES_URL}/bodies.bin`)
  if (!res.ok) throw new Error(`bodies.bin: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  if (buf.byteLength < meta.bytes) throw new Error(`bodies.bin is ${buf.byteLength} bytes, expected ${meta.bytes}`)
  const objects = meta.objects.map((obj) => ({
    obj,
    colors: new Uint8Array(buf, obj.colorsOffset, obj.verts * 3),
    indices: new Uint32Array(buf, obj.indexOffset, obj.tris * 3),
    positions: new Float32Array(buf, obj.posOffset, meta.frames * obj.verts * 3),
  }))
  return { meta, objects }
}

