// @vitest-environment jsdom
// Wave 2: the 161-frame take cap on a kit world. A 3D performer who walks longer than a take can lock is said BEFORE recording
// (in Shoot's lock block), a recorded take that ran longer says what the lock keeps, and the lock itself keeps CLAY_MAX (193) frames
// (never refused, never raised). Also the kit clay's progress line.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperatorEngine } from '../../labs/controller/engine/engine'
import { fakeTake } from '../../labs/projection/clay/__fixtures__/take'
import { CLAY_MAX, lockRequest } from '../../labs/projection/clay/plan'
import { STAGE_RIGS } from '../../labs/projection/operator/link'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { clayLine } from './takeClay'
import { capNotice, overShotLine, takeCapLine, TAKE_CAP_S } from './takeLock'
import { TakeLockBlock } from './TakeLockBlock'

const longWalk = { id: 'mocap-1', fps: 24, frames: 24 * 10 } // 10 s
function fakeLab(kit: boolean, pack = longWalk) {
  const engine = new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })
  const lab = {
    op: { mode: 'operator', setMode: vi.fn(), note: null, engine }, stage: { view: { aspect: 16 / 9 }, kit: kit ? { worldId: 'loc-k' } : null }, s: { source: 'loc-k' },
    performance: { layer: { pack }, listed: true, packs: [], selected: pack.id },
  } as unknown as ProjectionLabState
  return lab
}
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response('{"takes":[]}'))) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('the 193-frame take cap', () => {
  it('is 8.0 s, and a walk past it is said in plain words (nothing for a walk that fits)', () => {
    expect(TAKE_CAP_S.toFixed(1)).toBe('8.0')
    expect(capNotice(240)).toBe('The performer walks for 10.0 s, and a take locks at most 8.0 s (193 frames): the prepared frames and the render keep the first 8.0 s from where you start recording. For the whole walk, shorten the path in Blocking.')
    expect(capNotice(193)).toBeNull()
    expect(capNotice(null)).toBeNull()
  })
  it('a take that ran longer locks exactly 193 frames, and says what it keeps', () => {
    const take = fakeTake(9)
    const q = lockRequest(take, longWalk, 'loc-k', 16 / 9)
    expect(q.frames).toBe(CLAY_MAX)
    expect(takeCapLine(take.smoothed, q.frames)).toBe('This take ran 9.0 s; the lock keeps its first 8.0 s (193 frames).')
    const short = fakeTake(3)
    expect(takeCapLine(short.smoothed, lockRequest(short, longWalk, 'loc-k', 16 / 9).frames)).toBeNull()
  })
  it('with a shot length saved the walk is said in shot terms on the Shot length row instead (wave A, S7): no second notice here', () => {
    const lab = fakeLab(true)
    ;(lab.performance as { layer: unknown }).layer = { pack: longWalk, plan: { path: [[0, 0], [0, -9]], shotSeconds: 8 } }
    const { container } = render(<TakeLockBlock lab={lab} />)
    expect(container.innerHTML).toBe('')
    expect(overShotLine(10, 8)).toBe('The action takes 10.0 s and the shot is 8 s: pick a longer shot or a shorter action. A take keeps the first 8 s.')
    expect(overShotLine(8.06, 8)).toBeNull() // the pad's own overshoot is not "longer"
  })
})

describe('kit clay progress', () => {
  it('reads as encoding, not shading', () => {
    expect(clayLine({ phase: 'encode', done: 40, total: 121 })).toBe('Encoding the frames… 40/121')
    expect(clayLine({ phase: 'shade', done: 40, total: 121 })).toBe('Shading the frames… 40/121')
  })
})

describe('the walk-length notice goes once a take exists (QA 2026-10-25: it lingered after a 2 s preset take)', () => {
  it('a short take of a long walk is a part of it on purpose: no warning', () => {
    const lab = fakeLab(true)
    lab.op.engine.deck.take = fakeTake(2)
    render(<TakeLockBlock lab={lab} />)
    expect(screen.queryByTestId('take-cap-notice')).toBeNull()
    expect(screen.queryByTestId('take-cap-line')).toBeNull()
  })
})
