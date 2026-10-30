/** Shared rig for the labMotion tests: a temp project root with the shipped lift clip, and the cut-test mount shim. */
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Plugin } from 'vite'

export const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/mocap/kimodo')

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/** a temp project root with public/mocap/kimodo copied in, so the fake box can serve the shipped lift clip. */
export function tempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'lab-motion-'))
  cpSync(FIXTURES, path.join(root, 'public/mocap/kimodo'), { recursive: true })
  return root
}

/** mounts a plugin's configureServer on a plain http server, the way the other plugin tests do. */
export async function mount(plugin: Plugin, root: string): Promise<{ base: string; close: () => Promise<void> }> {
  const routes: [string, Handler][] = []
  ;(plugin as unknown as { configureServer: (s: unknown) => void }).configureServer({
    config: { root, publicDir: path.join(root, 'public') },
    middlewares: { use: (p: string, h: Handler) => routes.push([p, h]) },
  })
  const server = createServer((req, res) => {
    const hit = routes.find(([p]) => req.url === p || req.url!.startsWith(p + '/') || req.url!.startsWith(p + '?'))
    if (!hit) { res.statusCode = 404; return res.end() }
    req.url = req.url!.slice(hit[0].length) || '/'
    hit[1](req, res, () => { res.statusCode = 404; res.end() })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/__lab/motion`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

/** a minimal takeOut MoveSpec (Track C's shape), as the panel would send it. */
export const SPEC = {
  class: 'takeOut',
  sentence: 'A person stands still, then bends at the waist and reaches into a box in front of them with both hands, slowly lifts out a flat frame, and holds it up in front of their face.',
  seconds: 8,
  grab: 2.5,
  hold: [4.5, 7.95],
  phases: [{ from: 0, words: 'standing at the hive, both hands empty' }],
  prop: { kind: 'frame', width: 0.43, rimOrTop: 0.7, front: 0.36, side: 0 },
}

export function postJson(base: string, route: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${route}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } })
}

export async function pollJob(base: string, pred: (j: Record<string, unknown>) => boolean, ms = 5000): Promise<Record<string, unknown>> {
  const t0 = Date.now()
  for (;;) {
    const j = await (await fetch(`${base}/job`)).json() as Record<string, unknown>
    if (pred(j)) return j
    if (Date.now() - t0 > ms) throw new Error('timed out polling /job')
    await new Promise((r) => setTimeout(r, 15))
  }
}
