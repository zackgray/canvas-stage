import { describe, expect, it } from 'vitest'
import { NO_PROJECT } from './projectTypes'
import { shellProject, staleIn } from './shellProject'

describe('shell project adapter', () => {
  it('runs with no project: no name, nothing stale', () => {
    const p = shellProject(NO_PROJECT)
    expect(p).toMatchObject({ available: false, name: null, loading: false, error: null })
    expect(p.isStale('still-1', 'view-1')).toBe(false)
  })

  it('reads the name and the error of a loaded project', () => {
    const p = shellProject({ project: { name: 'Night alley' }, staleness: null, loading: false, error: new Error('offline') })
    expect(p).toMatchObject({ available: true, name: 'Night alley', error: 'offline' })
    expect(shellProject({ project: { id: 1 }, staleness: null, loading: true, error: null }).name).toBeNull()
  })

  it('reads staleness as a record, map, set or list of shot ids', () => {
    expect(staleIn({ a: ['location@2'], b: [], c: false, d: true }, 'a')).toBe(true)
    expect(staleIn({ a: ['location@2'], b: [] }, 'b')).toBe(false)
    expect(staleIn({ a: true }, 'toString')).toBe(false)
    expect(staleIn({ shots: { a: true } }, 'a')).toBe(true)
    expect(staleIn(new Map([['a', ['look']], ['b', []]]), 'a')).toBe(true)
    expect(staleIn(new Map([['b', []]]), 'b')).toBe(false)
    expect(staleIn(new Set(['a']), 'a')).toBe(true)
    expect(staleIn(['a', { shotId: 'b' }], 'b')).toBe(true)
    expect(staleIn(['a'], 'z')).toBe(false)
    expect(staleIn(null, 'a')).toBe(false)
  })

  it('a strip item is stale when any of its ids is', () => {
    const p = shellProject({ project: {}, staleness: { 'view-2': true }, loading: false, error: null })
    expect(p.isStale('still-9', 'view-2')).toBe(true)
    expect(p.isStale('still-9', 'view-3')).toBe(false)
  })
})
