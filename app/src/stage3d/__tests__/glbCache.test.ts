// The GLB cache (take switching): one fetch+parse per url, equivalent clones out, shared geometry never freed by a world's teardown.
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { glbCache } from '../glbCache.ts'
import { disposeTree } from '../dispose.ts'

const mesh = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshStandardMaterial())); return g }
const counting = () => { const urls: string[] = []; return { urls, load: async (u: string) => { urls.push(u); return mesh() } } }

describe('glbCache', () => {
  it('a hit returns an equivalent but distinct object without a second load', async () => {
    const c = counting(), cache = glbCache(c.load)
    const a = await cache.load('/a.glb'), b = await cache.load('/a.glb')
    expect(c.urls).toEqual(['/a.glb'])
    expect(a).not.toBe(b)
    a.position.set(5, 5, 5)
    expect(b.position.x).toBe(0) // a caller moving its clone never moves the cached original
    expect(new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).toArray()).toEqual([1, 2, 3])
  })

  it('tearing down world A leaves world B (same url) a geometry that was not freed', async () => {
    const cache = glbCache(counting().load)
    const a = await cache.load('/a.glb'), b = await cache.load('/a.glb')
    const geoB = (b.children[0] as THREE.Mesh).geometry
    const spy = vi.spyOn(geoB, 'dispose')
    disposeTree(a) // world A leaves
    expect(spy).not.toHaveBeenCalled()
    disposeTree(b) // and B too: still the cache's
    expect(spy).not.toHaveBeenCalled()
  })

  it('is bounded: the least recently used original is freed on eviction, and a failed load is retried', async () => {
    const c = counting(), cache = glbCache(c.load, 2)
    const a = await cache.load('/a'); await cache.load('/b')
    const spy = vi.spyOn((a.children[0] as THREE.Mesh).geometry, 'dispose')
    await cache.load('/a') // touch a: b is now the oldest
    await cache.load('/c')
    expect(cache.size()).toBe(2)
    expect(spy).not.toHaveBeenCalled() // a (touched) survived
    await cache.load('/b'); expect(c.urls.filter((u) => u === '/b')).toHaveLength(2) // b was evicted and reloaded
    expect(spy).toHaveBeenCalled() // which pushed a out: its original is freed
    let n = 0
    const flaky = glbCache(async () => { if (n++ === 0) throw new Error('404'); return mesh() })
    await expect(flaky.load('/x')).rejects.toThrow()
    await expect(flaky.load('/x')).resolves.toBeTruthy()
  })
})
