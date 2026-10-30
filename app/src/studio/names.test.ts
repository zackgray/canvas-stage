import { describe, expect, it } from 'vitest'
import { displayName, locationName, scrubIds, stampOf } from './names'

describe('display names', () => {
  it('reads the timestamp as written', () => {
    expect(stampOf('loc-2026-10-18T03-44-47-686')).toBe('18 Oct 03:44')
    expect(stampOf('perf-2026-10-19t21-56-20-955z-bmvft9k16-t1-lift')).toBe('19 Oct 21:56')
    expect(stampOf('2026-10-19T22:38:34.204Z')).toBe('19 Oct 22:38')
    expect(stampOf('warehouse-fight')).toBeNull()
  })

  it('names ids by kind and date, never showing the id', () => {
    for (const id of ['loc-2026-10-18T03-44-47-686', 'perf-2026-10-19t21-56-20-955z-bmvft9k16-t1-lift', 'warp-2026-10-19T22-31-01', 'realism-2026-10-19T22-31-01-123']) {
      const n = displayName(id)
      expect(n).not.toMatch(/loc-|\d{4}-\d{2}-\d{2}T|bmvft/i)
    }
    expect(displayName('loc-2026-10-18T03-44-47-686')).toBe('Location · 18 Oct 03:44')
    expect(displayName('perf-2026-10-19t21-56-20-955z-bmvft9k16-t1-lift')).toBe('Performance · 19 Oct 21:56 · lift')
  })

  it('turns slugs into words', () => {
    expect(displayName('warehouse-fight-cast-1d')).toBe('Warehouse fight cast 1d')
    expect(displayName('e61-standin-c-lift')).toBe('E61 standin c lift')
  })

  it('names a set by the user, else by the first words of its description', () => {
    expect(locationName('loc-2026-10-18T03-44-47-686', { name: ' Warehouse ' })).toBe('Warehouse')
    expect(locationName('loc-2026-10-18T03-44-47-686', { prompt: 'a derelict brick warehouse, shafts of dust' })).toBe('Derelict Brick Warehouse')
    expect(locationName('loc-2026-10-18T03-44-47-686')).toBe('Location · 18 Oct 03:44')
  })

  it('names a set from the place its description names, not the photographic preamble', () => {
    const name = (prompt: string) => locationName('loc-2026-10-19T19-43-09-985', { prompt })
    expect(name('A photograph taken standing in one place: a muddy medieval battlefield at dusk, smoke drifting')).toBe('Muddy Medieval Battlefield')
    expect(name('medieval battlefield (panorama, 120°). Photo, 38mm lens')).toBe('Medieval Battlefield')
    expect(name('a disused brick warehouse on a sunny afternoon, cast-iron columns')).toBe('Disused Brick Warehouse')
    expect(name('A low shot, the camera just above the ground, of a muddy moody and dark medieval battlefield')).toBe('Muddy Moody')
  })

  it('scrubs ids out of a sentence', () => {
    const out = scrubIds('Saved to view-2026-10-19T22-31-01 and loc-2026-10-18T03-44-47-686.')
    expect(out).not.toMatch(/loc-|2026-10/)
    expect(out).toContain('View · 19 Oct 22:31')
  })
})

import { worldOptions } from './names'
describe('worldOptions', () => {
  it('uses a given name, and dates sets that would share a name', () => {
    const p = 'A photograph taken standing in one place: a muddy medieval battlefield at dusk'
    const opts = worldOptions([
      { id: 'loc-2026-10-21T20-27-13-766', prompt: p },
      { id: 'loc-2026-10-22T13-56-07-249', prompt: p },
      { id: 'loc-2026-10-23T16-13-07-001', name: 'Battlefield best', prompt: p },
    ])
    expect(opts.map((o) => o.label)).toEqual(['Muddy Medieval Battlefield · 21 Oct 20:27', 'Muddy Medieval Battlefield · 22 Oct 13:56', 'Battlefield best'])
  })
})

describe('set names are noun phrases, not clauses cut mid-way', () => {
  const name = (prompt: string) => locationName('loc-2026-10-24T10-00-00-001', { prompt })
  it.each([
    ['Long grass running along a muddy bank.', 'Long Grass'],
    ['Rail fences along the track, a low bank two metres high.', 'Rail Fences'],
    ['Dawn breaks over a desolate, snowy mountain platform. conductor, in a heavy uniform, assists traveller.', 'Desolate Snowy Mountain Platform'],
    ['Set: Dawn breaks over the camp', 'Camp'],
    ['Set in the old harbour, gulls wheeling', 'Old Harbour'],
    ['A lighthouse at dusk', 'Lighthouse'],
  ])('%s -> %s', (prompt, want) => {
    const got = name(prompt)
    expect(got).toBe(want)
    expect(got.split(' ').length).toBeLessThanOrEqual(4)
  })
})
