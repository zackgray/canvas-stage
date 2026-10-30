/**
 * The massing clay of a locked take (recipe wave, E139 "two clays from one scene"), free: the same frames as the precise clay with
 * every generated piece swapped for its massing mesh, rendered in the page (kitExport.ts massing mode) and kept BESIDE the precise
 * clay, never over it. The precise clay keeps driving metric depth, the ID pass and the layout check; this one is
 * model-facing: the still's depth control and the Layout-To-Render video (wired by the joining track). Files:
 *   public/lab-assets/shots/<take>/clay/massing/
 *     final_NNN.png    each frame, as the precise clay's final_NNN.png (1920 x 1088 RGB)
 *     zdepth_NNN.png   each frame's metric depth (16-bit planar cm, as the precise zdepth)
 *     massing.mp4      the frames encoded exactly as the precise clay (server/clay/kit.ts kitFfmpegArgs: x264 crf 12, 24 fps)
 *     massing.json     MassingClay, written last: its existence (and its startKey) is what makes the massing clay current
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { promisify } from 'node:util'
import { shotPaths, type ClayDepth } from '../../src/shared/shotContract.ts'
import { countFrames, depthOf, kitFfmpegArgs, missingFinal } from '../clay/kit.ts'
import { frameFile, streamUpload } from '../clay/upload.ts'
import { readTake } from '../takes/store.ts'

export interface MassingClay {
  takeId: string; startKey: string; frames: number
  /** public URLs */
  mp4: string; dir: string
  depth: ClayDepth | null
  finishedAt: string
}

export const massingDir = (publicDir: string, takeId: string) => path.join(publicDir, shotPaths(takeId).clay, 'massing')
const massingUrl = (takeId: string) => `/${shotPaths(takeId).clay}/massing`

export interface EncodeDeps {
  /** runs ffmpeg with these args (tests fake it) */
  ffmpeg?: (args: string[]) => Promise<void>
  probe?: (file: string) => Promise<number>
  now?: () => Date
}
const run = promisify(execFile)
const realFfmpeg = async (args: string[]) => { await run('ffmpeg', args, { windowsHide: true, timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024 }) }

/** POST ?take=&frame=&kind=final|zdepth: one massing frame, streamed to disk (400 for anything else, 404 not a locked take) */
export async function uploadMassingFrame(publicDir: string, req: IncomingMessage, res: ServerResponse, q: URLSearchParams): Promise<[number, string] | null> {
  const take = q.get('take') ?? '', rec = readTake(publicDir, take)
  if (!rec) return [404, `no locked take ${JSON.stringify(take.slice(0, 80))}`]
  const kind = q.get('kind')
  if (kind !== 'final' && kind !== 'zdepth') return [400, 'kind must be final or zdepth']
  const fs = q.get('frame') ?? '', frame = /^\d{1,4}$/.test(fs) ? Number(fs) : -1
  if (frame < 0 || frame >= rec.frames) return [400, `frame must be 0 to ${rec.frames - 1}`]
  await streamUpload(req, res, { take, frame, kind, file: path.join(massingDir(publicDir, take), frameFile(kind, frame)) })
  return null
}

/** Encode the uploaded frames and write massing.json; [status, why] when it cannot. */
export async function finishMassingClay(publicDir: string, takeId: unknown, d: EncodeDeps = {}): Promise<MassingClay | [number, string]> {
  const rec = typeof takeId === 'string' ? readTake(publicDir, takeId) : null
  if (!rec) return [404, 'no such locked take']
  const dir = massingDir(publicDir, rec.id)
  const { missing, wrongSize } = missingFinal(dir, rec.frames)
  if (missing.length || wrongSize.length) return [400, `${missing.length + wrongSize.length} of ${rec.frames} massing frames are missing or the wrong size: prepare the frames again`]
  const out = path.join(dir, 'massing.mp4')
  try {
    await (d.ffmpeg ?? realFfmpeg)(kitFfmpegArgs(dir, rec.frames, out))
    const got = await (d.probe ?? ((f: string) => countFrames(f)))(out)
    if (got !== rec.frames) return [500, `the massing video holds ${got} frames, the take ${rec.frames}`]
  } catch (e) {
    return [503, `the massing video did not encode (ffmpeg and ffprobe must be on PATH): ${String(e instanceof Error ? e.message : e).slice(-200)}`]
  }
  const m: MassingClay = {
    takeId: rec.id, startKey: rec.startKey, frames: rec.frames, mp4: `${massingUrl(rec.id)}/massing.mp4`, dir: massingUrl(rec.id),
    depth: depthOf(dir, rec.frames), finishedAt: (d.now ?? (() => new Date()))().toISOString(),
  }
  writeFileSync(path.join(dir, 'massing.json'), JSON.stringify(m, null, 1) + '\n') // last
  return m
}

/** the take's massing clay, or null (none yet, or made for an earlier start of the take) */
export function readMassingClay(publicDir: string, takeId: string): MassingClay | null {
  const rec = readTake(publicDir, takeId), f = path.join(massingDir(publicDir, takeId), 'massing.json')
  if (!rec || !existsSync(f)) return null
  try { const m = JSON.parse(readFileSync(f, 'utf8')) as MassingClay; return m.startKey === rec.startKey ? m : null } catch { return null }
}
