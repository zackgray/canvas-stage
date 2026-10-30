// Built pieces' GLBs are immutable (stamped per build, never rewritten), so a parsed one is kept by URL across worlds: switching
// between takes with different sets re-parses nothing. Each hand-out is a deep clone (own transforms, own materials) whose meshes
// SHARE the cached geometry; those geometries are marked shared (dispose.ts), so a world's teardown never frees what the next world
// built from the same file still draws. Bounded LRU; an evicted original's geometry is freed (a live clone would only re-upload it).
import * as THREE from 'three'
import { sharedGeometry } from './dispose.ts'

export type GlbLoad = (url: string) => Promise<THREE.Object3D>

export const GLB_CACHE_MAX = 32

export interface GlbCacheHandle { load: GlbLoad; size(): number; clear(): void }

function freeOriginal(o: THREE.Object3D) {
  const seen = new Set<THREE.BufferGeometry>()
  o.traverse((c) => { const g = (c as THREE.Mesh).geometry; if (g && !seen.has(g)) { seen.add(g); g.dispose() } })
}

export function glbCache(load: GlbLoad, max = GLB_CACHE_MAX): GlbCacheHandle {
  const parsed = new Map<string, Promise<THREE.Object3D>>() // insertion order = least recently used first
  const evict = (url: string) => { const p = parsed.get(url); parsed.delete(url); p?.then(freeOriginal, () => {}) }
  const fn: GlbLoad = (url) => {
    let p = parsed.get(url)
    if (p) { parsed.delete(url); parsed.set(url, p) } // touch
    else {
      const q = load(url).then((o) => { o.traverse((c) => { const g = (c as THREE.Mesh).geometry; if (g) sharedGeometry(g) }); return o })
      p = q; parsed.set(url, q)
      q.catch(() => { if (parsed.get(url) === q) parsed.delete(url) }) // a file still being written is tried again next time
      while (parsed.size > max) evict(parsed.keys().next().value as string)
    }
    return p.then((o) => o.clone(true))
  }
  return { load: fn, size: () => parsed.size, clear: () => { for (const u of [...parsed.keys()]) evict(u) } }
}

/** a loader that parses each url once and hands out deep clones (bounded; see glbCache) */
export function memoGlb(load: GlbLoad): GlbLoad { return glbCache(load).load }
