// One prompt (owner 10-29): a new take starts from the words of the take before it, never the scene prompt underneath, once the world
// has a take: the take the page names (`wordsFrom`, the take last on show), else the world's newest; a name of another world or of no
// take falls back the same way; the first take copies the scene prompt. Editing one take's words never changes another's. Free.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import { ROUTES, type TakeLockRequest, type TakeRecord } from '../../../src/shared/shotContract.ts'
import type { TakeBoardResponse } from '../../../src/shared/takeWordsContract.ts'
import { labTakes } from '../plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = '', pub = '', close = () => {}
let clock = Date.parse('2026-10-29T12:00:00.000Z')

beforeAll(async () => {
  pub = mkdtempSync(path.join(tmpdir(), 'lockseed-'))
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
const sample = (t: number) => ({ t, position: [0, 1.6, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], focal: 35 })
const lockBody = (worldId: string, perfStart: number): TakeLockRequest => ({ worldId, packId: null, fps: 24, frames: 25, samples: [sample(0), sample(1)], focal: 35, viewAspect: 16 / 9, perfStart })
const post = (p: string, body: unknown) => fetch(`${base}${ROUTES.takes}${p}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const lock = async (worldId: string, perfStart: number, wordsFrom?: unknown) =>
  ((await (await post('/lock', { ...lockBody(worldId, perfStart), ...(wordsFrom !== undefined ? { wordsFrom } : {}) })).json()) as { take: TakeRecord }).take
const words = async (takeId: string, prompt: string) => expect((await post('/words', { takeId, prompt })).status).toBe(200)
const board = async (world: string) => (await (await fetch(`${base}${ROUTES.takes}/board?world=${world}`)).json()) as TakeBoardResponse
const wordsOf = async (world: string, id: string) => (await board(world)).rows.find((r) => r.id === id)?.words

describe('a new take starts from the take before it', () => {
  it("the first take copies the words typed before it; the next starts from the newest take's words, not the scene prompt", async () => {
    putBible('w-seed', 'Rain on the track. @driver in @car.')
    const t1 = await lock('w-seed', 1)
    expect(t1.prompt).toBe('Rain on the track. @driver in @car.')
    await words(t1.id, 'Close on @driver, rain on the visor.')
    const t2 = await lock('w-seed', 2)
    expect(t2.prompt).toBe('Close on @driver, rain on the visor.')
    expect(t2.sceneBase).toBe('Rain on the track. @driver in @car.') // so no "scene changed" is ever said of it
    expect((await board('w-seed')).rows.find((r) => r.id === t2.id)?.sceneChanged).toBe(false)
  })

  it('the take the page names (the one last on show) wins over the newest; editing one take never changes another', async () => {
    putBible('w-pick', 'A pit lane at night.')
    const t1 = await lock('w-pick', 1)
    const t2 = await lock('w-pick', 2)
    await words(t2.id, 'Wide of the grid, @car on pole.')
    await words(t1.id, 'Low on @car, spray off the tyres.')
    expect(await wordsOf('w-pick', t2.id)).toBe('Wide of the grid, @car on pole.')
    const t3 = await lock('w-pick', 3, t1.id)
    expect(t3.prompt).toBe('Low on @car, spray off the tyres.')
    await words(t3.id, 'Take three, its own words.')
    expect(await wordsOf('w-pick', t1.id)).toBe('Low on @car, spray off the tyres.')
    expect(await wordsOf('w-pick', t2.id)).toBe('Wide of the grid, @car on pole.')
    expect((await board('w-pick')).scenePrompt).toBe('A pit lane at night.') // the words underneath are never written by a take
  })

  it("a name of another world, of no take, or not a take id falls back to the world's newest take; the lock never fails on it", async () => {
    putBible('w-other', 'A desert road.')
    const far = await lock('w-other', 1)
    putBible('w-fall', 'A harbour.')
    const t1 = await lock('w-fall', 1)
    await words(t1.id, 'Harbour, take one words.')
    expect((await lock('w-fall', 2, far.id)).prompt).toBe('Harbour, take one words.')
    expect((await lock('w-fall', 3, 'take-nope')).prompt).toBe('Harbour, take one words.')
    expect((await lock('w-fall', 4, '../etc')).prompt).toBe('Harbour, take one words.')
    expect((await lock('w-fall', 5, 42)).prompt).toBe('Harbour, take one words.')
  })

  it('a re-lock of the same take is that take as it was: its words are not re-seeded', async () => {
    putBible('w-same', 'A bridge.')
    const t1 = await lock('w-same', 1)
    await words(t1.id, 'Bridge, edited.')
    const t2 = await lock('w-same', 2)
    await words(t2.id, 'Bridge two.')
    const again = await lock('w-same', 1, t2.id)
    expect(again.id).toBe(t1.id)
    expect(await wordsOf('w-same', t1.id)).toBe('Bridge, edited.')
  })
})
