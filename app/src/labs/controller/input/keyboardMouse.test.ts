// @vitest-environment jsdom
// F6 (QA run 5): the Camera view's mouse capture is released when the window loses focus, the tab is hidden or the page
// unloads (it used to clear only the held keys on blur), and when the operator lets go of the canvas. A fake pointer lock.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeyboardMouse } from './keyboardMouse'

let locked: Element | null = null
let hidden = false
Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked })
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
const exit = vi.fn(() => { locked = null })
Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: exit })

afterEach(() => { locked = null; hidden = false; exit.mockClear() })

function rig() {
  const canvas = document.createElement('canvas')
  const km = new KeyboardMouse()
  const detach = km.attach(canvas)
  locked = canvas // the operator took the mouse
  return { canvas, km, detach }
}

describe('the mouse capture is let go', () => {
  it('on window blur', () => {
    const { detach } = rig()
    window.dispatchEvent(new Event('blur'))
    expect(exit).toHaveBeenCalledTimes(1)
    detach()
  })
  it('when the tab is hidden, not when it shows again', () => {
    const { detach } = rig()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(exit).not.toHaveBeenCalled()
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(exit).toHaveBeenCalledTimes(1)
    detach()
  })
  it('on page hide and unload', () => {
    const { detach } = rig()
    window.dispatchEvent(new Event('pagehide'))
    expect(exit).toHaveBeenCalledTimes(1)
    detach()
  })
  it('when the operator detaches; another element\'s lock is never touched', () => {
    const { detach } = rig()
    locked = document.createElement('div')
    window.dispatchEvent(new Event('blur'))
    expect(exit).not.toHaveBeenCalled()
    detach()
    expect(exit).not.toHaveBeenCalled()
    const r = rig()
    r.detach()
    expect(exit).toHaveBeenCalledTimes(1)
  })
})

// Owner 2026-10-28: Esc lets go of a held camera (the pad's Create does the same), but only when nothing else owns the key: a
// field being typed in, a dialog or menu, a handler that claims it (preventDefault) or stops it, or the host's own claim.
describe('Escape is the release, when it is the camera\'s', () => {
  const attached = () => { const km = new KeyboardMouse(); const detach = km.attach(document.createElement('canvas')); return { km, detach } }
  const esc = (on: EventTarget = document.body, init: KeyboardEventInit = {}) =>
    on.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true, ...init }))
  const actions = (km: KeyboardMouse) => km.poll(1 / 60).frame.actions
  afterEach(() => { document.body.innerHTML = '' })

  it('Esc queues the release for the next frame; Home still rewinds; a held-down repeat is not another press', () => {
    const { km, detach } = attached()
    esc()
    expect(actions(km)).toEqual(['release'])
    expect(actions(km)).toEqual([]) // once
    esc(document.body, { repeat: true })
    expect(actions(km)).toEqual([])
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Home', key: 'Home', bubbles: true }))
    expect(actions(km)).toEqual(['rewind'])
    detach()
  })
  it('not while typing in a field, nor with a dialog or a menu open', () => {
    const { km, detach } = attached()
    const input = document.body.appendChild(document.createElement('input'))
    esc(input)
    expect(actions(km)).toEqual([])
    input.remove()
    for (const role of ['dialog', 'menu']) {
      const d = document.body.appendChild(document.createElement('div'))
      d.setAttribute('role', role)
      esc()
      expect(actions(km)).toEqual([])
      d.remove()
    }
    esc()
    expect(actions(km)).toEqual(['release'])
    detach()
  })
  it('not when a handler after it claims the key (the rail closing its draw screen), nor when one before it stops it (an ask)', () => {
    const { km, detach } = attached()
    const claim = (e: KeyboardEvent) => e.preventDefault()
    window.addEventListener('keydown', claim)
    esc()
    expect(actions(km)).toEqual([])
    window.removeEventListener('keydown', claim)
    const stop = (e: KeyboardEvent) => e.stopPropagation()
    window.addEventListener('keydown', stop, true)
    esc()
    expect(actions(km)).toEqual([])
    window.removeEventListener('keydown', stop, true)
    esc()
    expect(actions(km)).toEqual(['release'])
    detach()
  })
  it('not when the host says the key is its own as it is pressed (a draw on, an overlay up)', () => {
    const { km, detach } = attached()
    km.escapeGate = () => false
    esc()
    expect(actions(km)).toEqual([])
    km.escapeGate = () => true
    esc()
    expect(actions(km)).toEqual(['release'])
    detach()
    esc()
    expect(actions(km)).toEqual([]) // detached: nothing listens
  })
})

// W1-F1: the camera-start keys — 9 keeps the camera's pose as the scene's start, 0 returns to it, P plays the take, ; stops
// it, U clears the aim lock. They are the operator's except while typing or with a modal up, like every other action key.
describe('the camera-start keys', () => {
  const attached = () => { const km = new KeyboardMouse(); const detach = km.attach(document.createElement('canvas')); return { km, detach } }
  const down = (code: string, target: EventTarget = document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }))
  const actions = (km: KeyboardMouse) => km.poll(1 / 60).frame.actions
  afterEach(() => { document.body.innerHTML = '' })

  it('9 / 0 / P / ; / U queue the camera actions, once per press', () => {
    const { km, detach } = attached()
    for (const [code, action] of [['Digit9', 'setStart'], ['Digit0', 'backToStart'], ['KeyP', 'playTake'], ['Semicolon', 'stopTake'], ['KeyU', 'aimClear']] as const) {
      down(code)
      expect(actions(km)).toEqual([action])
      expect(actions(km)).toEqual([]) // one press, one action
    }
    detach()
  })

  it('F and the bracket keys are unbound: there is no rack focus', () => {
    const { km, detach } = attached()
    for (const code of ['KeyF', 'BracketLeft', 'BracketRight']) down(code)
    const frame = km.poll(1 / 60).frame
    expect(frame.actions).toEqual([])
    expect(frame).not.toHaveProperty('focus')
    detach()
  })

  it('not while typing in a field, nor with a modal up', () => {
    const { km, detach } = attached()
    const input = document.body.appendChild(document.createElement('input'))
    down('Digit9', input)
    expect(actions(km)).toEqual([])
    input.remove()
    const d = document.body.appendChild(document.createElement('div'))
    d.setAttribute('aria-modal', 'true')
    down('KeyP')
    expect(actions(km)).toEqual([])
    d.remove()
    detach()
  })

  it('a key held through a tab switch is let go: hiding the tab clears it without its keyup, so the camera is never left stuck flying', () => {
    const { km, detach } = attached()
    down('KeyW') // flying forward
    expect(km.poll(1 / 60).frame.move?.y).toBe(1)
    hidden = true
    document.dispatchEvent(new Event('visibilitychange')) // the tab hides; the keyup never reaches the page
    expect(km.poll(1 / 60).frame.move?.y).toBe(0) // let go, though the key is still down
    hidden = false
    document.dispatchEvent(new Event('visibilitychange')) // back: still held, but a held key never repeats by itself
    expect(km.poll(1 / 60).frame.move?.y).toBe(0)
    detach()
  })
})
