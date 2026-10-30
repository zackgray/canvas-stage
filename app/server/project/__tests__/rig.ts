// The project middleware mounted over a temp public dir, driven with in-memory requests (no sockets).
import { mkdtempSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { labProject } from '../plugin.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>
export const JSON_LOCAL = { 'content-type': 'application/json', origin: 'http://localhost:5173' }

export function mount(publicDir = path.join(mkdtempSync(path.join(tmpdir(), 'project-plugin-')), 'public')) {
  const routes: Record<string, Handler> = {}
  const plugin = labProject({ now: () => '2026-10-18T12:00:00.000Z' })
  const server = { config: { root: path.dirname(publicDir), publicDir }, middlewares: { use: (p: string, h: Handler) => { routes[p] = h } } }
  ;(plugin.configureServer as (s: unknown) => void)(server)
  return { h: routes['/__lab/project'], publicDir, plugin }
}

export async function call(h: Handler, url: string, o: { method?: string; headers?: Record<string, string>; body?: string | Buffer } = {}) {
  const chunks = o.body === undefined ? [] : [Buffer.isBuffer(o.body) ? o.body : Buffer.from(o.body)]
  const req = Object.assign(Readable.from(chunks), { url, method: o.method ?? 'GET', headers: o.headers ?? {} })
  let status = 200, body = ''
  const headers: Record<string, string> = {}
  await new Promise<void>((done) => {
    const res = {
      headersSent: false,
      set statusCode(c: number) { status = c }, get statusCode() { return status },
      setHeader: (k: string, v: string) => { headers[k] = v },
      end: (b?: string) => { body = b ?? ''; done() },
    }
    void Promise.resolve(h(req as unknown as IncomingMessage, res as unknown as ServerResponse, done))
  })
  return { status, body: body && headers['content-type'] === 'application/json' ? JSON.parse(body) : body }
}

export const post = (h: Handler, url: string, body: unknown, headers: Record<string, string> = JSON_LOCAL) =>
  call(h, url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
