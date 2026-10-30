/**
 * POST /__lab/clay/depth?take=&frame=&kind=colour|depth|bg|final: one capture pass of one clay frame, streamed to disk (a 1920x1088
 * Float32 depth is 8.4 MB, far past the shared JSON reader's 64 KB). Written as shots/<take>/clay/colour_NNN.png,
 * depth_NNN.f32, bg_NNN.f32 or (a kit world's finished frame and its metric depth) final_NNN.png / zdepth_NNN.png through a .part file, renamed only when the whole body arrived. Refused: a take that is not
 * locked (404), a frame outside the take, a kind that is not one of the three, a depth that is not exactly 1920x1088 Float32
 * (400), a body over 64 MB (413), and any upload while that take's clay is shading (409).
 */
import { createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { shotPaths, type ClayFrameKind } from '../../src/shared/shotContract.ts'
import { send } from '../crossview/http.ts'
import { readTake } from '../takes/store.ts'

export const CLAY_W = 1920
export const CLAY_H = 1088
export const UPLOAD_LIMIT = 64 * 1024 * 1024
export const DEPTH_BYTES = CLAY_W * CLAY_H * 4
const KINDS: ClayFrameKind[] = ['colour', 'depth', 'bg', 'final', 'zdepth', 'id']
/** the PNG kinds: colour (shaded later by Python), final (a kit world's finished clay frame, encoded as it is) and zdepth (a kit
 *  frame's metric depth, 16-bit grey, kept beside the clay: the hero still's depth control) and id (a keyframe's flat-colour ID pass, kept beside it) */
export const isPngKind = (kind: ClayFrameKind) => kind === 'colour' || kind === 'final' || kind === 'zdepth' || kind === 'id'

export const frameFile = (kind: ClayFrameKind, frame: number) =>
  `${kind}_${String(frame).padStart(3, '0')}.${isPngKind(kind) ? 'png' : 'f32'}`

export interface UploadTarget { take: string; frame: number; kind: ClayFrameKind; file: string }

/** -> where the pass goes, or [status, why] */
export function uploadTarget(publicDir: string, params: URLSearchParams): UploadTarget | [number, string] {
  const take = params.get('take') ?? ''
  const rec = readTake(publicDir, take)
  if (!rec) return [404, `no locked take ${JSON.stringify(take.slice(0, 80))}`]
  const kind = params.get('kind') as ClayFrameKind
  if (!KINDS.includes(kind)) return [400, 'kind must be colour, depth, bg, final, zdepth or id']
  const fs = params.get('frame') ?? ''
  const frame = /^\d{1,4}$/.test(fs) ? Number(fs) : -1
  if (frame < 0 || frame >= rec.frames) return [400, `frame must be 0 to ${rec.frames - 1}`]
  const dir = path.resolve(publicDir, shotPaths(take).clay)
  return { take, frame, kind, file: path.join(dir, frameFile(kind, frame)) }
}

/** Stream the body to the target; answers the response itself. */
export function streamUpload(req: IncomingMessage, res: ServerResponse, t: UploadTarget, limit = UPLOAD_LIMIT): Promise<void> {
  return new Promise((resolve) => {
    const declared = Number(req.headers['content-length'] ?? NaN)
    if (declared > limit) {
      // answer now and drain the body (closing mid-send would reset the page's request instead of showing it the 413)
      send(res, 413, { error: `body over ${limit} bytes` })
      req.resume()
      return resolve()
    }
    mkdirSync(path.dirname(t.file), { recursive: true })
    const part = `${t.file}.part`
    const out = createWriteStream(part)
    let size = 0
    let failed = false
    const fail = (code: number, msg: string) => {
      if (failed) return
      failed = true
      req.unpipe(out)
      const drop = () => { try { rmSync(part, { force: true }) } catch { /* best effort */ } }
      if (out.closed) drop(); else { out.once('close', drop); out.destroy() }
      if (!res.headersSent) send(res, code, { error: msg })
      req.resume() // drain what is still coming; nothing more is written
      resolve()
    }
    req.on('data', (c: Buffer) => { size += c.length; if (size > limit) fail(413, `body over ${limit} bytes`) })
    req.on('error', () => fail(400, 'upload broke off'))
    req.on('aborted', () => fail(400, 'upload broke off'))
    out.on('error', (e) => fail(500, e.message))
    out.on('finish', () => {
      if (failed) return
      if (!isPngKind(t.kind) && size !== DEPTH_BYTES) return fail(400, `a depth pass is ${DEPTH_BYTES} bytes (${CLAY_W}x${CLAY_H} Float32), got ${size}`)
      if (isPngKind(t.kind) && size < 8) return fail(400, `empty ${t.kind} pass`)
      try { renameSync(part, t.file) } catch (e) { return fail(500, (e as Error).message) }
      send(res, 200, { ok: true, frame: t.frame, kind: t.kind, bytes: size })
      resolve()
    })
    req.pipe(out)
  })
}
