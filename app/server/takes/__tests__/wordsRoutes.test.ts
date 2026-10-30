// The take list's routes over a temp public dir: a new lock copies the scene prompt in (a copy: a later scene edit never rewrites
// it, the board says "scene prompt changed" and Update from scene copies again), typed words, a Start from… copy, rename, the
// sources (other takes, other scenes), the board's states and the refusals. Free; no Comfy.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { ROUTES, shotPaths, type TakeLockRequest, type TakeRecord } from '../../../src/shared/shotContract.ts'
import type { TakeBoardResponse, WordsSourcesResponse } from '../../../src/shared/takeWordsContract.ts'
import { labTakes } from '../plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = '', pub = '', close = () => {}
let clock = Date.parse('2026-10-28T12:00:00.000Z')

beforeAll(async () => {
  pub = mkdtempSync(path.join(tmpdir(), 'takewords-'))
  const routes: [string, Handler][] = []
  const plugin = labTakes({}, { publicDir: pub, now: () => new Date((clock += 1000)) }) as { configureServer: (s: unknown) => void }
  plugin.configureServer({ config: {}, middlewares: { use: (p: string, h: Handler) => { routes.push([p, h]) } } })
  const server = createServer((req, res) => {
    const hit = routes.find(([p]) => req.url === p || req.url!.startsWith(p + '/') || req.url!.startsWith(p + '?'))
    if (!hit) { res.statusCode = 404; return res.end() }
    req.url = req.url!.slice(hit[0].length) || '/'
    hit[1](req, res, () => { res.statusCode = 404; res.end() })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  close = () => server.close()
})
afterAll(() => { close(); rmSync(pub, { recursive: true, force: true }) })

const putBible = (worldId: string, prompt: string) => {
  const b: BibleRecord = { worldId, version: 1, prompt, master: null, candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' }
  const f = path.join(pub, ...biblePaths(worldId).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(b))
}
const putScene = (id: string, name: string, worldId: string) => {
  const f = path.join(pub, 'lab-assets', 'scene', id, 'scene.json')
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify({ id, name, revision: 1, hidden: false, createdAt: 't', updatedAt: 't', worldId, worlds: [{ id: worldId, builtAt: 't', brief: null }] }))
}
const sample = (t: number) => ({ t, position: [0, 1.6, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 35, focus: 3 })
const lockBody = (worldId: string, perfStart: number): TakeLockRequest => ({ worldId, packId: null, fps: 24, frames: 25, samples: [sample(0), sample(1)], focal: 35, viewAspect: 16 / 9, perfStart })
const json = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${ROUTES.takes}${p}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })
const lock = async (worldId: string, perfStart: number) => ((await (await json('/lock', lockBody(worldId, perfStart))).json()) as { take: TakeRecord }).take
const board = async (world: string) => (await (await fetch(`${base}${ROUTES.takes}/board?world=${world}`)).json()) as TakeBoardResponse

describe("a take's own words", () => {
  let a: TakeRecord
  it('a new lock copies the scene prompt in as the take\'s words; a world with no Bible gives none', async () => {
    putBible('loc-one', 'A quiet harbour at dawn.')
    a = await lock('loc-one', 1)
    expect([a.prompt, a.sceneBase]).toEqual(['A quiet harbour at dawn.', 'A quiet harbour at dawn.'])
    const bare = await lock('loc-none', 1)
    expect(bare.prompt).toBeUndefined()
  })

  it('a scene edit never rewrites the take: the board says so, and Update from scene copies again', async () => {
    putBible('loc-one', 'A quiet harbour at night.')
    let row = (await board('loc-one')).rows.find((r) => r.id === a.id)!
    expect([row.words, row.own, row.sceneChanged, row.state]).toEqual(['A quiet harbour at dawn.', true, true, 'locked'])
    const r = await json('/words', { takeId: a.id, fromScene: true })
    expect(((await r.json()) as { take: TakeRecord }).take.prompt).toBe('A quiet harbour at night.')
    row = (await board('loc-one')).rows.find((x) => x.id === a.id)!
    expect([row.words, row.sceneChanged]).toEqual(['A quiet harbour at night.', false])
  })

  it('typed words keep the scene base; a Start from… copy takes the scene prompt now as its base', async () => {
    await json('/words', { takeId: a.id, prompt: 'A busy harbour at night.' })
    putBible('loc-one', 'A quiet harbour in fog.')
    expect((await board('loc-one')).rows.find((r) => r.id === a.id)!.sceneChanged).toBe(true)
    await json('/words', { takeId: a.id, prompt: 'Copied words.', rebase: true })
    const row = (await board('loc-one')).rows.find((r) => r.id === a.id)!
    expect([row.words, row.sceneChanged]).toEqual(['Copied words.', false])
  })

  it('sources: every other take and every other scene with a prompt, never this take or its own scene', async () => {
    putScene('sc-20261028120000-aaaa', 'Harbour', 'loc-one')
    putScene('sc-20261028120000-bbbb', 'Desert', 'loc-two')
    putBible('loc-two', 'A dune at noon.')
    const b = await lock('loc-two', 2)
    const s = ((await (await fetch(`${base}${ROUTES.takes}/sources?take=${a.id}`)).json()) as WordsSourcesResponse).sources
    expect(s).toContainEqual({ kind: 'take', id: b.id, name: null, scene: 'Desert', words: 'A dune at noon.' })
    expect(s).toContainEqual({ kind: 'scene', id: 'sc-20261028120000-bbbb', name: 'Desert', scene: null, words: 'A dune at noon.' })
    expect(s.some((x) => x.id === a.id || x.id === 'sc-20261028120000-aaaa')).toBe(false)
  })

  it('rename: a name, then back to none', async () => {
    const named = ((await (await json('/rename', { takeId: a.id, name: '  Wide   on the pier ' })).json()) as { take: TakeRecord }).take
    expect(named.name).toBe('Wide on the pier')
    expect((await board('loc-one')).rows.find((r) => r.id === a.id)!.name).toBe('Wide on the pier')
    const cleared = ((await (await json('/rename', { takeId: a.id, name: '' })).json()) as { take: TakeRecord }).take
    expect('name' in cleared).toBe(false)
  })

  it('the board says drawn for an approved first frame of the take, with its picture', async () => {
    const dir = path.join(pub, shotPaths(a.id).hero)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'hero-x1.json'), JSON.stringify({ id: 'hero-x1', takeId: a.id, startKey: a.startKey, png: '', seed: 1, jobId: null, credits: 0, approved: true, createdAt: 't' }))
    const row = (await board('loc-one')).rows.find((r) => r.id === a.id)!
    expect([row.state, row.thumb]).toEqual(['drawn', `/lab-assets/shots/${a.id}/hero/hero-x1.png`])
  })

  it('refuses bad ids (400), unknown takes (404), oversize words (400), foreign pages (403)', async () => {
    expect((await json('/words', { takeId: '../x', prompt: 'p' })).status).toBe(400)
    expect((await json('/words', { takeId: 'take-nope', prompt: 'p' })).status).toBe(404)
    expect((await json('/words', { takeId: a.id, prompt: 'x'.repeat(4001) })).status).toBe(400)
    expect((await json('/rename', { takeId: a.id, name: 'x'.repeat(61) })).status).toBe(400)
    expect((await json('/words', { takeId: a.id, prompt: 'p' }, { origin: 'http://evil.example' })).status).toBe(403)
    expect((await fetch(`${base}${ROUTES.takes}/board?world=../x`)).status).toBe(400)
  })
})

