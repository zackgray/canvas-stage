// The Scene client's routes over a mocked fetch: S2's planner routes, every piece kind's candidate route (Cast fronts for people and
// creatures, concepts for the rest, with the scene's lines and the quality), billed failures named for recovery, uploads refused
// before anything is sent when the server would refuse them, and the draft routes.
import { describe, expect, it, vi } from 'vitest'
import { CONCEPT_KINDS, UPLOAD_LIMIT } from '../../../shared/sceneContract'
import { StaleSceneError } from '../../../library/api'
import { DEFAULT_RULES } from '../../../labs/projection/cast/api'
import { briefApi, DEFAULT_LOOK_RULES, PlannerError } from '../briefApi'

type Call = { url: string; init?: RequestInit }
function fetcher(answer: (url: string) => { status?: number; body: unknown } = () => ({ body: {} })) {
  const calls: Call[] = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const a = answer(url)
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } })
  })
  return { f, calls, body: (i: number) => JSON.parse(String(calls[i].init?.body)) as Record<string, unknown> }
}

describe('briefApi', () => {
  it('the planner call goes to S2\'s route', async () => {
    const t = fetcher(() => ({ body: { kind: 'plan', scenes: [] } }))
    const api = briefApi(t.f)
    await api.plan({ prompts: ['p'] })
    expect(t.calls.map((c) => c.url)).toEqual(['/__lab/planner/plan'])
    expect(t.body(0)).toEqual({ prompts: ['p'] })
  })
  it('the front door: Develop posts the text to the develop route; the status (price, budget) is a GET of the planner, free', async () => {
    const t = fetcher((url) => ({ body: url.endsWith('/develop') ? { kind: 'develop', brief: null } : { prices: { single: 4 }, budget: { cap: 500, remaining: 9 } } }))
    const api = briefApi(t.f)
    await api.develop({ idea: 'a quiet street', mode: 'light' })
    expect(await api.status()).toMatchObject({ prices: { single: 4 }, budget: { remaining: 9 } })
    expect(t.calls.map((c) => [c.url, c.init?.method ?? 'GET'])).toEqual([['/__lab/planner/develop', 'POST'], ['/__lab/planner', 'GET']])
    expect(t.body(0)).toEqual({ idea: 'a quiet street', mode: 'light' })
    const refused = briefApi(fetcher(() => ({ status: 429, body: { error: 'Day budget reached' } })).f)
    await expect(refused.develop({ idea: 'x', mode: 'light' })).rejects.toMatchObject({ status: 429, billed: false })
  })
  it('every look kind draws through the concept route with its lines and quality; people and creatures through Cast', async () => {
    const t = fetcher((url) => ({ body: url.includes('cast') ? { candidates: ['/a.png', '/b.png'] } : { urls: ['/c.png'] } }))
    const api = briefApi(t.f, 'proj1')
    for (const kind of CONCEPT_KINDS) {
      expect(await api.candidates({ type: kind, prompt: `a ${kind}`, count: 1, quality: 'draft', lighting: ' Dusk. ', materials: '' })).toEqual({ urls: ['/c.png'] })
    }
    expect(t.calls.every((c) => c.url === '/__lab/scene/concepts')).toBe(true)
    expect(t.body(6)).toEqual({ kind: 'group', description: 'a group', count: 1, quality: 'draft', project: 'proj1', lighting: 'Dusk.' })
    await api.candidates({ type: 'location', prompt: 'p', count: 2 })
    expect(t.body(7)).toMatchObject({ quality: 'full', count: 2 })
    expect(await api.candidates({ type: 'creature', prompt: 'a creature', count: 1, name: 'Ember' })).toEqual({ urls: ['/a.png', '/b.png'] })
    expect(t.calls[8].url).toBe('/__lab/cast/candidates')
    expect(t.body(8)).toMatchObject({ cardId: expect.stringMatching(/^ember-[a-z0-9]+$/), description: 'a creature', count: 1 })
  })
  it('a cast press at 1 look sends 1 (the server floor is 1, as is the Cast stepper floor)', async () => {
    const t = fetcher(() => ({ body: { candidates: ['/a.png'] } }))
    await briefApi(t.f).candidates({ type: 'person', prompt: 'a person', count: 1, name: 'One' })
    expect(t.body(0)).toMatchObject({ count: 1 })
    await briefApi(t.f).candidates({ type: 'person', prompt: 'a person', count: 9, name: 'Many' })
    expect(t.body(1)).toMatchObject({ count: 4 })
  })
  it("the person maker's boxes: unedited, the prompt carries only the short no-logos line (the long rules text is gone), no framing; edited, each rides as written; '' removes the line", async () => {
    const t = fetcher(() => ({ body: { candidates: ['/a.png'] } }))
    await briefApi(t.f).candidates({ type: 'person', prompt: 'a cook in a white apron', count: 2, name: 'Cook' })
    expect(Object.keys(t.body(0)).sort()).toEqual(['cardId', 'count', 'description', 'name', 'rules'])
    expect(t.body(0).rules).toBe('No logos or printed text.') // the one short line, exactly
    expect(t.body(0).rules).toBe(DEFAULT_LOOK_RULES)
    expect(t.body(0).rules).not.toBe(DEFAULT_RULES)
    await briefApi(t.f).candidates({ type: 'person', prompt: 'a cook in a white apron', count: 2, name: 'Cook', rules: 'Plain clothes only.', framing: 'A seated portrait.' })
    expect(t.body(1)).toMatchObject({ rules: 'Plain clothes only.', framing: 'A seated portrait.' })
    await briefApi(t.f).candidates({ type: 'person', prompt: 'a cook in a white apron', count: 2, name: 'Cook', rules: '' })
    expect(t.body(2).rules).toBe('')
  })
  it('wave 3 M3: every front draw has a card id of its own, so a second press never lands on the first, paid, pair', async () => {
    const t = fetcher(() => ({ body: { candidates: ['/a.png', '/b.png'] } }))
    const api = briefApi(t.f)
    for (let i = 0; i < 3; i++) await api.candidates({ type: 'person', prompt: 'an outlaw in green', count: 2, name: 'Éowyn of Rohan' })
    const ids = [0, 1, 2].map((i) => String(t.body(i).cardId))
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(id).toMatch(/^eowyn-of-rohan-[a-z0-9]+$/)
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(41)
  })
  it('wave 3 M1: a card from a tile keeps its face under the card, then saves the project version (references = face, face)', async () => {
    const t = fetcher((url) => ({ body: url.includes('keep') ? { url: '/lab-assets/cast/robin-x1/kept/face-1.png' } : { id: 'default' } }))
    await briefApi(t.f).saveCard({ cardId: 'robin-x1', name: ' Robin ', description: '', face: '/lab-assets/cast/robin-x1/draft/cand-2.png' })
    expect(t.calls.map((c) => c.url)).toEqual(['/__lab/cast/keep', '/__lab/project/default/ingredient'])
    expect(t.body(0)).toEqual({ cardId: 'robin-x1', from: '/lab-assets/cast/robin-x1/draft/cand-2.png' })
    expect(t.body(1)).toEqual({ kind: 'cast', id: 'robin-x1', name: 'Robin', payload: {
      name: 'Robin', description: 'Robin', references: ['/lab-assets/cast/robin-x1/kept/face-1.png', '/lab-assets/cast/robin-x1/kept/face-1.png'], sheets: [] } })
  })
  it('a refusal is not billed; a 502 with a job id is billed and says recover by id', async () => {
    const refused = briefApi(fetcher(() => ({ status: 429, body: { error: 'Day budget reached' } })).f)
    await expect(refused.candidates({ type: 'mood', prompt: 'p', count: 1 })).rejects.toMatchObject({ status: 429, billed: false, message: 'Day budget reached' })
    const lost = briefApi(fetcher(() => ({ status: 502, body: { error: 'job x succeeded but its download failed', jobId: 'job-123' } })).f)
    const e = await lost.candidates({ type: 'mood', prompt: 'p', count: 1 }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(PlannerError)
    expect(e).toMatchObject({ billed: true, jobId: 'job-123' })
    expect((e as Error).message).toMatch(/job job-123: billed; recover it by id, do not press again/)
  })
  it('uploads: the raw image to the upload route; a wrong type or an oversized file is refused before anything is sent', async () => {
    const t = fetcher(() => ({ body: { url: '/lab-assets/scene/default/draft/refs/u-1.png', bytes: 3, type: 'image/png' } }))
    const api = briefApi(t.f)
    const png = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
    expect(await api.uploadReference(png)).toBe('/lab-assets/scene/default/draft/refs/u-1.png')
    expect(t.calls[0].url).toBe('/__lab/scene/upload?project=default')
    expect(new Headers(t.calls[0].init?.headers).get('content-type')).toBe('image/png')
    await expect(api.uploadReference(new File(['x'], 'a.gif', { type: 'image/gif' }))).rejects.toThrow(/Only PNG, JPEG or WebP/)
    const big = new File([new Uint8Array(1)], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: UPLOAD_LIMIT + 1 })
    await expect(api.uploadReference(big)).rejects.toThrow(/larger than 12 MB/)
    expect(t.calls).toHaveLength(1)
  })
  it('the draft: read, written with the revision it was read at, and moved into a world', async () => {
    let rev = 4
    const t = fetcher((url) => ({ body: url.includes('migrate') ? { worldId: 'w', moved: { '/a': '/b' }, design: {} } : url.includes('clear') ? { cleared: true }
      : { draft: { design: { idea: 'x' }, revision: url.includes('?') ? rev : ++rev } } }))
    const api = briefApi(t.f, 'p2')
    expect(await api.loadDraft()).toEqual({ idea: 'x' })
    await api.saveDraft({ idea: 'y' })
    await api.saveDraft({ idea: 'z' })
    expect(await api.migrateDraft('loc-1')).toEqual({ '/a': '/b' })
    expect(t.calls.map((c) => c.url)).toEqual(['/__lab/scene/draft?project=p2', '/__lab/scene/draft', '/__lab/scene/draft', '/__lab/scene/draft/migrate'])
    expect(t.body(1)).toEqual({ project: 'p2', design: { idea: 'y' }, revision: 4 })
    expect(t.body(2)).toEqual({ project: 'p2', design: { idea: 'z' }, revision: 5 }) // each write is based on the last one
    expect(t.body(3)).toEqual({ project: 'p2', worldId: 'loc-1' })
  })
  it('m7: a stale draft write (another tab wrote the scene) is a StaleSceneError, never retried over it', async () => {
    const t = fetcher((url) => (url.includes('?') ? { body: { draft: { design: {}, revision: 1 } } } : { status: 409, body: { error: 'changed', revision: 2 } }))
    const api = briefApi(t.f, 'p2')
    await api.loadDraft()
    await expect(api.saveDraft({ idea: 'mine' })).rejects.toBeInstanceOf(StaleSceneError)
    expect(t.calls).toHaveLength(2)
  })
})
