// @vitest-environment jsdom
// QA m5 / m12: a path stops at the server's 64 points with a line (not a refused Save), a refusal says why in plain words,
// and New path asks before it clears a drawn path (Escape and "Keep it" both leave it).
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BATTLEFIELD } from '../../../../../stage3d/presets'
import type { KitWorld } from '../../../../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../../../../labs/projection/useProjectionLab'
import { BlockingPanel } from '../index'
import { saveReason } from '../saveReason'
import { KitRequestError } from '../../../../../labs/projection/stage3d/kitApi'

const ID = 'loc-2026-10-23T03-00-01-000'
const long: [number, number][] = Array.from({ length: 64 }, (_, i) => [i * 0.5, 0])
const world: KitWorld = { id: ID, description: 'd', plan: BATTLEFIELD, perf: { path: long, pace: 0.8, castId: 'brann' }, still: null, createdAt: '' }
const lab = { kit: { id: ID, world, layer: null, perf: world.perf, error: null } } as unknown as ProjectionLabState

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('path limit and New path', () => {
  it('a 65th click on the map adds nothing and says the path is full', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 501 })))
    render(<BlockingPanel lab={lab} />)
    fireEvent.click(screen.getByTestId('blocking-path-draw'))
    const svg = screen.getByTestId('blocking-top-view')
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 1000 } as DOMRect)
    fireEvent.click(svg, { clientX: 500, clientY: 500 })
    expect(screen.getByTestId('blocking-path-line').textContent).toContain('64 points')
    expect(screen.getByTestId('blocking-note').textContent).toContain('at most 64 points')
    await waitFor(() => expect(screen.getByTestId('blocking-cast')).toBeTruthy())
  })

  it("a refused Save shows the server's reason, not 'not valid'", () => {
    const e = new KitRequestError('the performance is not valid', ['path must hold 2 to 64 ground points [x, z]', 'extras[1].path[3] is more than 200 m from the centre'])
    const line = saveReason(e)
    expect(line).toContain('needs 2 to 64 points')
    expect(line).toContain("Extra 2: path point 4 is more than 200 m")
    expect(line).not.toContain('[x, z]')
  })

  it('New path asks first; Escape and Keep it leave the path, Clear it empties it', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 501 })))
    render(<BlockingPanel lab={lab} />)
    fireEvent.click(screen.getByTestId('blocking-path-new'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('blocking-path-ask')).toBeNull()
    expect(screen.getByTestId('blocking-path-line').textContent).toContain('64 points')
    fireEvent.click(screen.getByTestId('blocking-path-new'))
    fireEvent.click(screen.getByTestId('blocking-path-ask-no'))
    expect(screen.getByTestId('blocking-path-line').textContent).toContain('64 points')
    fireEvent.click(screen.getByTestId('blocking-path-new'))
    fireEvent.click(screen.getByTestId('blocking-path-ask-yes'))
    expect(screen.getByTestId('blocking-path-line').textContent).toContain('1 point ·') // Clear starts the new path on the subject's mark
  })
})
