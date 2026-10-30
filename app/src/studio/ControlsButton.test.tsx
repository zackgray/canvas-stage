// @vitest-environment jsdom
// The Stage's controls screen: the Controls button shows the mapping table over the Stage and never stays
// open — the button again, Escape or the ✕ closes it, and its Escape must not leak to the rail or the
// draw screen behind it.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlsButton } from './ControlsButton'

afterEach(() => cleanup())

describe('ControlsButton (the Stage controls screen)', () => {
  it('starts closed, opens on the button with the mapping table, closes on the button again', () => {
    render(<ControlsButton />)
    expect(screen.queryByTestId('stage-controls-overlay')).toBeNull()
    fireEvent.click(screen.getByTestId('stage-controls'))
    const overlay = screen.getByTestId('stage-controls-overlay')
    expect(overlay.getAttribute('aria-modal')).toBe('true')
    expect(overlay.textContent).toContain('DualSense')
    expect(overlay.textContent).toContain('G / R / S') // the piece tool is documented too
    fireEvent.click(screen.getByTestId('stage-controls'))
    expect(screen.queryByTestId('stage-controls-overlay')).toBeNull()
  })

  it('Escape closes it and never reaches the handlers behind it', () => {
    render(<ControlsButton />)
    fireEvent.click(screen.getByTestId('stage-controls'))
    const behind = vi.fn() // a bubble-phase key map standing in for the rail / the stage tools
    window.addEventListener('keydown', behind)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    window.removeEventListener('keydown', behind)
    expect(screen.queryByTestId('stage-controls-overlay')).toBeNull()
    expect(behind).not.toHaveBeenCalled()
  })

  it('the ✕ closes it too, and it never lingers across a remount', () => {
    const { unmount } = render(<ControlsButton />)
    fireEvent.click(screen.getByTestId('stage-controls'))
    fireEvent.click(screen.getByTestId('stage-controls-close'))
    expect(screen.queryByTestId('stage-controls-overlay')).toBeNull()
    unmount()
    render(<ControlsButton />)
    expect(screen.queryByTestId('stage-controls-overlay')).toBeNull()
  })
})
