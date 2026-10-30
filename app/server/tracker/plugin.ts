import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { refuseForeign } from '../guard.ts'

/**
 * Dev-only: GET/PUT /__tracker reads and writes docs/tracker.json, the project's master timeline / test / to-do
 * list. The page at /tracker.html edits it; the coding sessions edit the same file, so there is one list.
 */
export function trackerPlugin(): Plugin {
  return {
    name: 'tracker',
    apply: 'serve',
    configureServer(server) {
      const file = path.resolve(server.config.root, '..', 'docs', 'tracker.json')
      server.middlewares.use('/__tracker', (req, res) => {
        const send = (code: number, body: string, type = 'text/plain') => {
          res.statusCode = code
          res.setHeader('content-type', type)
          res.setHeader('cache-control', 'no-store')
          res.end(body)
        }
        if (req.method === 'GET') {
          readFile(file, 'utf8').then((t) => send(200, t, 'application/json'), (e) => send(500, String(e)))
          return
        }
        if (req.method !== 'PUT') return send(405, 'GET or PUT')
        const refused = refuseForeign(req, { json: true })
        if (refused) return send(refused.status, refused.message)
        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (c: Buffer) => {
          size += c.length
          if (size > 1_000_000) req.destroy()
          else chunks.push(c)
        })
        req.on('end', async () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.layers)) return send(400, 'not a tracker')
            const tmp = `${file}.tmp`
            await writeFile(tmp, JSON.stringify(data, null, 2) + '\n')
            await rename(tmp, file)
            send(200, '{"ok":true}', 'application/json')
          } catch (e) {
            send(400, String(e))
          }
        })
      })
    },
  }
}
