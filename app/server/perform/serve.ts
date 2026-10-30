/**
 * Static serving for the Perform session folder (public/lab-assets/perform/), which is watch-ignored so a new session
 * never reloads the page: Vite's public-file index is kept by that watcher, so a file written after the server started
 * may not be listed. Callers check the path is inside the folder and matches its pattern first.
 */
import { createReadStream, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** An mp4 with byte ranges (what <video> asks for). */
export function serveMp4(req: IncomingMessage, res: ServerResponse, file: string) {
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

export function servePng(req: IncomingMessage, res: ServerResponse, file: string) {
  const bytes = readFileSync(file)
  res.setHeader('content-type', 'image/png')
  res.setHeader('cache-control', 'no-cache')
  res.setHeader('content-length', String(bytes.length))
  res.end(req.method === 'HEAD' ? undefined : bytes)
}
