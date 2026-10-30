// @vitest-environment jsdom
// Track E UI tests, the small pieces (docs/plan-kimodo-live.md section 8): the one-line health status on Blocking's header,
// the Describe a move action button, and the invariant that none of the forbidden words (Kimodo, constraint, seed, candidate,
// BVH, Bible) appear in anything the panel family renders.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KitItem } from '../../../../stage3d/contract'
import { DescribeMoveButton } from '../DescribeMoveButton'
import { DescribeMovePanel } from '../DescribeMovePanel'
import { MotionHealthLine } from '../MotionHealthLine'

const NEAR: KitItem = { kind: 'crates', args: [1, 1], at: [0.3, 0.35], label: 'Hive', pieceTag: 'prop:hive' }
const FORBIDDEN = /\b(kimodo|constraints?|seeds?|candidates?|bvh|bibles?)\b/i

function stubFetch(health: Record<string, unknown>, job: Record<string, unknown> | '404' = '404') {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/__lab/motion/health')) return json(health)
    if (url.includes('/__lab/motion/job')) return job === '404' ? json({}, 404) : json(job)
    if (url.includes('/__lab/motion/keep')) return json({ id: 'gen:abc', clip: { note: 'made move', out: 8 } })
    return json({})
  }))
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('MotionHealthLine', () => {
  it('reads ready / off / offline from the health route', async () => {
    stubFetch({ state: 'ready' })
    const { unmount } = render(<MotionHealthLine />)
    await waitFor(() => expect(screen.getByTestId('motion-health-line').textContent).toBe('New moves: ready'))
    unmount()
    stubFetch({ state: 'off' })
    render(<MotionHealthLine />)
    await waitFor(() => expect(screen.getByTestId('motion-health-line').textContent).toBe('New moves: off'))
  })
})

describe('DescribeMoveButton', () => {
  it('opens the panel', () => {
    const onClick = vi.fn()
    render(<DescribeMoveButton onClick={onClick} />)
    fireEvent.click(screen.getByTestId('describe-move-open'))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByTestId('describe-move-open').textContent).toContain('Describe a move')
  })
})

describe('forbidden words', () => {
  it('never appear in the rendered panel family text', async () => {
    const ctx = {
      id: 'job-1', stage: 'done', done: 8, of: 8, round: 1,
      tries: [{ id: 1, seed: 53, rank: 1, reason: 'steadiest hands', scores: {}, seconds: 3.8 }],
      dropped: { count: 5, reason: 'the hands did not hold the frame steadily' },
    }
    // the form half: words, sentence, note, chips
    stubFetch({ state: 'ready' })
    const form = render(
      <>
        <MotionHealthLine />
        <DescribeMovePanel at={[0, 0]} kit={[NEAR]} who="she" pollMs={50} />
      </>,
    )
    fireEvent.change(screen.getByTestId('move-words'), { target: { value: 'the tired old man slowly takes a frame out of the hive' } })
    fireEvent.click(screen.getByTestId('move-piece-0'))
    await waitFor(() => expect(screen.getByTestId('move-note')).toBeTruthy())
    expect(form.container.textContent).not.toMatch(FORBIDDEN)
    form.unmount()
    cleanup()
    // the results half: cards with reasons, the dropped line
    stubFetch({ state: 'ready' }, ctx)
    const results = render(<DescribeMovePanel at={[0, 0]} kit={[NEAR]} who="she" pollMs={50} />)
    await waitFor(() => expect(screen.getByTestId('move-results')).toBeTruthy())
    expect(results.container.textContent).not.toMatch(FORBIDDEN)
  })
})
