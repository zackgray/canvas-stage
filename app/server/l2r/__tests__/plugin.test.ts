import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ROUTES } from '../../../src/shared/shotContract.ts'
import { labL2R } from '../plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = ''
let close = () => {}
const mounts: string[] = []

beforeAll(async () => {
  const routes: [string, Handler][] = []
  const plugin = labL2R({}) as { apply: string; configureServer: (s: unknown) => void }
  expect(plugin.apply).toBe('serve')
  plugin.configureServer({ config: {}, middlewares: { use: (p: string, h: Handler) => { mounts.push(p); routes.push([p, h]) } } })
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
afterAll(() => close())

describe('l2r plugin over real HTTP', () => {
  it('mounts at its route; GET needs a take id; unknown POST routes 404; foreign POSTs 403', async () => {
    expect(mounts).toEqual([ROUTES.l2r])
    const get = await fetch(`${base}${ROUTES.l2r}`)
    expect(get.status).toBe(400)
    expect(await get.json()).toMatchObject({ code: 'bad_request' })
    const post = await fetch(`${base}${ROUTES.l2r}/x`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
    expect(post.status).toBe(404)
    expect((await fetch(`${base}${ROUTES.l2r}`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', origin: 'http://evil.example' } })).status).toBe(403)
    expect((await fetch(`${base}${ROUTES.l2r}/finish`, { method: 'POST', body: '{"renderId":"../x"}', headers: { 'content-type': 'application/json' } })).status).toBe(400)
  })
})
