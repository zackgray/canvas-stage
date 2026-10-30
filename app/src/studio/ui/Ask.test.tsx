// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Ask } from './Ask'

describe('Ask', () => {
  it('Escape backs out and the safe answer has focus', () => {
    const onYes = vi.fn()
    const onNo = vi.fn()
    render(<Ask label="New scene" yes="Clear" no="Keep it" onYes={onYes} onNo={onNo}>Clear this?</Ask>)
    expect(document.activeElement).toBe(screen.getByTestId('ask-no'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onNo).toHaveBeenCalledTimes(1)
    expect(onYes).not.toHaveBeenCalled()
  })

  it('goes ahead only on the yes button', () => {
    const onYes = vi.fn()
    render(<Ask label="x" yes="Go" no="Stop" onYes={onYes} onNo={() => {}} testId="go">Sure?</Ask>)
    fireEvent.click(screen.getByTestId('go-yes'))
    expect(onYes).toHaveBeenCalledTimes(1)
  })
})
