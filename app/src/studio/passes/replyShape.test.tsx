// @vitest-environment jsdom
// The wave's client hooks never trust a reply's shape: a 200 with no list (an older server, a proxy's page) is said or ignored,
// never a crash (wave 2 bug: usePassCandidates read `.some` of undefined). One reply per hook, the list field missing.
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFacePass } from '../render/FacePassApi'
import { usePieces } from '../scene/usePieces'
import type { PiecesApi } from '../scene/piecesApi'
import { usePassCandidates } from './usePassCandidates'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const replyAll = (b: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })))

describe('a reply without its list', () => {
  it('usePassCandidates: says it could not read them, keeps an empty list', async () => {
    replyAll({})
    const { result } = renderHook(() => usePassCandidates('take-1'))
    await waitFor(() => expect(result.current.error).toBe('Could not read the pass candidates.'))
    expect(result.current.candidates).toEqual([])
  })
  it('useFacePass: no status (no strip), no crash', async () => {
    replyAll({ renderId: 'r1' })
    const { result } = renderHook(() => useFacePass('r1'))
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.status).toBeNull()
  })
  it('usePieces: no panel, no crash', async () => {
    const api = { get: async () => ({ running: null }) } as unknown as PiecesApi
    const crashed: unknown[] = [], onErr = (e: ErrorEvent) => { crashed.push(e.error); e.preventDefault() }
    window.addEventListener('error', onErr)
    const { result } = renderHook(() => usePieces('loc-1', api))
    await new Promise((r) => setTimeout(r, 20))
    window.removeEventListener('error', onErr)
    expect(crashed).toEqual([]) // a render that threw would leave the last good value in result.current
    expect(result.current.data).toBeNull()
  })
})
