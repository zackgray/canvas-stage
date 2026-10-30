// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Lightbox } from './ui'
import { useStudioKeys } from './useStudioKeys'

afterEach(() => { cleanup(); window.location.hash = '' })
const Keys = () => { useStudioKeys('stage', false); return null }
const arrow = (k: string) => act(() => { fireEvent.keyDown(window, { key: k, code: k }) })

describe('studio stage hotkeys', () => {
  it('→ moves to the next stage, but not while a lightbox is open', () => {
    const { rerender } = render(<><Keys /><Lightbox items={[{ src: '/a.png' }, { src: '/b.png' }]} index={0} onIndex={() => {}} onClose={() => {}} /></>)
    arrow('ArrowRight')
    expect(window.location.hash).toBe('')
    rerender(<><Keys /><Lightbox items={[{ src: '/a.png' }]} index={null} onIndex={() => {}} onClose={() => {}} /></>)
    arrow('ArrowRight')
    expect(window.location.hash).toContain('render')
  })
})
