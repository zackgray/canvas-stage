// Pass candidates end to end over a temp public dir: list, Keep (applier, idempotent, refuses a changed target), Discard (free),
// recover by id. No network, nothing submits.
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { call, JSON_LOCAL, post } from '../../project/__tests__/rig.ts'
import { labPasses } from '../plugin.ts'
import { registerApplier, registerRecoverer, resetRegistry } from '../registry.ts'
import { completeCandidate, createCandidate, failCandidate, passesDirOf, readCandidate, setCandidateJob, type NewCandidate } from '../store.ts'

const TAKE = 'take-2026-10-24T12-00-00-000'
type H = Parameters<typeof call>[0]

function rig() {
  const pub = path.join(mkdtempSync(path.join(tmpdir(), 'passes-')), 'public')
  mkdirSync(pub, { recursive: true })
  const routes: Record<string, H> = {}
  ;(labPasses().configureServer as (s: unknown) => void)({ config: { root: path.dirname(pub), publicDir: pub }, middlewares: { use: (p: string, h: H) => { routes[p] = h } } })
  const h = routes['/__lab/passes']
  return { pub, list: (t = TAKE) => call(h, `/?take=${t}`), act: (verb: string, id: string, headers = JSON_LOCAL) => post(h, `/${verb}`, { id }, headers) }
}

const input = (over: Partial<NewCandidate> = {}): NewCandidate => ({ takeId: TAKE, pass: 'prop', target: { kind: 'still', stillId: 'hero-1' }, subject: 'wagon', box: { x: 10, y: 20, w: 300, h: 200 },
  beforeUrl: '/before.png', jobId: 'job-12345678', costCredits: 4, ...over })

/** a test applier: the "approved image" is a variable the test can move */
let approved: string | null
const applied: string[] = []
beforeEach(() => {
  resetRegistry(); approved = '/before.png'; applied.length = 0
  registerApplier('still', {
    current: async () => approved,
    apply: async (c) => { applied.push(c.id); const replacedUrl = approved!; approved = c.afterUrl; return { replacedUrl } },
  })
})

async function ready(r: ReturnType<typeof rig>, over: Partial<NewCandidate> = {}) {
  const c = await createCandidate(r.pub, input(over))
  return completeCandidate(r.pub, c, { afterUrl: '/after.png', afterCropUrl: '/after-crop.png' })
}

describe('list', () => {
  it('lives under the take, newest first, and a take with none is empty', async () => {
    const r = rig()
    expect((await r.list()).body).toEqual({ candidates: [] })
    const a = await createCandidate(r.pub, input(), new Date('2026-10-24T10:00:00Z'))
    const b = await createCandidate(r.pub, input({ subject: 'door' }), new Date('2026-10-24T11:00:00Z'))
    expect(existsSync(path.join(passesDirOf(r.pub, TAKE), `${a.id}.json`))).toBe(true)
    expect(((await r.list()).body.candidates as { id: string }[]).map((c) => c.id)).toEqual([b.id, a.id])
    expect((await r.list('take-nope')).body.candidates).toEqual([])
    expect((await r.list('..%2Fx')).status).toBe(400)
  })
})

describe('Keep', () => {
  it('makes the result the approved image, records what it replaced, and a second press changes nothing', async () => {
    const r = rig(); const c = await ready(r)
    const k = await r.act('keep', c.id)
    expect([k.status, k.body.candidate.state, k.body.candidate.replacedUrl]).toEqual([200, 'kept', '/before.png'])
    expect(approved).toBe('/after.png')
    expect((await r.act('keep', c.id)).body.candidate.state).toBe('kept')
    expect(applied).toEqual([c.id])
  })
  it('refuses when the image changed since the pass started, and leaves it a candidate', async () => {
    const r = rig(); const c = await ready(r)
    approved = '/someone-redrew-it.png'
    const k = await r.act('keep', c.id)
    expect([k.status, k.body.code]).toEqual([409, 'target_changed'])
    expect(applied).toEqual([])
    expect((await r.list()).body.candidates[0].state).toBe('candidate')
  })
  it('refuses a running, failed or discarded candidate, and says so when nothing applies that target', async () => {
    const r = rig()
    const running = await createCandidate(r.pub, input())
    expect((await r.act('keep', running.id)).body.code).toBe('not_candidate')
    const failed = await failCandidate(r.pub, await createCandidate(r.pub, input()), 'boom')
    expect((await r.act('keep', failed.id)).status).toBe(409)
    const d = await ready(r); await r.act('discard', d.id)
    expect((await r.act('keep', d.id)).body.code).toBe('not_candidate')
    const render = await ready(r, { target: { kind: 'render', renderId: 'l2r-1' } })
    expect((await r.act('keep', render.id)).body.code).toBe('no_applier')
    expect(applied).toEqual([])
  })
  it('two presses at once apply once', async () => {
    const r = rig(); const c = await ready(r)
    await Promise.all([r.act('keep', c.id), r.act('keep', c.id)])
    expect(applied).toEqual([c.id])
  })
})

