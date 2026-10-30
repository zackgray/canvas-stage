// @vitest-environment jsdom
// useScene's guards: nothing is approved that was not drawn, the paid draw never starts without a world, twice, or while the
// server reports one running; a draw re-reads until it lands. Plus the pure tag helpers and the fetch layer's routes.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bibleApi, BibleRequestError } from '../bibleApi'
import { elementOf, insertTag, isTag, masterCredits, tagChips, tagFrom, textDirty } from '../sceneTags'
import { RUNNING_POLL_MS, useScene } from '../useScene'
import { blank, fakeApi, rosa, WORLD } from './fakes'

afterEach(() => { vi.useRealTimers() })

async function loaded(api: ReturnType<typeof fakeApi>['api'], worldId: string | null = WORLD) {
  const h = renderHook(() => useScene(worldId, api))
  if (worldId) await waitFor(() => expect(h.result.current.busy).toBeNull())
  return h
}

describe('useScene guards', () => {
  it('M5: a billed master job that never landed is shown; Recover fetches it by id (never a new draw) and reloads the Bible', async () => {
    const { api } = fakeApi()
    const lost = [{ jobId: 'job-lost-1', ids: ['m-1', 'm-2'], since: 't' }]
    api.get.mockResolvedValueOnce({ bible: blank(WORLD), running: null, unrecovered: lost } as never)
    const h = await loaded(api)
    expect(h.result.current.unrecovered).toEqual(lost)
    await act(async () => { await h.result.current.recover('job-lost-1') })
    expect(api.recover).toHaveBeenCalledWith('job-lost-1')
    expect(api.drawMaster).not.toHaveBeenCalled()
    expect(h.result.current.unrecovered).toEqual([])
  })

  it('refuses to approve an id that is not a drawn candidate, and sends nothing', async () => {
    const { api } = fakeApi()
    const h = await loaded(api)
    await act(async () => { await h.result.current.approve('m-never-drawn') })
    expect(api.approve).not.toHaveBeenCalled()
    expect(h.result.current.error).toBe('approve one of the drawn candidates')
  })

  it('measures the master depth (prepare) before the paid draw; a failed measure spends nothing', async () => {
    const { api } = fakeApi()
    const order: string[] = []
    api.drawMaster.mockImplementation(async () => { order.push('draw'); return { bible: { ...blank(WORLD), version: 1 }, running: null } })
    const prepare = vi.fn(async () => { order.push('depth') })
    const h = renderHook(() => useScene(WORLD, api, prepare))
    await waitFor(() => expect(h.result.current.busy).toBeNull())
    await act(async () => { await h.result.current.drawMaster() })
    expect(order).toEqual(['depth', 'draw'])
    prepare.mockRejectedValueOnce(new Error('no WebGL'))
    await act(async () => { await h.result.current.drawMaster() })
    expect(api.drawMaster).toHaveBeenCalledTimes(1); expect(h.result.current.error).toBe('no WebGL')
  })

  it('never draws a master without a world', async () => {
    const { api } = fakeApi()
    const h = await loaded(api, null)
    await act(async () => { await h.result.current.drawMaster() })
    expect(api.drawMaster).not.toHaveBeenCalled()
    expect(h.result.current.error).toBe('build the set first')
  })

  it('a second click while a draw is in flight starts nothing', async () => {
    const { api } = fakeApi()
    let release!: () => void
    api.drawMaster.mockImplementationOnce(() => new Promise((r) => { release = () => r({ bible: { ...blank(WORLD), version: 1 }, running: null }) }))
    const h = await loaded(api)
    let first!: Promise<boolean>
    act(() => { first = h.result.current.drawMaster() })
    await act(async () => { expect(await h.result.current.drawMaster()).toBe(false) })
    await act(async () => { release(); await first })
    expect(api.drawMaster).toHaveBeenCalledTimes(1)
  })

  it('a draw the server reports running blocks a new one and is re-read until it lands', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { api } = fakeApi({ ...blank(WORLD), version: 2 }, { since: '2026-10-25T09:00:00Z', what: 'drawing the master' })
    const h = await loaded(api)
    expect(h.result.current.running?.what).toBe('drawing the master')
    await act(async () => { await h.result.current.drawMaster() })
    expect(api.drawMaster).not.toHaveBeenCalled()
    expect(h.result.current.error).toBe('a master draw is already running')
    api.get.mockResolvedValue({ bible: { ...blank(WORLD), version: 3 }, running: null })
    await act(async () => { await vi.advanceTimersByTimeAsync(RUNNING_POLL_MS + 10) })
    expect(h.result.current.running).toBeNull()
    expect(h.result.current.bible?.version).toBe(3)
  })

  it('unsaved prompt and lines are saved before a draw, so the draw reads them', async () => {
    const { api } = fakeApi()
    const h = await loaded(api)
    act(() => { h.result.current.edit('materials', 'wet mud') })
    await act(async () => { await h.result.current.drawMaster() })
    expect(api.save).toHaveBeenCalledWith({ worldId: WORLD, prompt: '', lighting: '', materials: 'wet mud' })
    expect(api.save.mock.invocationCallOrder[0]).toBeLessThan(api.drawMaster.mock.invocationCallOrder[0])
  })

  it('refuses a tile whose tag is malformed or already taken', async () => {
    const { api } = fakeApi({ ...blank(WORLD), version: 1, elements: [{ tag: 'mud', kind: 'material', refs: [], line: 'mud' }] })
    const h = await loaded(api)
    await act(async () => { await h.result.current.putElement({ tag: 'Mud!', kind: 'material', refs: [], line: 'x' }) })
    await act(async () => { await h.result.current.putElement({ tag: 'mud', kind: 'material', refs: [], line: 'x' }) })
    expect(api.putElement).not.toHaveBeenCalled()
    expect(h.result.current.error).toBe('@mud is already a reference')
  })
})

