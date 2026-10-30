// @vitest-environment jsdom
// The root focus rule (App.tsx, keyboard-focus-stuck): a mouse click on any plain button hands the keyboard
// back to the viewport. Otherwise the clicked button keeps the focus, the camera drivers drop every shortcut
// key (labs/controller/input/formControl.ts counts a button as a form control) and Space / Enter re-press
// the last button a shortcut key was meant for.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBlurButtonsOnClick } from './App'
import { isFormControl } from './labs/controller/input/formControl'
import { typingTarget } from './studio/useStudioKeys'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

const Host = () => {
  useBlurButtonsOnClick()
  return (
    <>
      <button type="button" data-testid="hold">Hold on subject</button>
      <button type="button" data-testid="plain">A plain button</button>
    </>
  )
}

describe('blur buttons on click (the one focus rule)', () => {
  it('a mouse click leaves no button focused, so the shortcut keys are not swallowed', () => {
    render(<Host />)
    const b = screen.getByTestId('hold')
    b.focus() // the browser focuses a button on mouse-down, before the click
    expect(document.activeElement).toBe(b)
    fireEvent.click(b, { detail: 1 }) // detail 1: the mouse
    expect(document.activeElement).not.toBe(b)
    expect(isFormControl(document.activeElement)).toBe(false)
    expect(typingTarget(document.activeElement)).toBe(false)
  })

  it('a shortcut key pressed after the click reaches the handlers (its target is not a form control)', () => {
    render(<Host />)
    const b = screen.getByTestId('plain')
    b.focus()
    fireEvent.click(b, { detail: 1 })
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    // the key lands on whatever is focused after the click (the page, like a real press would)
    fireEvent.keyDown(document.activeElement!, { code: 'KeyO', key: 'o' })
    window.removeEventListener('keydown', seen)
    const target = seen.mock.calls[0][0].target
    expect(isFormControl(target)).toBe(false)
    expect(typingTarget(target)).toBe(false)
  })

  it('a keyboard-activated click (Enter on a Tab-focused button) keeps the focus', () => {
    render(<Host />)
    const b = screen.getByTestId('plain')
    b.focus()
    fireEvent.click(b, { detail: 0 }) // detail 0: the keyboard activated it
    expect(document.activeElement).toBe(b)
  })

  it('typing controls are untouched: a click on a select leaves it focused to swallow keys', () => {
    render(<Host />)
    const sel = document.createElement('select')
    document.body.appendChild(sel)
    sel.focus()
    fireEvent.click(sel, { detail: 1 })
    expect(document.activeElement).toBe(sel)
  })
})
