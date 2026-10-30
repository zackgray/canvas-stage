// @vitest-environment jsdom
// The face pass row in Render: per staged person, their face strip, "Fix this face" with its price (disabled with the reason when
// it cannot run), the free strip press, the paid press's one POST, and the candidate as a Keep / Discard card.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PassCandidate } from '../../shared/passContract'
import type { L2RRender } from '../../shared/shotContract'
import { FacePassRow } from './FacePassRow'
import type { FacePassStatus } from './FacePassTypes'

const TAKE = 'take-2026-10-22T19-00-00-000'
const done: L2RRender = { id: 'l2r-1', takeId: TAKE, stillId: 's', clay: '/c.mp4', raw: '/raw.mp4', finished: '/fin.mp4', jobId: 'j', credits: 12, status: 'done', createdAt: 't', frames: 49 }
const person = (o: Partial<FacePassStatus['people'][number]> = {}) => ({ subject: 'hero', name: 'Mara', headPx: 48, small: true, why: null, track: null, ...o })
const cand: PassCandidate = { id: 'pass-1', takeId: TAKE, pass: 'facePass', target: { kind: 'render', renderId: 'l2r-1' }, subject: 'hero', box: { x: 1, y: 2, w: 200, h: 200 }, state: 'candidate',
  beforeUrl: '/fin.mp4', afterUrl: '/after.mp4', beforeCropUrl: '/b.png', afterCropUrl: '/a.png', jobId: 'job-1', costCredits: 9, createdAt: '2026-10-24T00:00:00Z' }

let status: FacePassStatus
let candidates: PassCandidate[]
let posts: { url: string; body: Record<string, unknown> }[]
const ok = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  posts = []; candidates = []
  status = { renderId: 'l2r-1', price: 12, running: null, configured: true, people: [person(), person({ subject: 'extra:1:1', name: '@tom', why: 'Their cast card has no face image.' })] }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); posts.push({ url, body })
      if (url === '/__lab/l2r/face/track') return ok({ person: person({ track: { ok: true, strip: '/strip.png', frames: [0, 24, 40, 48] } }) })
      if (url === '/__lab/l2r/face') { candidates = [{ ...cand, state: 'running', afterUrl: null, afterCropUrl: null }]; return ok({ candidate: candidates[0] }) }
      return ok({ candidate: { ...cand, state: 'kept' } })
    }
    if (url.startsWith('/__lab/l2r/face?render=')) return ok(status)
    if (url.startsWith('/__lab/passes?take=')) return ok({ candidates })
    return ok({ error: 'no' }, 404)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('FacePassRow', () => {
  it('nothing until the render is finished', () => {
    const { container } = render(<FacePassRow render={{ ...done, finished: null }} takeId={TAKE} />)
    expect(container.innerHTML).toBe('')
  })
  it('each person with the price on the button; one that cannot be fixed says why, disabled', async () => {
    render(<FacePassRow render={done} takeId={TAKE} />)
    const fix = await screen.findByTestId('face-fix-hero')
    expect(fix.hasAttribute('disabled')).toBe(false)
    expect(fix.parentElement!.textContent).toMatch(/12 cr/)
    const tom = screen.getByTestId('face-fix-extra:1:1')
    expect(tom.hasAttribute('disabled')).toBe(true)
    expect(tom.getAttribute('title')).toBe('Their cast card has no face image.')
  })
  it('the strip is a free press; Fix posts once and the candidate shows as Keep / Discard', async () => {
    render(<FacePassRow render={done} takeId={TAKE} />)
    fireEvent.click(await screen.findByTestId('face-track-hero'))
    expect((await screen.findByTestId('face-strip-hero')).getAttribute('src')).toBe('/strip.png')
    fireEvent.click(screen.getByTestId('face-fix-hero'))
    await screen.findByTestId('pass-running')
    expect(posts.map((p) => [p.url, p.body])).toEqual([['/__lab/l2r/face/track', { renderId: 'l2r-1', subject: 'hero' }], ['/__lab/l2r/face', { renderId: 'l2r-1', subject: 'hero' }]])
    await waitFor(() => expect(screen.getByTestId('face-fix-hero').hasAttribute('disabled')).toBe(true)) // one at a time per face
  })
  it('a finished candidate is before beside after; another render\'s candidate is not shown', async () => {
    candidates = [cand, { ...cand, id: 'pass-2', target: { kind: 'render', renderId: 'l2r-other' } }]
    render(<FacePassRow render={done} takeId={TAKE} />)
    expect(await screen.findAllByTestId('pass-candidate')).toHaveLength(1)
    expect(screen.getByTestId('pass-after').getAttribute('src')).toBe('/a.png')
  })
})
