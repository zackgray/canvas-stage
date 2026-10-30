// Keyboard + mouse fallback. WASD move, Q/E down/up, arrows aim, mouse-look under pointer lock,
// wheel zooms. Bindings mirror the controller mapping (see ui/MappingOverlay).
import { isFormControl } from './formControl'
import type { Action, InputFrame, RigId } from './types'
import { RIG_IDS } from './types'

const ACTION_KEYS: Record<string, Action> = {
  KeyR: 'record',
  KeyT: 'still',
  KeyO: 'smoothing',
  Space: 'playPause',
  KeyC: 'recenter',
  KeyV: 'followMode',
  Home: 'rewind',
  // the camera's start, the take replay and the aim lock: the host's (the Stage's; no-op in the lab)
  Digit9: 'setStart',
  Digit0: 'backToStart',
  KeyP: 'playTake',
  Semicolon: 'stopTake',
  KeyU: 'aimClear',
}

/** a dialog, a modal or a menu is open: Escape is its (it closes it), not the operator's */
const overlayOpen = () => typeof document !== 'undefined' && typeof document.querySelector === 'function'
  && !!document.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"], [role="menu"]')

export class KeyboardMouse {
  private held = new Set<string>()
  private queued: Action[] = []
  private mouseX = 0
  private mouseY = 0
  private wheel = 0
  private target: HTMLElement | null = null
  /** True when the keyboard or mouse did something since the last poll. */
  private touched = false
  /** which clicks and wheel turns on the canvas are the operator's (the Stage's panes: only the Camera pane's); null = all */
  gate: ((e: MouseEvent) => boolean) | null = null
  /** whether an Escape is the operator's when it is pressed (the host's own Escape owners that do not say so: a draw, an overlay); null = yes */
  escapeGate: (() => boolean) | null = null
  /**
   * The Escape being pressed, decided at the next poll, after every other handler has had it: it releases the camera only when
   * nothing owned it as it began (no field, dialog, menu or host claim), it reached the operator (nobody stopped it) and nobody
   * prevented it (the rail's draw screen, viewer and close all do).
   */
  private escape: { ev: KeyboardEvent; free: boolean; reached: boolean } | null = null

  attach(target: HTMLElement): () => void {
    this.target = target
    const down = (e: KeyboardEvent) => this.onKey(e, true)
    const claim = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.repeat) return
      this.escape = { ev: e, free: !isFormControl(e.target) && !overlayOpen() && (this.escapeGate?.() ?? true), reached: false }
    }
    window.addEventListener('keydown', claim, true) // first, before the handlers it lets have the key
    const up = (e: KeyboardEvent) => this.onKey(e, false)
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== target) return
      this.mouseX += e.movementX
      this.mouseY += e.movementY
      this.touched = true
    }
    const wheel = (e: WheelEvent) => {
      if (this.gate && !this.gate(e)) return // another pane's: it has its own wheel
      e.preventDefault()
      this.wheel += e.deltaY
      this.touched = true
    }
    const click = (e: MouseEvent) => {
      if (this.gate && !this.gate(e)) return // another pane's click is not a request to take the mouse
      if (document.pointerLockElement !== target) void target.requestPointerLock?.()?.catch?.(() => {})
    }
    // (QA run 5, F6) leaving the window, hiding the tab or unloading the page lets go of the mouse too, never only the keys
    const letGo = () => { if (document.pointerLockElement === target) document.exitPointerLock?.() }
    const blur = () => { this.held.clear(); letGo() }
    const hidden = () => { if (document.hidden) blur() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('mousemove', move)
    window.addEventListener('blur', blur)
    window.addEventListener('pagehide', blur)
    window.addEventListener('beforeunload', blur)
    document.addEventListener?.('visibilitychange', hidden) // a stand-in document (tests) may have no events
    target.addEventListener('wheel', wheel, { passive: false })
    target.addEventListener('click', click)
    return () => {
      window.removeEventListener('keydown', claim, true)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pagehide', blur)
      window.removeEventListener('beforeunload', blur)
      document.removeEventListener?.('visibilitychange', hidden)
      letGo()
      target.removeEventListener('wheel', wheel)
      target.removeEventListener('click', click)
      this.target = null
      // nothing held or queued outlives the listeners (a key down at detach would never see its keyup)
      this.held.clear()
      this.queued = []
      this.escape = null
    }
  }

  private onKey(e: KeyboardEvent, isDown: boolean) {
    if (isDown && this.escape?.ev === e) this.escape.reached = true
    if (isFormControl(e.target)) return
    // a modal (the full-size lightbox) owns the keyboard: its arrows are not the camera's look, its R is not Record
    if (isDown && typeof document !== 'undefined' && typeof document.querySelector === 'function' && document.querySelector('[aria-modal="true"]')) return
    if (isDown) {
      // Tab is the page's (the only keyboard way out of the viewport); the rig is 1-5 or the panel
      if (e.code === 'Space') e.preventDefault()
      if (!e.repeat) {
        const action = ACTION_KEYS[e.code]
        if (action) this.queued.push(action)
        const digit = /^Digit([1-5])$/.exec(e.code)
        if (digit) this.queued.push(`rig:${RIG_IDS[Number(digit[1]) - 1] as RigId}`)
      }
      this.held.add(e.code)
    } else {
      this.held.delete(e.code)
    }
    this.touched = true
  }

  private axis(neg: string, pos: string): number {
    return (this.held.has(pos) ? 1 : 0) - (this.held.has(neg) ? 1 : 0)
  }

  /** Read this frame's contribution and clear per-frame accumulators. */
  poll(dt: number): { frame: InputFrame; active: boolean } {
    const esc = this.escape
    this.escape = null
    if (esc?.free && esc.reached && !esc.ev.defaultPrevented) this.queued.push('release')
    const frame: InputFrame = {
      move: { x: this.axis('KeyA', 'KeyD'), y: this.axis('KeyS', 'KeyW') },
      lift: this.axis('KeyQ', 'KeyE'),
      look: { x: this.axis('ArrowLeft', 'ArrowRight'), y: this.axis('ArrowDown', 'ArrowUp') },
      mouse: { x: this.mouseX, y: this.mouseY },
      wheel: this.wheel,
      zoomOut: this.held.has('KeyZ') ? 1 : 0,
      zoomIn: this.held.has('KeyX') ? 1 : 0,
      fine: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
      scrub: this.axis('Comma', 'Period') * 2 * dt,
      actions: this.queued,
    }
    const active = this.touched || this.held.size > 0
    this.mouseX = this.mouseY = this.wheel = 0
    this.queued = []
    this.touched = false
    return { frame, active }
  }

  get pointerLocked(): boolean {
    return this.target !== null && document.pointerLockElement === this.target
  }
}
