import { describe, expect, it, vi } from 'vitest'
import { Object3D } from 'three'
import { SurroundLayer } from './surround'
import { plateSourceOf, resolveWorldId } from './worldId'

const metas: Record<string, unknown> = {
  'loc-plate': { registered: { source: 'place:perf-1', from: 'loc-world' } },
  'loc-world': { surround: undefined },
}
const fetcher = async (u: string) => {
  const id = /locations\/([^/]+)\/meta\.json/.exec(u)![1]
  return { ok: id in metas, json: async () => metas[id] }
}

describe('world id', () => {
  it('reads a plate source from registered.source/from', () => {
    expect(plateSourceOf(metas['loc-plate'])).toBe('loc-world')
    expect(plateSourceOf({ registered: { source: 'lift:x', from: 'a' } })).toBeNull()
    expect(plateSourceOf(null)).toBeNull()
  })
  it('a plate resolves to its source world; a world and an unknown id stay themselves', async () => {
    expect(await resolveWorldId('loc-plate', fetcher)).toBe('loc-world')
    expect(await resolveWorldId('loc-world', fetcher)).toBe('loc-world')
    expect(await resolveWorldId('loc-missing', fetcher)).toBe('loc-missing')
  })
  it('a performance whose pack location is a plate hands the layer the SOURCE world, and follow cannot override it', async () => {
    const layer = new SurroundLayer(new Object3D())
    const load = vi.spyOn(layer, 'load').mockResolvedValue()
    const world = await resolveWorldId('loc-plate' /* pack.locationId */, fetcher)
    layer.setWorld(world)
    expect(load).toHaveBeenCalledWith('loc-world')
    layer.follow(null) // a DataTexture / empty source used to clear the layer
    layer.follow({ texture: { image: { src: '/lab-assets/locations/loc-plate/still.png' } } } as never)
    expect(load).toHaveBeenCalledTimes(1)
    expect(layer.worldId).toBe('loc-world')
    // and the warp export draws it: the layer is part of the capture inside withSurroundCapture
    layer.captureOn(() => expect(layer.inCapture).toBe(true))
  })
})
