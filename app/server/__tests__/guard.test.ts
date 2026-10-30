import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { Plugin } from 'vite'
import { describe, expect, it } from 'vitest'
import { labSave } from '../../vite.config.ts'
import { refuseForeign } from '../guard.ts'
import { labCast } from '../cast/plugin.ts'
import { trackerPlugin } from '../tracker/plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/** Runs a plugin's configureServer against a fake server and returns its middlewares by mount path. */
function mount(plugin: Plugin, root: string): Record<string, Handler> {
  const handlers: Record<string, Handler> = {}
  const server = { config: { root, publicDir: path.join(root, 'public') }, middlewares: { use: (p: string, h: Handler) => { handlers[p] = h } } }
  ;(plugin.configureServer as (s: unknown) => void)(server)
  return handlers
}

function call(h: Handler, method: string, headers: Record<string, string>, body: string | Buffer = '', url = '/') {
  const req = Object.assign(Readable.from(body.length ? [Buffer.from(body)] : []), { method, url, headers }) as unknown as IncomingMessage
  return new Promise<{ status: number; body: string }>((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(b?: string) { resolve({ status: this.statusCode, body: String(b ?? '') }) },
    }
    h(req, res as unknown as ServerResponse, () => resolve({ status: 404, body: 'next' }))
  })
}

const JSON_TYPE = { 'content-type': 'application/json' }
const SAME = { origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' }
const EVIL = { origin: 'https://evil.example' }
const CROSS = { 'sec-fetch-site': 'cross-site' }
const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage

describe('refuseForeign', () => {
  it('passes local origins, no origin (curl), and same-site fetch metadata', () => {
    for (const h of [{}, SAME, { origin: 'http://127.0.0.1:5189' }, { origin: 'http://localhost' }, { 'sec-fetch-site': 'same-site' }] as Record<string, string>[]) {
      expect(refuseForeign(req(h)), JSON.stringify(h)).toBeNull()
    }
  })
  it('refuses a foreign or null Origin, a rebound hostname, and Sec-Fetch-Site cross-site with 403', () => {
    for (const h of [EVIL, { origin: 'null' }, { origin: 'http://evil.example:5173' }, { origin: 'http://localhost.evil.example' }, CROSS] as Record<string, string>[]) {
      expect(refuseForeign(req(h))?.status, JSON.stringify(h)).toBe(403)
    }
  })
  it('on JSON endpoints, refuses anything but application/json with 415', () => {
    for (const t of [undefined, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      expect(refuseForeign(req(t ? { ...SAME, 'content-type': t } : SAME), { json: true })?.status).toBe(415)
    }
    expect(refuseForeign(req({ ...SAME, 'content-type': 'application/json; charset=utf-8' }), { json: true })).toBeNull()
  })
})

describe('spend / write endpoints refuse cross-origin requests before doing anything', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'guard-'))
  const cast = mount(labCast({}), root)['/__lab/cast']
  const save = mount(labSave(), root)['/__lab/save']
  const body = '{"cardId":"c1","description":"a tall man"}'

  it('/__lab/cast/candidates (paid): foreign Origin / cross-site / text/plain refused; same-origin JSON reaches validation', async () => {
    const url = '/candidates'
    expect((await call(cast, 'POST', { ...EVIL, ...JSON_TYPE }, body, url)).status).toBe(403)
    expect((await call(cast, 'POST', { ...CROSS, ...JSON_TYPE }, body, url)).status).toBe(403)
    expect((await call(cast, 'POST', { ...SAME, 'content-type': 'text/plain' }, body, url)).status).toBe(415)
    // same-origin, right type, invalid body: refused by request validation (400), not by the guard
    expect((await call(cast, 'POST', { ...SAME, ...JSON_TYPE }, '{"cardId":"../x"}', url)).status).toBe(400)
  })

  it('/__lab/save: foreign requests write nothing; same-origin binary upload (no content-type) writes; oversize is 413', async () => {
    const file = path.join(root, 'public', 'lab-assets', 'renders', 'view-x', 'a.png')
    expect((await call(save, 'POST', EVIL, 'pwn', '/?path=view-x/a.png')).status).toBe(403)
    expect((await call(save, 'POST', CROSS, 'pwn', '/?path=view-x/a.png')).status).toBe(403)
    expect(existsSync(file)).toBe(false)
    expect((await call(save, 'POST', SAME, 'png-bytes', '/?path=view-x/a.png')).status).toBe(200)
    expect(readFileSync(file, 'utf8')).toBe('png-bytes')
    expect((await call(save, 'POST', SAME, Buffer.alloc(64 * 1024 * 1024 + 1), '/?path=view-x/big.png')).status).toBe(413)
    expect(existsSync(path.join(path.dirname(file), 'big.png'))).toBe(false)
  })

  it('/__tracker: PUT needs a local origin and application/json', async () => {
    const proj = mkdtempSync(path.join(tmpdir(), 'guard-tracker-'))
    mkdirSync(path.join(proj, 'docs'))
    mkdirSync(path.join(proj, 'app'))
    const trackerFile = path.join(proj, 'docs', 'tracker.json')
    writeFileSync(trackerFile, '{"tasks":[],"layers":[]}')
    const tracker = mount(trackerPlugin(), path.join(proj, 'app'))['/__tracker']
    const doc = '{"tasks":[1],"layers":[]}'
    expect((await call(tracker, 'PUT', { ...EVIL, ...JSON_TYPE }, doc)).status).toBe(403)
    expect((await call(tracker, 'PUT', SAME, doc)).status).toBe(415)
    expect(readFileSync(trackerFile, 'utf8')).toBe('{"tasks":[],"layers":[]}')
    expect((await call(tracker, 'PUT', { ...SAME, ...JSON_TYPE }, doc)).status).toBe(200)
  })
})
