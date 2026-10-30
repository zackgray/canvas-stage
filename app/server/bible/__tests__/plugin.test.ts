import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BIBLE_ROUTES, biblePaths, type BibleMaster, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { labBible } from '../plugin.ts'
import { BibleStore } from '../store.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
const WORLD = 'loc-2026-10-23T09-00-00-000'
let pub = ''
let base = ''
let close = () => {}
let tick = 0
const now = () => new Date(Date.UTC(2026, 9, 23, 9, 0, tick++))
const J = { 'content-type': 'application/json' }
const post = (p: string, body: unknown, headers: Record<string, string> = J) =>
  fetch(`${base}${BIBLE_ROUTES.bible}${p}`, { method: 'POST', body: JSON.stringify(body), headers })
const get = async (w = WORLD) => (await (await fetch(`${base}${BIBLE_ROUTES.bible}?world=${w}`)).json()) as { bible: BibleRecord | null }
const master = (id: string): BibleMaster => ({ id, png: `/lab-assets/locations/${WORLD}/bible/master/${id}.png`, madeBy: 'qwen-image-2512+depth', seed: 1, depthStrength: 0.9, jobId: null, credits: 14, createdAt: 't' })

beforeAll(async () => {
  pub = mkdtempSync(path.join(tmpdir(), 'bible-'))
  mkdirSync(path.join(pub, 'lab-assets', 'locations', WORLD), { recursive: true })
  const routes: [string, Handler][] = []
  const plugin = labBible({}, { publicDir: pub, now }) as { apply: string; configureServer: (s: unknown) => void }
  expect(plugin.apply).toBe('serve')
  plugin.configureServer({ config: {}, middlewares: { use: (p: string, h: Handler) => routes.push([p, h]) } })
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

describe('bible routes on a temp dir', () => {
  it('no Bible yet reads null; an unknown world is 404; a bad id 400; foreign POST 403', async () => {
    expect((await get()).bible).toBeNull()
    expect((await post('', { worldId: 'loc-2026-10-23T09-00-01-000', prompt: 'x' })).status).toBe(404)
    expect((await post('', { worldId: '../etc', prompt: 'x' })).status).toBe(400)
    expect((await post('', { worldId: WORLD }, { ...J, origin: 'http://evil.example' })).status).toBe(403)
    expect((await post('', { worldId: WORLD }, { 'content-type': 'text/plain' })).status).toBe(415)
  })

  it('save, element, lines: each change writes the next version; versions never overwrite', async () => {
    const r1 = await (await post('', { worldId: WORLD, prompt: 'A field. The @dragon.', lighting: 'Dusk.' })).json() as { bible: BibleRecord }
    expect(r1.bible.version).toBe(1)
    const r2 = await (await post('/element', { worldId: WORLD, element: { tag: 'dragon', kind: 'creature', cardId: 'dragon', refs: ['/lab-assets/cast/dragon/a.png'], line: 'A dragon' } })).json() as { bible: BibleRecord }
    expect(r2.bible.version).toBe(2)
    // same content again: no new version
    expect((await (await post('/element', { worldId: WORLD, element: { tag: 'dragon', kind: 'creature', cardId: 'dragon', refs: ['/lab-assets/cast/dragon/a.png'], line: 'A dragon' } })).json() as { bible: BibleRecord }).bible.version).toBe(2)
    const r3 = await (await post('', { worldId: WORLD, materials: 'Matte mud.' })).json() as { bible: BibleRecord }
    expect(r3.bible.version).toBe(3)
    const dir = path.join(pub, biblePaths(WORLD).root, 'versions')
    expect(readdirSync(dir).sort()).toEqual(['v1.json', 'v2.json', 'v3.json'])
    expect(JSON.parse(readFileSync(path.join(dir, 'v1.json'), 'utf8')).prompt).toBe('A field. The @dragon.')
    expect(JSON.parse(readFileSync(path.join(dir, 'v1.json'), 'utf8')).elements).toEqual([])
    expect((await get()).bible?.version).toBe(3)
  })

  it('refuses a bad tag, a cast element with no card, a traversal ref', async () => {
    const el = (e: object) => post('/element', { worldId: WORLD, element: { refs: [], line: '', ...e } })
    expect((await el({ tag: 'Bad Tag', kind: 'prop' })).status).toBe(400)
    expect((await el({ tag: 'rider', kind: 'cast' })).status).toBe(400)
    expect((await el({ tag: 'rock', kind: 'prop', refs: ['/lab-assets/../secret.png'] })).status).toBe(400)
    expect((await el({ tag: 'rock', kind: 'nope' })).status).toBe(400)
    expect((await get()).bible?.version).toBe(3)
  })

  it('approve picks a candidate, sets the grade target, refuses unknown ids; removing an element is a new version', async () => {
    const store = new BibleStore(pub, now)
    await store.addCandidates(WORLD, [master('m1'), master('m2')])
    await expect(store.addCandidates(WORLD, [master('m1')])).rejects.toThrow(/already exists/)
    expect((await post('/approve', { worldId: WORLD, masterId: 'zzz' })).status).toBe(404)
    const a = await (await post('/approve', { worldId: WORLD, masterId: 'm2' })).json() as { bible: BibleRecord }
    expect(a.bible.master?.id).toBe('m2')
    expect(a.bible.candidates.map((c) => c.id)).toEqual(['m1', 'm2'])
    expect(a.bible.grade).toEqual({ target: master('m2').png, method: 'reinhard-lab' })
    const v = a.bible.version
    const rm = await (await post('/element/remove', { worldId: WORLD, tag: 'dragon' })).json() as { bible: BibleRecord }
    expect(rm.bible.version).toBe(v + 1)
    expect(rm.bible.elements).toEqual([])
    expect((await post('/element/remove', { worldId: WORLD, tag: 'dragon' })).status).toBe(404)
    // a refused v<N> overwrite: pre-existing file blocks the write (409), the old file is untouched
    const file = path.join(pub, biblePaths(WORLD).root, 'versions', `v${rm.bible.version + 1}.json`)
    writeFileSync(file, 'KEEP')
    expect((await post('', { worldId: WORLD, lighting: 'Changed.' })).status).toBe(409)
    expect(readFileSync(file, 'utf8')).toBe('KEEP')
  })

  it('the paid master route is wired to the real draw: without a Comfy target it is a 503, nothing spent', async () => {
    const was = [process.env.COMFY_API_KEY, process.env.COMFY_BASE_URL]
    delete process.env.COMFY_API_KEY; delete process.env.COMFY_BASE_URL
    try {
      const r = await post('/master', { worldId: WORLD })
      expect(r.status).toBe(503)
      expect((await r.json() as { error: string }).error).toMatch(/Comfy is not connected yet. Add your Comfy key/)
    } finally {
      if (was[0] !== undefined) process.env.COMFY_API_KEY = was[0]
      if (was[1] !== undefined) process.env.COMFY_BASE_URL = was[1]
    }
  })

  it('concurrent writes are serialised into distinct versions', async () => {
    const w = 'loc-2026-10-23T09-02-00-000'
    mkdirSync(path.join(pub, 'lab-assets', 'locations', w), { recursive: true })
    const rs = await Promise.all([1, 2, 3, 4].map((i) => post('', { worldId: w, prompt: `p${i}` })))
    const vs = (await Promise.all(rs.map((r) => r.json() as Promise<{ bible: BibleRecord }>))).map((r) => r.bible.version).sort()
    expect(vs).toEqual([1, 2, 3, 4])
  })
})
