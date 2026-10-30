// The sky-look route (layout wave L5): POST /__lab/stage3d/sky sets the plan's sky look — the same field the planner writes, so
// the drawn sky dome follows it. Free, additive, one route: it applies the look, refuses an unknown one (400, the piece route's
// plain-word style), and is a set change like any other — the plan re-hashes, the set-changed stamp moves and the free set
// approval reads stale until it is approved again. Temp public dir; nothing here spends.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { SET_CHANGED } from '../../../src/shared/setApproval.ts'
import { approveSetOnDisk } from '../../bible/__tests__/approveFixture.ts'
import { setRefusalFor } from '../../bible/setGate.ts'
import { labStage3D, STAGE3D_ROUTE } from '../plugin.ts'
import type { KitWorld } from '../types.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = '', pub = '', close = () => {}
const loc = () => path.join(pub, 'lab-assets', 'locations')

beforeAll(async () => {
  pub = path.join(mkdtempSync(path.join(tmpdir(), 'stage3d-sky-')), 'public')
  let handler: Handler | null = null
  const plugin = labStage3D({}, { publicDir: pub }) as unknown as { configureServer: (s: unknown) => void }
  plugin.configureServer({ middlewares: { use: (p: string, h: Handler) => { expect(p).toBe(STAGE3D_ROUTE); handler = h } } })
  const server = createServer((req, res) => {
    if (!req.url!.startsWith(STAGE3D_ROUTE)) { res.statusCode = 404; return res.end() }
    req.url = req.url!.slice(STAGE3D_ROUTE.length) || '/'
    handler!(req, res, () => { res.statusCode = 404; res.end() })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${STAGE3D_ROUTE}`
  close = () => server.close()
})
afterAll(() => { close(); rmSync(path.dirname(pub), { recursive: true, force: true }) })

const post = (route: string, body: unknown) =>
  fetch(`${base}${route}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

let world: KitWorld
const meta = () => JSON.parse(readFileSync(path.join(loc(), world.id, 'meta.json'), 'utf8')) as { kit: { setChangedAt?: string } }
const onDisk = () => JSON.parse(readFileSync(path.join(loc(), world.id, 'plan.json'), 'utf8')) as KitWorld['plan']

describe('the sky-look route (free)', () => {
  it('applies a look: the plan\'s sky.look is the one the planner writes, stamped and re-hashed like any set change', async () => {
    world = await (await post('/world', { plan: BATTLEFIELD, description: 'sky test' })).json() as KitWorld
    expect(world.plan.sky.look).toBeUndefined()
    const r = await post(`/sky?id=${world.id}`, { look: 'dusk' })
    expect(r.status).toBe(200)
    const w = await r.json() as KitWorld
    expect(w.plan.sky).toEqual({ ...BATTLEFIELD.sky, look: 'dusk' }) // the sky's own words stay; only the look moves
    expect(onDisk().sky.look).toBe('dusk')
    expect(typeof meta().kit.setChangedAt).toBe('string') // the set changed: the master's depth is dropped with it
    // a second look applies the same way
    expect((await post(`/sky?id=${world.id}`, { look: 'fog' })).status).toBe(200)
    expect(onDisk().sky.look).toBe('fog')
  })

  it('refuses an unknown look (400, plain words) and writes nothing', async () => {
    const r = await post(`/sky?id=${world.id}`, { look: 'rainbow' })
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: string }).error).toMatch(/^look must be one of /)
    expect(onDisk().sky.look).toBe('fog')
    expect((await post(`/sky?id=${world.id}`, { look: 7 })).status).toBe(400)
    expect((await post(`/sky?id=${world.id}`)).status).toBe(400)
  })

  it('the set approval goes stale at the new key, exactly as for a moved piece; approving again clears it', async () => {
    approveSetOnDisk(pub, world.id) // approved at the current key (fog)
    expect(setRefusalFor(pub, world.id)).toBeNull()
    await post(`/sky?id=${world.id}`, { look: 'dawn' })
    expect(onDisk().sky.look).toBe('dawn')
    expect(setRefusalFor(pub, world.id)).toBe(SET_CHANGED) // the look is part of the plan the key hashes
    approveSetOnDisk(pub, world.id) // free: approve the set as it now stands
    expect(setRefusalFor(pub, world.id)).toBeNull()
  })
})
