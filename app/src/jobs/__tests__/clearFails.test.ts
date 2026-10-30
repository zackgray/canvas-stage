// m-4 (scene library review): a finished job's result is applied once per page even when its clear call fails. Before, a failed
// clear left the server's record in place; the next sync took it for another tab's and applied it again after the grace, so a late
// second Develop overwrote a brief edited in between. The real job store over a library api whose clear fails (the network, a
// restart), and a server record that stays until a clear goes through.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryApi } from '../../library/api'
import { JOB_HEADERS, type SceneJobRecord } from '../../shared/libraryContract'
import { CLAIM_GRACE_MS, jobFetch, SceneJobs } from '../sceneJobs'

const SCENE = 'sc-20261025090000-aaaa'
const reply = { status: 200, body: { kind: 'develop', brief: { brief: 'A chase.' } } }
const done = (id: string): SceneJobRecord => ({ id, scene: SCENE, intent: 'develop', target: 'develop', price: 3, route: '/__lab/planner/develop',
  status: 'done', startedAt: new Date(0).toISOString(), finishedAt: new Date(0).toISOString(), reply })

/** the server's job records, and a clear that fails the first `failures` times */
function server(failures: number) {
  const records = new Map<string, SceneJobRecord>()
  const clears: string[] = []
  const api = {
    jobs: vi.fn(async () => [...records.values()]),
    clearJob: vi.fn(async (_s: string, id: string) => {
      clears.push(id)
      if (failures-- > 0) throw new Error('Failed to fetch')
      return records.delete(id)
    }),
  } as unknown as LibraryApi
  return { api, records, clears }
}
const flush = () => new Promise((r) => setTimeout(r, 0))
afterEach(() => { vi.unstubAllGlobals() })

describe('a failed clear never applies a result twice (m-4)', () => {
  it('another tab\'s (or a reload\'s) finished job: applied once; the failed clear is retried, never re-applied after the grace', async () => {
    let now = 1_000_000
    const s = server(1)
    s.records.set('j-a', done('j-a'))
    const jobs = new SceneJobs(SCENE, { api: s.api, storage: null, now: () => now })
    const apply = vi.fn()
    jobs.own({}, { intents: ['develop'], parse: async (_j, r) => r.body, apply })
    await jobs.sync(); await flush(); await flush()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(s.clears).toEqual(['j-a']) // the clear failed: the record is still on the server
    expect(s.records.has('j-a')).toBe(true)
    now += CLAIM_GRACE_MS + 1000 // past the grace that hands another tab's job over
    await jobs.sync(); await flush(); await flush()
    expect(apply).toHaveBeenCalledTimes(1) // not applied again
    expect(s.clears).toEqual(['j-a', 'j-a']) // cleared again instead
    expect(s.records.has('j-a')).toBe(false)
    await jobs.sync(); await flush()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(jobs.running('develop')).toBeNull()
  })

  it('the page that pressed applies its own answer; a failed clear of its record never hands it to a consumer later', async () => {
    let now = 2_000_000
    const s = server(2)
    const jobs = new SceneJobs(SCENE, { api: s.api, storage: null, now: () => now })
    const apply = vi.fn()
    const owner = {}
    jobs.own(owner, { intents: ['develop'], parse: async (_j, r) => r.body, apply })
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      const id = (init?.headers as Record<string, string>)[JOB_HEADERS.job]
      s.records.set(id, done(id)) // the server recorded the reply before answering
      return new Response(JSON.stringify(reply.body), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const res = await jobs.run({ intent: 'develop', target: 'develop', price: 3, owner }, () => jobFetch('/__lab/planner/develop', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(200) // the caller applies this itself
    await flush()
    expect(s.clears).toHaveLength(1) // failed
    for (let i = 0; i < 3; i++) { now += CLAIM_GRACE_MS + 1000; await jobs.sync(); await flush(); await flush() }
    expect(apply).not.toHaveBeenCalled() // never a second apply of the caller's own result
    expect(s.records.size).toBe(0) // the retried clear went through
  })
})
