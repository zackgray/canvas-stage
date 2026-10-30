// Test helper: the real Stage3D performer (CMU BVH from public/mocap), with fetch served from the app's public/ folder.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { vi } from 'vitest'
import type { PerformancePlan, Performer3D } from '../../../../stage3d/contract'
import { createPerformer } from '../../../../stage3d/performer'

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'public')

/** fetch of a site path (/mocap/...) answered from public/ */
export function servePublic() {
  vi.stubGlobal('fetch', async (u: string) => {
    const file = path.join(PUBLIC, decodeURIComponent(String(u).split('?')[0]))
    const buf = readFileSync(file)
    return { ok: true, status: 200, text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), json: async () => JSON.parse(buf.toString('utf8')) }
  })
}

export const flatGround = () => 0

export async function performer(plan: PerformancePlan): Promise<Performer3D> {
  servePublic()
  return createPerformer(plan, flatGround)
}

/** every mesh's world matrix under `o`, flattened (what a frame looks like) */
export function snapshot(o: import('three').Object3D): number[] {
  o.updateMatrixWorld(true)
  const out: number[] = []
  o.traverse((c) => { if ((c as import('three').Mesh).isMesh) out.push(...c.matrixWorld.elements) })
  return out
}