describe('Discard', () => {
  it('is free and touches nothing but the state', async () => {
    const r = rig(); const c = await ready(r)
    const d = await r.act('discard', c.id)
    expect([d.status, d.body.candidate.state, approved, applied]).toEqual([200, 'discarded', '/before.png', []])
    expect((await r.act('discard', c.id)).body.candidate.state).toBe('discarded')
    expect((await r.act('discard', (await createCandidate(r.pub, input())).id)).status).toBe(409) // still running
  })
})

describe('guards and ids', () => {
  it('refuses a foreign page, a bad id and an unknown one', async () => {
    const r = rig(); const c = await ready(r)
    expect((await r.act('keep', c.id, { ...JSON_LOCAL, origin: 'http://evil.example' })).status).toBe(403)
    expect((await r.act('keep', '../../x')).status).toBe(400)
    expect((await r.act('keep', 'pass-nope')).status).toBe(404)
    expect((await call(routesOf(r), '/nope', { method: 'POST', headers: JSON_LOCAL, body: '{}' })).status).toBe(404)
  })
})
function routesOf(r: ReturnType<typeof rig>): H {
  const routes: Record<string, H> = {}
  ;(labPasses().configureServer as (s: unknown) => void)({ config: { publicDir: r.pub }, middlewares: { use: (p: string, h: H) => { routes[p] = h } } })
  return routes['/__lab/passes']
}

describe('recover by id', () => {
  it('completes a running candidate from its job, and a failed one can try again; never resubmits', async () => {
    const r = rig(); let calls = 0
    registerRecoverer('prop', async (c) => { calls++; if (calls === 1) throw new Error('job is still running'); return { afterUrl: `/after-${c.jobId}.png`, costCredits: 5 } })
    const c = await createCandidate(r.pub, input())
    const first = await r.act('recover', c.id)
    expect([first.status, first.body.error]).toEqual([500, 'job is still running'])
    expect((await r.list()).body.candidates[0]).toMatchObject({ state: 'failed', jobId: 'job-12345678' })
    const second = await r.act('recover', c.id)
    expect([second.body.candidate.state, second.body.candidate.afterUrl, second.body.candidate.costCredits]).toEqual(['candidate', '/after-job-12345678.png', 5])
    expect((await r.act('recover', c.id)).body.candidate.state).toBe('candidate') // nothing left to recover: no third call
    expect(calls).toBe(2)
  })
  it('refuses with no job id or no recoverer', async () => {
    const r = rig()
    expect((await r.act('recover', (await createCandidate(r.pub, input({ jobId: null }))).id)).body.code).toBe('no_job')
    expect((await r.act('recover', (await createCandidate(r.pub, input({ pass: 'face' }))).id)).body.code).toBe('no_recoverer')
  })
})

describe('the one job-id writer (join: the face pass and the still redraws both call it)', () => {
  it('sets the id on a running candidate once; a done candidate or one that has an id is left as it is', async () => {
    const r = rig()
    const c = await createCandidate(r.pub, input({ jobId: null }))
    expect((await setCandidateJob(r.pub, c, 'job-aaaaaaaa')).jobId).toBe('job-aaaaaaaa')
    expect((await setCandidateJob(r.pub, c, 'job-bbbbbbbb')).jobId).toBe('job-aaaaaaaa')
    const d = await completeCandidate(r.pub, await createCandidate(r.pub, input({ jobId: null })), { afterUrl: '/a.png' })
    expect((await setCandidateJob(r.pub, d, 'job-cccccccc')).jobId).toBeNull()
    expect((await readCandidate(r.pub, TAKE, c.id)).jobId).toBe('job-aaaaaaaa')
  })
})
