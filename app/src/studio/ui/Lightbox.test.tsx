// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Lightbox } from '.'

afterEach(cleanup)
const items = [{ src: '/a.png', label: 'A' }, { src: '/b.png', label: 'B' }, { src: '/c.png', label: 'C' }]
const key = (k: string) => act(() => { fireEvent.keyDown(window, { key: k }) })

function Host({ onClose = () => {}, compare }: { onClose?: () => void; compare?: { src: string; label: string } }) {
  const [i, setI] = useState<number | null>(1)
  return <Lightbox items={items} index={i} onIndex={setI} onClose={() => { onClose(); setI(null) }} compare={compare} />
}
const shown = () => screen.getByTestId('lightbox-img').getAttribute('src')

describe('Lightbox', () => {
  it('shows nothing when closed and the item at the index when open', () => {
    const { rerender } = render(<Lightbox items={items} index={null} onIndex={() => {}} onClose={() => {}} />)
    expect(screen.queryByTestId('lightbox')).toBeNull()
    rerender(<Lightbox items={items} index={2} onIndex={() => {}} onClose={() => {}} />)
    expect(shown()).toBe('/c.png')
    expect(screen.getByTestId('lightbox-label').textContent).toContain('3 of 3')
  })

  it('arrow keys and buttons walk the items (wrapping); Escape closes', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    key('ArrowRight'); expect(shown()).toBe('/c.png')
    key('ArrowRight'); expect(shown()).toBe('/a.png')
    key('ArrowLeft'); expect(shown()).toBe('/c.png')
    act(() => { fireEvent.click(screen.getByTestId('lightbox-prev')) }); expect(shown()).toBe('/b.png')
    act(() => { fireEvent.click(screen.getByTestId('lightbox-next')) }); expect(shown()).toBe('/c.png')
    key('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('lightbox')).toBeNull()
  })

  it('a click outside the image closes it; a click on the image does not', () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)
    act(() => { fireEvent.click(screen.getByTestId('lightbox-img')) })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { fireEvent.click(screen.getByTestId('lightbox')) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Compare flips to the reference and back, and moving on resets it', () => {
    render(<Host compare={{ src: '/clay.png', label: 'the clay view' }} />)
    expect(screen.getByTestId('lightbox-compare').textContent).toBe('Compare with the clay view')
    act(() => { fireEvent.click(screen.getByTestId('lightbox-compare')) })
    expect(shown()).toBe('/clay.png')
    key('c'); expect(shown()).toBe('/b.png')
    key('c'); expect(shown()).toBe('/clay.png')
    key('ArrowRight'); expect(shown()).toBe('/c.png')
  })

  it('(recipe wave) an aside panel shows under the image, and a click in it never closes the lightbox', () => {
    const onClose = vi.fn()
    render(<Lightbox items={items} index={0} onIndex={() => {}} onClose={onClose} aside={<button type="button" data-testid="in-aside">x</button>} />)
    act(() => { fireEvent.click(screen.getByTestId('in-aside')) })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('lightbox').className).toMatch(/st-lightbox-judge/)
  })

  it('owns the keyboard while open: keys never reach other window listeners', () => {
    const other = vi.fn()
    window.addEventListener('keydown', other)
    render(<Host />)
    key('ArrowRight'); key('ArrowLeft'); key('x')
    expect(other).not.toHaveBeenCalled()
    key('Escape')
    key('ArrowRight')
    expect(other).toHaveBeenCalledTimes(1) // closed: the studio hears the keys again
    window.removeEventListener('keydown', other)
  })
})