describe('tag helpers', () => {
  it('makes a tag from a name, unique against the taken ones', () => {
    expect(tagFrom('Rosa Klee')).toBe('rosa_klee')
    expect(tagFrom('Renée')).toBe('renee')
    expect(tagFrom('3 Crows')).toBe('crows')
    expect(tagFrom('!!!')).toBe('ref')
    expect(tagFrom('Rosa', ['rosa', 'rosa-2'])).toBe('rosa-3')
    expect(isTag(tagFrom('A very long name that goes on and on and on'))).toBe(true)
  })

  it('inserts a tag once, and marks the prompt\'s tags known or unknown', () => {
    expect(insertTag('', 'rosa')).toBe('@rosa')
    expect(insertTag('mud  ', 'rosa')).toBe('mud @rosa')
    expect(insertTag('@rosa walks', 'rosa')).toBe('@rosa walks')
    expect(tagChips('@rosa and @ghost, mail a@b.c', [{ tag: 'rosa', kind: 'cast', refs: [], line: '' }])).toEqual([{ tag: 'rosa', known: true }, { tag: 'ghost', known: false }])
  })

  it('dirty compares drafts with the saved Bible; prices; a card as a tile', () => {
    expect(textDirty(null, { prompt: '', lighting: '', materials: '' })).toBe(false)
    expect(textDirty({ prompt: 'a', lighting: '', materials: '' }, { prompt: 'a', lighting: 'b', materials: '' })).toBe(true)
    expect(masterCredits()).toBe(36)
    expect(elementOf(rosa, 'creature', ['rosa'])).toEqual({ tag: 'rosa-2', kind: 'creature', cardId: 'rosa', refs: ['/cast/rosa/front.png'], line: 'a stocky woman in a waxed jacket' })
  })
})

describe('bibleApi', () => {
  it('calls the contract routes and surfaces the server\'s refusal', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ bible: null }), { status: 200 }))
    const api = bibleApi(f)
    await api.get('loc-a b')
    await api.drawMaster({ worldId: 'loc-a', count: 2 })
    await api.approve({ worldId: 'loc-a', masterId: 'm1' })
    await api.removeElement({ worldId: 'loc-a', tag: 'mud' })
    expect((f.mock.calls as unknown as [string, RequestInit][]).map((c) => c[0])).toEqual(['/__lab/bible?world=loc-a%20b', '/__lab/bible/master', '/__lab/bible/approve', '/__lab/bible/element/remove'])
    f.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not built yet' }), { status: 501 }))
    await expect(api.save({ worldId: 'loc-a' })).rejects.toEqual(new BibleRequestError('not built yet', 501))
  })
})
