// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { recordExport, sceneExports } from '../sceneExports'

const A = 'sc-20261024101500-aaaa'
const B = 'sc-20261024101500-bbbb'
beforeEach(() => localStorage.clear())

describe('a scene\'s exports', () => {
  it('a download is the scene\'s own: newest first, never another scene\'s, the same file listed once', () => {
    expect(sceneExports(A)).toEqual([])
    recordExport(A, { takeId: 't1', url: '/a.mp4', finished: true }, new Date('2026-10-24T10:00:00Z'))
    recordExport(A, { takeId: 't2', url: '/b.mp4', finished: false }, new Date('2026-10-24T11:00:00Z'))
    recordExport(A, { takeId: 't1', url: '/a.mp4', finished: true }, new Date('2026-10-24T12:00:00Z'))
    expect(sceneExports(A).map((e) => e.url)).toEqual(['/a.mp4', '/b.mp4'])
    expect(sceneExports(B)).toEqual([])
    expect(sceneExports(A)).toBe(sceneExports(A)) // stable between changes (useSyncExternalStore)
  })

  it('a download with no scene open is not recorded', () => {
    recordExport(null, { takeId: 't1', url: '/a.mp4', finished: true })
    expect(localStorage.length).toBe(0)
  })
})
