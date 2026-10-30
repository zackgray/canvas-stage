import { writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { labCut } from '../plugin.ts'
import { DRAFT_A, FINISHED_B, PACK, rig } from './rig.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void
let base = ''
let close = () => {}
let release = () => {}
let ffmpeg = true
const calls: string[][] = []

beforeAll(async () => {
  const { publicDir, probe } = rig()
  const gate = new Promise<void>((r) => { release = r })
  const routes: [string, Handler][] = []
  const plugin = labCut({ probe, ffmpegOk: async () => ffmpeg, run: async (a) => { calls.push(a); await gate; writeFileSync(a[a.length - 1], 'mp4data') } }) as { configureServer: (s: unknown) => void }
  plugin.configureServer({ config: { root: publicDir, publicDir }, middlewares: { use: (p: string, h: Handler) => routes.push([p, h]) } })
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

const JSON_H = { 'content-type': 'application/json' }
const BODY = { packId: PACK, segments: [{ takeId: DRAFT_A, in: 12, out: 40 }, { takeId: FINISHED_B, in: 40, out: 70 }] }
const post = (body: unknown, headers: Record<string, string> = JSON_H) => fetch(`${base}/__lab/cut`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers })

describe('Cut endpoint', () => {
  it('guards: foreign pages 403, non-JSON 415, bad bodies 400, wrong verbs 405, unknown routes 404; nothing runs', async () => {
    expect((await post(BODY, { ...JSON_H, origin: 'http://evil.example' })).status).toBe(403)
    expect((await post(BODY, { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await post('{')).status).toBe(400)
    expect((await post({ packId: PACK, segments: [{ takeId: '../../etc/passwd', in: 0, out: 5 }] })).status).toBe(400)
    expect((await post({ packId: '../x', segments: BODY.segments })).status).toBe(400)
    expect((await fetch(`${base}/__lab/cut`, { method: 'DELETE' })).status).toBe(405)
    expect((await fetch(`${base}/__lab/cut/other`)).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('lists takes, refuses with no ffmpeg, then exports once: 202, 409 while running, status and the file after', async () => {
    const t = await (await fetch(`${base}/__lab/cut/takes`)).json()
    expect(t.ffmpeg).toBe(true)
    expect(t.performances.find((p: { packId: string }) => p.packId === PACK).takes).toHaveLength(4)
    ffmpeg = false
    expect((await post(BODY)).status).toBe(503)
    ffmpeg = true
    expect(await (await fetch(`${base}/__lab/cut/status`)).json()).toEqual({ state: 'idle' })

    const first = await post(BODY)
    expect(first.status).toBe(202)
    const { id } = await first.json()
    expect((await post(BODY)).status).toBe(409)
    expect(await (await fetch(`${base}/__lab/cut/status`)).json()).toMatchObject({ state: 'running', id })
    release()
    for (let i = 0; i < 50; i++) { if ((await (await fetch(`${base}/__lab/cut/status`)).json()).state === 'done') break; await new Promise((r) => setTimeout(r, 20)) }
    const s = await (await fetch(`${base}/__lab/cut/status`)).json()
    expect(s).toMatchObject({ state: 'done', output: `/lab-assets/cuts/${PACK}/${id}.mp4` })
    expect(calls).toHaveLength(1)
  })
})
