// The whole-set route (New take, owner 10-29): POST /__lab/stage3d/plan makes the scene's set a locked take's own set. It goes
// through KitStore.changePlan like every set write, so the takes still on the scene's set adopt it before plan.json is written, a
// take that holds its own set is never written (byte for byte), plan.built.json is never touched, the plan is parsed and then hashed
// (the set key of plan.json is the key of the set sent), and an invalid plan writes nothing. Temp public dir; nothing here spends.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { shotPaths } from '../../../src/shared/shotContract.ts'
import { onDisk, putTake } from '../../takes/__tests__/takePerfFixture.ts'
import { labStage3D, STAGE3D_ROUTE } from '../plugin.ts'
import type { KitWorld } from '../types.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = '', pub = '', close = () => {}
const loc = (id: string, f: string) => path.join(pub, 'lab-assets', 'locations', id, f)

beforeAll(async () => {
  pub = path.join(mkdtempSync(path.join(tmpdir(), 'stage3d-plan-')), 'public')
  let handler: Handler | null = null
  const plugin = labStage3D({}, { publicDir: pub }) as unknown as { configureServer: (s: unknown) => void }
  plugin.configureServer({ middlewares: { use: (_p: string, h: Handler) => { handler = h } } })
  const server = createServer((req, res) => {
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
const bytes = (file: string) => readFileSync(file, 'utf8')

describe('the whole-set route (free)', () => {
  it('writes the set sent through changePlan: the takes on the old set adopt it first, a take with its own set is untouched', async () => {
    const base0 = PLANS['open-field-day']
    const world = await (await post('/world', { plan: base0, description: 'plan route' })).json() as KitWorld
    const scene0 = world.plan, key0 = setKeyOf(scene0)!
    const other = { ...scene0, seed: scene0.seed + 7, kit: scene0.kit.slice(1) } // the shown take's own set
    const onOld = putTake(pub, { worldId: world.id, packId: null, setKey: key0 }) // on the scene's set, no copy yet
    const own = putTake(pub, { worldId: world.id, packId: null, setKey: setKeyOf(other)!, set: other, setFrom: 'lock', setSince: null })
    const ownBytes = bytes(path.join(pub, shotPaths(own.id).take))
    const built = bytes(loc(world.id, 'plan.built.json'))

    const r = await post(`/plan?id=${world.id}`, other)
    expect(r.status).toBe(200)
    const w = await r.json() as KitWorld
    expect(setKeyOf(w.plan)).toBe(setKeyOf(other)) // parsed, then hashed: the scene's set is the take's set, key for key
    expect(setKeyOf(JSON.parse(bytes(loc(world.id, 'plan.json'))))).toBe(own.setKey)
    expect(onDisk(pub, onOld.id)).toMatchObject({ set: scene0, setFrom: 'adopted' }) // adopted before the write: it keeps the old set
    expect(bytes(path.join(pub, shotPaths(own.id).take))).toBe(ownBytes) // a take's own set is never written
    expect(bytes(loc(world.id, 'plan.built.json'))).toBe(built) // Reset the set still goes back to the build
    expect(typeof (JSON.parse(bytes(loc(world.id, 'meta.json'))) as { kit: { setChangedAt?: string } }).kit.setChangedAt).toBe('string')
  })

  it('refuses a plan that does not parse (422) or a body that is no plan (400), and writes nothing', async () => {
    const world = await (await post('/world', { plan: PLANS['open-field-day'], description: 'plan refused' })).json() as KitWorld
    const before = bytes(loc(world.id, 'plan.json'))
    expect((await post(`/plan?id=${world.id}`, { ...world.plan, kit: 'nope' })).status).toBe(422)
    expect((await post(`/plan?id=${world.id}`, [1, 2])).status).toBe(400)
    expect(bytes(loc(world.id, 'plan.json'))).toBe(before)
  })
})
