/**
 * Static serving for public/lab-assets/shots/ (locked takes, clay, hero stills, Layout-To-Render renders). The folder is
 * watch-ignored so writes never reload the page, which also means Vite's public-file index never learns about files written
 * after the server started and answers them with index.html (the broken hero-still thumbnail, 2026-10-23). Same fix as
 * server/perform/serve.ts: serve the folder from disk. Paths must stay inside shots/ and be a png, mp4 or json.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { serveMp4, servePng } from '../perform/serve.ts'

const SAFE = /^\/[\w.-]+(?:\/[\w.-]+){0,4}\.(png|mp4|json)$/

/** Serves `/lab-assets/shots<url>`; false when the request is not one it should answer (the caller falls through). */
export function serveShot(req: IncomingMessage, res: ServerResponse, publicDir: string, url: string): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  let rel: string
  try { rel = decodeURIComponent(url.split('?')[0]) } catch { return false }
  const m = SAFE.exec(rel)
  if (!m || rel.includes('..')) return false
  const root = path.join(publicDir, 'lab-assets', 'shots')
  const file = path.join(root, rel)
  if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) return false
  if (m[1] === 'mp4') serveMp4(req, res, file)
  else if (m[1] === 'png') servePng(req, res, file)
  else {
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-cache')
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file, 'utf8'))
  }
  return true
}
