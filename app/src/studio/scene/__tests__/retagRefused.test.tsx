// @vitest-environment jsdom
// A refused tag rename says why and changes nothing (ported from sceneGuards m3, which drove the Board's piece dialog): the design's
// retag refuses an empty tag, a non-tag and another tile's tag with a plain sentence, and leaves the pieces and the words as they were;
// a good rename moves the tile and the @chip in the words together.
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDesign } from '../design/useDesign'
import { on } from './drive'

afterEach(() => { cleanup(); localStorage.clear() })

describe('a refused tag rename', () => {
  it('says why, keeps the old tag, and never rewrites the words; a good one moves the tile and the @tag together', () => {
    const { result } = renderHook(() => useDesign([], undefined, 'sc-retag'))
    const robin = on('robin', 'person', 'a hooded archer'), guy = on('sirguy', 'person', 'a sheriff')
    act(() => result.current.set({ pieces: [robin, guy], brief: 'The @robin runs. @sirguy gives chase.' }))
    const words = result.current.ref.current.brief
    let why: string | null = null
    act(() => { why = result.current.retag(robin.id, '!!') })
    expect(why).toMatch(/needs a name/)
    act(() => { why = result.current.retag(robin.id, 'sirguy') })
    expect(why).toMatch(/@sirguy is already/)
    expect(result.current.ref.current.brief).toBe(words)
    expect(result.current.ref.current.pieces.map((p) => p.tag)).toEqual(['robin', 'sirguy'])
    act(() => { why = result.current.retag(robin.id, 'Outlaw') })
    expect(why).toBeNull()
    expect(result.current.ref.current.pieces.map((p) => p.tag)).toEqual(['outlaw', 'sirguy'])
    expect(result.current.ref.current.brief).toBe('The @outlaw runs. @sirguy gives chase.')
  })
})
