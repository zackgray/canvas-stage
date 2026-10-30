// The scene library (temp public dir; nothing real read or written): scenes as documents with a revision, each owning its draft and
// the worlds built from it (attached by the kit-world route in the same request), the summary the Resume list shows, a stale write
// refused with nothing overwritten (m7), and two scenes' drafts, worlds and takes kept apart (m11).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SceneSummary, SceneView } from '../../../src/shared/libraryContract.ts'
import { shotPaths } from '../../../src/shared/shotContract.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { labStage3D, STAGE3D_ROUTE } from '../../stage3d/plugin.ts'
import { handleLibrary, libraryCtx } from '../libraryPlugin.ts'
import { handleScene, sceneCtx } from '../plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let pub = '', base = '', close = () => {}
let clock = Date.parse('2026-10-25T09:00:00.000Z')
const now = () => new Date((clock += 1000))

beforeAll(async () => {
  pub = path.join(mkdtempSync(path.join(tmpdir(), 'library-')), 'public')
  let handler: Handler | null = null
  const plugin = labStage3D({}, { publicDir: pub, now }) as unknown as { configureServer: (s: unknown) => void }
  plugin.configureServer({ middlewares: { use: (_p: string, h: Handler) => { handler = h } } })
  const server = createServer((req, res) => { req.url = req.url!.slice(STAGE3D_ROUTE.length) || '/'; handler!(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${STAGE3D_ROUTE}`
  close = () => server.close()
})
afterAll(() => { close(); rmSync(path.dirname(pub), { recursive: true, force: true }) })

const lib = () => libraryCtx({ publicDir: pub, now })
const call = (method: string, parts: string[], body: unknown = null, q = '') => handleLibrary(lib(), method, parts, new URLSearchParams(q), body)
const scenes = () => call('GET', []).then((r) => r.body as SceneSummary[])
const create = async (name?: string) => (await call('POST', [], name ? { name } : {})).body as SceneView
const view = async (id: string) => (await call('GET', [id])).body as SceneView
const draft = (project: string, design: Record<string, unknown>, revision: number) =>
  handleScene(sceneCtx({}, { publicDir: pub, configured: () => false }), 'POST', '/draft', new URLSearchParams(), { project, design, revision })
const buildWorld = async (scene?: string) => fetch(`${base}/world`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: BATTLEFIELD, ...(scene ? { scene } : {}) }) })
const lockTakeOn = (worldId: string, id: string, lockedAt: string) => {
  const f = path.join(pub, ...shotPaths(id).take.split('/'))
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify({ id, worldId, packId: null, fps: 24, frames: 49, samples: [], focal: 35, viewAspect: 1.77, perfStart: 0, startKey: 'k', lockedAt, createdAt: lockedAt }))
}

describe('scenes as documents', () => {
  it('create, read, rename, remove from the list: each write carries its revision; a stale one is refused and writes nothing (m7)', async () => {
    const a = await create()
    expect(a).toMatchObject({ name: 'Untitled scene', revision: 1, hidden: false, worldId: null, worlds: [] })
    expect(a.id).toMatch(/^sc-\d{14}-[a-z0-9]{4}$/)
    expect(a.summary).toMatchObject({ id: a.id, stage: 'brief', thumbnail: null, hidden: false })
    const renamed = (await call('POST', [a.id, 'rename'], { name: '  The   Overlook ', revision: 1 })).body as SceneView
    expect(renamed).toMatchObject({ name: 'The Overlook', revision: 2 })
    // a second tab still holding revision 1: refused with the stored revision, the name on disk untouched
    const stale = await call('POST', [a.id, 'rename'], { name: 'Tab two', revision: 1 })
    expect(stale.status).toBe(409)
    expect(stale.body).toMatchObject({ revision: 2, error: expect.stringMatching(/changed in another tab/) })
    expect((await view(a.id)).name).toBe('The Overlook')
    expect((await call('POST', [a.id, 'rename'], { name: 'x' })).status).toBe(400) // no revision: never a blind write
    expect((await call('POST', [a.id, 'rename'], { name: ' ', revision: 2 })).status).toBe(400)
    expect((await call('POST', [a.id, 'rename'], { name: 'x'.repeat(81), revision: 2 })).status).toBe(400)
    expect((await call('GET', ['../etc'])).status).toBe(400)
    expect((await call('GET', ['sc-20261025090000-zzzz'])).status).toBe(404)
    // remove from list: hidden, nothing deleted
    expect((await call('POST', [a.id, 'remove'], { revision: 2 })).body).toMatchObject({ hidden: true, revision: 3 })
    expect((await scenes()).map((s) => s.id)).not.toContain(a.id)
    expect(((await call('GET', [], null, 'hidden=1')).body as SceneSummary[]).map((s) => s.id)).toContain(a.id)
    expect(existsSync(path.join(pub, 'lab-assets', 'scene', a.id, 'scene.json'))).toBe(true)
  })

  it('a world built for a scene is attached in the same request and becomes its current set; a rebuild adds one, the old stays listed (M3)', async () => {
    const s = await create('Chase')
    const before = existsSync(path.join(pub, 'lab-assets', 'locations')) ? readdirSync(path.join(pub, 'lab-assets', 'locations')).length : 0
    expect((await buildWorld('sc-20261025090000-nope')).status).toBe(404) // an unknown scene: refused before anything is written
    expect((await buildWorld('../x')).status).toBe(404)
    const after = existsSync(path.join(pub, 'lab-assets', 'locations')) ? readdirSync(path.join(pub, 'lab-assets', 'locations')).length : 0
    expect(after).toBe(before)
    const w1 = (await (await buildWorld(s.id)).json()) as { id: string }
    expect(await view(s.id)).toMatchObject({ worldId: w1.id, worlds: [{ id: w1.id, brief: null }], facts: { setBuilt: true } })
    lockTakeOn(w1.id, 'take-2026-10-25T09-30-00-000', '2026-10-25T09:30:00.000Z')
    const w2 = (await (await buildWorld(s.id)).json()) as { id: string }
    const v = await view(s.id)
    expect(v.worldId).toBe(w2.id)
    expect(v.worlds.map((w) => w.id)).toEqual([w1.id, w2.id]) // the old set and its take stay reachable from this scene
    expect(v.facts.takes).toEqual({ [w1.id]: 1, [w2.id]: 0 })
    // the old set can be made current again; a world of another scene (or none) cannot
    expect(((await call('POST', [s.id, 'world'], { worldId: w1.id, revision: v.revision })).body as SceneView).worldId).toBe(w1.id)
    const other = await create('Other')
    expect((await call('POST', [other.id, 'world'], { worldId: w1.id, revision: other.revision })).status).toBe(400)
    await expect(lib().library.attachWorld(other.id, w1.id)).rejects.toMatchObject({ status: 409 })
  })

  it('the summary: stage reached, a thumbnail, last edited; the brief changed since the set was built (M4)', async () => {
    const s = await create('Summary')
    expect((await draft(s.id, { idea: 'a dusk chase', brief: 'A chase.', pieces: [{ onBoard: true, looks: ['/lab-assets/scene/x/c.png'], look: 0 }] }, 0)).status).toBe(200)
    expect((await view(s.id)).summary).toMatchObject({ stage: 'board', thumbnail: '/lab-assets/scene/x/c.png' })
    const w = (await (await buildWorld(s.id)).json()) as { id: string }
    // Build the set moves the draft into the world's Bible: the brief it was built from is recorded then
    const mig = await handleScene(sceneCtx({}, { publicDir: pub, configured: () => false }), 'POST', '/draft/migrate', new URLSearchParams(), { project: s.id, worldId: w.id })
    expect(mig.status).toBe(200)
    let v = await view(s.id)
    expect(v.summary.stage).toBe('set')
    expect(v.facts.briefChanged).toBe(false)
    expect(v.worlds[0].brief).toMatch(/^[0-9a-f]{16}$/)
    expect((await draft(s.id, { idea: 'a dusk chase', brief: 'A chase at night.', pieces: [] }, 1)).status).toBe(200)
    v = await view(s.id)
    expect(v.facts.briefChanged).toBe(true)
    lockTakeOn(w.id, 'take-2026-10-25T10-00-00-000', '2030-01-01T00:00:00.000Z')
    v = await view(s.id)
    expect(v.summary).toMatchObject({ stage: 'shoot', lastEdited: '2030-01-01T00:00:00.000Z' })
    const l2r = path.join(pub, ...shotPaths('take-2026-10-25T10-00-00-000').l2r.split('/'))
    mkdirSync(l2r, { recursive: true }); writeFileSync(path.join(l2r, 'l2r-1.json'), JSON.stringify({ id: 'l2r-1', status: 'done' }))
    expect((await view(s.id)).summary.stage).toBe('render')
    expect((await scenes())[0].id).toBe(s.id) // last edited first
  })
})

describe('scene isolation (m11)', () => {
  it("two scenes' drafts, worlds and takes never show in each other", async () => {
    const a = await create('A'), b = await create('B')
    await draft(a.id, { idea: 'scene A', pieces: [{ onBoard: true, looks: ['/lab-assets/scene/a/c.png'] }] }, 0)
    const wa = (await (await buildWorld(a.id)).json()) as { id: string }
    lockTakeOn(wa.id, 'take-2026-10-25T11-00-00-000', '2026-10-25T11:00:00.000Z')
    const vb = await view(b.id)
    expect(vb).toMatchObject({ worldId: null, worlds: [], facts: { setBuilt: false, takes: {} }, summary: { stage: 'brief', thumbnail: null } })
    const ctx = sceneCtx({}, { publicDir: pub, configured: () => false })
    const got = (p: string) => handleScene(ctx, 'GET', '/draft', new URLSearchParams({ project: p }), null).then((r) => (r.body as { draft: { design: { idea: string } } | null }).draft)
    expect((await got(a.id))?.design.idea).toBe('scene A')
    expect(await got(b.id)).toBeNull()
    // B's first save is its own (revision 0), and leaves A's draft as it was
    expect((await draft(b.id, { idea: 'scene B' }, 0)).status).toBe(200)
    expect((await got(a.id))?.design.idea).toBe('scene A')
    expect((await view(a.id)).facts.takes).toEqual({ [wa.id]: 1 })
    expect(JSON.parse(readFileSync(path.join(pub, 'lab-assets', 'scene', b.id, 'scene.json'), 'utf8')).worlds).toEqual([])
  })
})
