/**
 * Dev-only Vite middleware for the Cut (free: local ffmpeg, no Cloud). Takes of one performance share its clock, so a
 * cut is a list of segments {takeId, in, out} on that clock, contiguous.
 *   GET  /__lab/cut/takes    -> {ffmpeg, performances: [{packId, takes[]}], cuts[]}  (every render on disk, drafts,
 *                               1920 finals and finished takes; exports so far)
 *   POST /__lab/cut          {packId, segments[], audio?} -> 202 CutStatus (400 invalid cut, 404 no takes for the pack, 409 while
 *                               one exports, 503 with no ffmpeg; nothing is written in any of those)
 *   GET  /__lab/cut/status   -> CutStatus read from disk (survives refresh and restart)
 *   GET  /lab-assets/cuts/<pack>/cut-<stamp>.mp4   the exported sequence, byte ranges
 * Exports never overwrite: public/lab-assets/cuts/<packId>/cut-<stamp>.mp4 + .json (the segment list). Local pages only.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { refuseForeign } from '../guard.ts'
import { CutError, CutJob, type CutDeps } from './job.ts'
import { ffmpegAvailable, listPerformances } from './takes.ts'
import { parseCutRequest } from './request.ts'

function send(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { reject(new CutError(413, 'body too large')); req.destroy() } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function serveMp4(req: IncomingMessage, res: ServerResponse, file: string) {
  const size = statSync(file).size
  res.setHeader('content-type', 'video/mp4')
  res.setHeader('accept-ranges', 'bytes')
  res.setHeader('cache-control', 'no-cache')
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
  let start = 0
  let end = size - 1
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start > end || start >= size) { res.statusCode = 416; res.setHeader('content-range', `bytes */${size}`); return res.end() }
    res.statusCode = 206
    res.setHeader('content-range', `bytes ${start}-${end}/${size}`)
  }
  res.setHeader('content-length', String(end - start + 1))
  if (req.method === 'HEAD') return res.end()
  createReadStream(file, { start, end }).on('error', () => { res.statusCode = 500; res.end() }).pipe(res)
}

/** `deps` is for tests (fake ffmpeg, fake probe); the dev server uses the real ones. */
export function labCut(deps: CutDeps = {}): Plugin {
  return {
    name: 'lab-cut',
    apply: 'serve',
    configureServer(server) {
      const publicDir = server.config.publicDir || path.join(server.config.root, 'public')
      const rendersDir = path.join(publicDir, 'lab-assets', 'renders')
      const cutsDir = path.join(publicDir, 'lab-assets', 'cuts')
      const job = new CutJob(publicDir, deps)

      server.middlewares.use('/lab-assets/cuts', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const rel = decodeURIComponent(new URL(req.url ?? '', 'http://lab').pathname).replace(/^\/+/, '')
        const file = path.resolve(cutsDir, rel)
        if (!/^[\w-]+\/cut-[\w-]+\.mp4$/.test(rel) || !file.startsWith(cutsDir + path.sep) || !existsSync(file)) return next()
        serveMp4(req, res, file)
      })

      server.middlewares.use('/__lab/cut', async (req, res) => {
        const route = new URL(req.url ?? '', 'http://lab').pathname.replace(/\/+$/, '') || '/'
        const fail = (e: unknown) => send(res, e instanceof CutError ? e.status : 500, { error: e instanceof Error ? e.message : String(e) })
        try {
          if (req.method === 'GET' && route === '/status') return send(res, 200, job.status())
          if (req.method === 'GET' && route === '/takes') {
            const ffmpeg = await (deps.ffmpegOk ?? (() => ffmpegAvailable()))()
            return send(res, 200, { ffmpeg, performances: await listPerformances(rendersDir, deps.probe), cuts: job.cuts() })
          }
          if (route !== '/') return send(res, 404, { error: 'no such route' })
          if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
          const refused = refuseForeign(req, { json: true })
          if (refused) return send(res, refused.status, { error: refused.message })
          let body
          try { body = parseCutRequest(JSON.parse(await readBody(req))) } catch (e) { return fail(e instanceof CutError ? e : new CutError(400, 'body is not a cut request')) }
          return send(res, 202, (await job.start(body.packId, body.segments, body.audio)).status)
        } catch (e) {
          if (!res.headersSent) fail(e)
        }
      })
    },
  }
}
