// The chip strip is built from the binds the render submits: no approved opening still means no opening chip (not one with url '').
import { describe, expect, it } from 'vitest'
import { sentChips } from '../chips.ts'

describe('sentChips', () => {
  it('opening "" (no still approved): one chip, the layout, and nothing with an empty url', () => {
    const chips = sentChips({ clay: '/c/clay.mp4', opening: '' })
    expect(chips.map((c) => c.role)).toEqual(['layout'])
    expect(chips.every((c) => c.url !== '')).toBe(true)
  })

  it('an approved opening still adds its chip, in order, with mid and end after it', () => {
    const chips = sentChips({ clay: '/c/clay.mp4', opening: '/s/o.png', mid: '/s/m.png', end: '/s/e.png' }, { mid: 60, end: 120 })
    expect(chips.map((c) => [c.role, c.url])).toEqual([['layout', '/c/clay.mp4'], ['opening', '/s/o.png'], ['mid', '/s/m.png'], ['end', '/s/e.png']])
    expect(chips[2].label).toBe('Mid keyframe · frame 60')
  })
})
