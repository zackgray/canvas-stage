// @vitest-environment jsdom
// The takes list is one request at a time for the page (fix 2026-10-30): a burst of readers (mount, a take switch) shares it, and
// every caller still gets a list read after its own call began.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TakeRecord } from '../../shared/shotContract'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { coalesced } from './takesRequest'
import { resetLockedTakes, useAllTakes, useLockedTakes } from './worldTakes'

const defer = <T,>() => { let res!: (v: T) => void; const p = new Promise<T>((r) => { res = r }); return { p, res } }
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve() })

describe('coalesced', () => {
  it('ten calls while one request is out cost two requests, and the late ones get the follow-up read', async () => {
    const outs: ReturnType<typeof defer<number>>[] = []
    const load = vi.fn(() => { const d = defer<number>(); outs.push(d); return d.p })
    const get = coalesced(load)
    const first = get()
    const rest = Array.from({ length: 9 }, () => get())
    expect(load).toHaveBeenCalledTimes(1)
    outs[0].res(1)
    expect(await first).toBe(1)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(2) // the follow-up starts only after the first ends: it reads what was written meanwhile
    outs[1].res(2)
    expect(await Promise.all(rest)).toEqual(Array(9).fill(2))
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('a call with nothing out sends at once; a failed request does not stop the next', async () => {
    let n = 0
    const get = coalesced(async () => { if (++n === 1) throw new Error('down'); return n })
    await expect(get()).rejects.toThrow('down')
    expect(await get()).toBe(2)
  })
})

describe('the Stage page reading the takes list', () => {
  let calls = 0
  const takes = [{ id: 'take-a', worldId: 'loc-a', lockedAt: '2026-10-29T10:00:00Z' }, { id: 'take-b', worldId: 'loc-a', lockedAt: '2026-10-29T11:00:00Z' }] as TakeRecord[]
  beforeEach(() => {
    calls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/__lab/takes') { calls++; await new Promise((r) => setTimeout(r, 5)); return new Response(JSON.stringify({ takes })) }
      return new Response('{}', { status: 404 })
    }))
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetLockedTakes(); resetCurrentTake() })

  function Readers() {
    // the readers a Stage page mounts at once: take list, pipeline strip, restore, hero block, frame edit, board…
    const Locked = () => { useLockedTakes('loc-a'); return null }
    const All = () => { useAllTakes(); return null }
    return <>{Array.from({ length: 6 }, (_, i) => <Locked key={`l${i}`} />)}{Array.from({ length: 4 }, (_, i) => <All key={`a${i}`} />)}</>
  }

  it('ten readers mounting, then a take switch, each send at most two requests', async () => {
    setCurrentTake('take-a')
    render(<Readers />)
    await act(async () => { await new Promise((r) => setTimeout(r, 40)) })
    const onMount = calls
    expect(onMount).toBeLessThanOrEqual(2)
    act(() => setCurrentTake('take-b'))
    await act(async () => { await new Promise((r) => setTimeout(r, 40)) })
    expect(calls - onMount).toBeLessThanOrEqual(2)
    await flush()
  })
})
