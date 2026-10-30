// Wave A (S4): a mark with no saved facing faces the nearest brief prop; a saved facing, even 0, is never overridden.
import { describe, expect, it } from 'vitest'
import { markOf } from '../mark.ts'

const flat: [number, number, number, number] = [-3, -16, 3, 8]
const tree = (at: [number, number], extra: object = { pieceTag: 'prop:tree' }) => ({ kind: 'tree', at, ...extra })

describe('markOf facing', () => {
  it('faces the nearest tagged prop (0 = +z, +x is 90)', () => {
    expect(markOf({ flat, mark: { at: [0, 0] }, kit: [tree([5, 0]), tree([0, -20])] }).yawDeg).toBe(90)
    expect(markOf({ flat, mark: { at: [0, 0] }, kit: [tree([0, -3]), tree([9, 0])] }).yawDeg).toBe(180)
  })
  it('prefers tagged props, else labelled ones, else +z as before', () => {
    expect(markOf({ flat, mark: { at: [0, 0] }, kit: [tree([1, 1], { label: 'near' }), tree([0, 6])] }).yawDeg).toBe(0)
    expect(markOf({ flat, mark: { at: [0, 0] }, kit: [tree([4, 0], { label: 'a tree' })] }).yawDeg).toBe(90)
    expect(markOf({ flat, mark: { at: [0, 0] }, kit: [{ kind: 'rock', at: [4, 0] }] }).yawDeg).toBe(0)
    expect(markOf({ flat, kit: [] }).yawDeg).toBe(0)
  })
  it('works with no saved mark (the corridor start) and never overrides a saved facing', () => {
    expect(markOf({ flat, kit: [tree([5.6, -12.5])] })).toEqual({ at: [0.6, -12.5], yawDeg: 90 })
    expect(markOf({ flat, mark: { at: [0, 0], yawDeg: 0 }, kit: [tree([5, 0])] }).yawDeg).toBe(0)
  })
})
