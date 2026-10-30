import type { Vector2 } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onPlainClick } from './plainClick'

afterEach(() => vi.unstubAllGlobals())

/** A 200×100 canvas at (10, 20) on the page. */
function fakeCanvas() {
  const handlers = new Map<string, (e: { clientX: number; clientY: number }) => void>()
  const dom = {
    addEventListener: (t: string, fn: never) => handlers.set(t, fn),
    removeEventListener: (t: string) => handlers.delete(t),
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
  } as unknown as HTMLElement
  const fire = (t: string, x: number, y: number) => handlers.get(t)?.({ clientX: x, clientY: y })
  return { dom, handlers, click: (x: number, y: number, toX = x, toY = y) => { fire('pointerdown', x, y); fire('click', toX, toY) } }
}

describe('plain click', () => {
  it('a still click reports its normalised device coords; a drag (orbit) does not', () => {
    vi.stubGlobal('document', { pointerLockElement: null })
    const c = fakeCanvas()
    const hits: Vector2[] = []
    onPlainClick(c.dom, () => true, (ndc) => hits.push(ndc))
    c.click(110, 70) // canvas centre
    c.click(10, 20) // top-left corner
    c.click(60, 50, 90, 50) // dragged 30 px
    expect(hits.map((h) => [h.x, h.y])).toEqual([[0, 0], [-1, 1]])
  })

  it('does nothing while disabled or the pointer is locked (operator mouse-look); detaches', () => {
    const c = fakeCanvas()
    vi.stubGlobal('document', { pointerLockElement: c.dom })
    let on = true
    let n = 0
    const detach = onPlainClick(c.dom, () => on, () => n++)
    c.click(50, 50)
    vi.stubGlobal('document', { pointerLockElement: null })
    on = false
    c.click(50, 50)
    expect(n).toBe(0)
    detach()
    expect(c.handlers.size).toBe(0)
  })
})
