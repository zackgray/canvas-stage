/**
 * Kit clay finish (Stage3D, wave 2). A kit world's clay is finished in the page: every frame is the true geometry rendered at
 * 1920x1088 with the E114 spike's look (ACES, exposure 1), uploaded as final_NNN.png. The server only checks the frames and
 * encodes them, exactly as experiments/e114_capture.ts did: ffmpeg libx264 crf 12, yuv420p, 24 fps. No Python, no face model.
 * The video is probed before it is called done: its frame count must be the take's (Render refuses anything else, and a clip
 * longer than the take fails on Cloud after billing). Writes clay.json (status, method 'browser') and clay-f0/-mid/-last.png
 * as the panorama path does.
 * Metric depth (appended): when every frame's metric depth (zdepth_NNN.png, 16-bit grey, 1920x1088) is beside the frames, the
 * clay records it (ClayExport.depth) and keeps it after the encode; the cameras the page sent go to cameras.json. Missing or
 * partial depth is not an error: the clay is made as before, with no depth.
 * (tidy wave) The page's phase timing lands in clay.json (ClayExport.timing) with this encode's; a set with massing pieces has its
 * massing.mp4 encoded beside clay.mp4 (two ffmpegs at once, not one after the other), and the clay is done when both are.
 */
import { execFile } from 'node:child_process'
import { copyFileSync, openSync, readSync, closeSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { CLAY_DEPTH_UNIT_M, shotPaths, type ClayCamera, type ClayDepth, type ClayExport, type ClayTiming, type TakeRecord } from '../../src/shared/shotContract.ts'
import { keyframeIndices, midFrame, type ClayIdPass } from '../../src/shared/keyframeContract.ts'
import type { ClayRunner, ClayFile } from './runner.ts'
import type { ClayStamps } from './stamps.ts'
import { CLAY_H, CLAY_W, frameFile } from './upload.ts'

const run = promisify(execFile)
type Result = { code: number; body: unknown }

/** width x height (and bit depth, colour type) from a PNG's IHDR (the first 26 bytes), or null when the file is not a PNG */
export function pngHeader(file: string): { width: number; height: number; bitDepth: number; colorType: number } | null {
  let fd: number | null = null
  try {
    fd = openSync(file, 'r')
    const b = Buffer.alloc(26)
    if (readSync(fd, b, 0, 26, 0) < 26) return null
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if (!sig.every((v, i) => b[i] === v) || b.toString('ascii', 12, 16) !== 'IHDR') return null
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bitDepth: b[24], colorType: b[25] }
  } catch { return null } finally { if (fd !== null) closeSync(fd) }
}

/** the frames whose finished PNG is missing, or is not a 1920x1088 PNG */
export function missingFinal(dir: string, frames: number): { missing: number[]; wrongSize: number[] } {
  const missing: number[] = [], wrongSize: number[] = []
  for (let i = 0; i < frames; i++) {
    const f = path.join(dir, frameFile('final', i))
    try { if (statSync(f).size < 8) { missing.push(i); continue } } catch { missing.push(i); continue }
    const h = pngHeader(f)
    if (!h || h.width !== CLAY_W || h.height !== CLAY_H) wrongSize.push(i)
  }
  return { missing, wrongSize }
}

/** The clay's metric depth when every frame has a 16-bit greyscale 1920x1088 zdepth PNG; null otherwise (none, or a partial set). */
export function depthOf(dir: string, frames: number): ClayDepth | null {
  for (let i = 0; i < frames; i++) {
    const h = pngHeader(path.join(dir, frameFile('zdepth', i)))
    if (!h || h.width !== CLAY_W || h.height !== CLAY_H || h.bitDepth !== 16 || h.colorType !== 0) return null
  }
  return { kind: 'planar', unitM: CLAY_DEPTH_UNIT_M, frames, width: CLAY_W, height: CLAY_H, pattern: 'zdepth_%03d.png' }
}

/** the clay frames that carry an ID pass: the keyframes' (first, the 8-grid mid a mid still is drawn on, last), as the browser renders them */
export const idKeyframes = keyframeIndices

/** The ID pass when the page sent a colour table and every keyframe has an 8-bit RGB 1920x1088 id PNG; null otherwise (no entities, or a partial set). */
export function idPassOf(dir: string, frames: number, colors: ClayIdPass['colors'] | undefined): ClayIdPass | null {
  if (!colors || !Object.keys(colors).length) return null
  const kf = idKeyframes(frames)
  for (const i of kf) {
    const h = pngHeader(path.join(dir, frameFile('id', i)))
    if (!h || h.width !== CLAY_W || h.height !== CLAY_H || h.bitDepth !== 8 || h.colorType !== 2) return null
  }
  return { frames: kf, pattern: 'id_%03d.png', colors }
}

/** the frames ffmpeg's packet count says the video holds (no decode: fast enough to run before calling the clay done) */
export async function countFrames(file: string, bin = 'ffprobe'): Promise<number> {
  const { stdout } = await run(bin, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,width,height', '-of', 'json', file],
    { windowsHide: true, timeout: 60_000 })
  const s = (JSON.parse(stdout) as { streams?: { nb_read_packets?: string }[] }).streams?.[0]
  return Number(s?.nb_read_packets ?? 0)
}

/** e114_capture.ts's encode, with the take's exact frame count and ffmpeg's machine-readable progress for the runner */
export function kitFfmpegArgs(dir: string, frames: number, out: string): string[] {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-framerate', '24', '-start_number', '0',
    '-i', path.join(dir, 'final_%03d.png'), '-frames:v', String(frames), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '12', '-r', '24', out]
}

/** the stills the panorama script writes with --stills: frame 0, the middle and the last frame */
export const STILL_FRAMES = (n: number) => ({ f0: 0, mid: midFrame(n), last: n - 1 })

export interface KitFinishDeps { runner: ClayRunner; publicDir: string; hasFfmpeg: () => boolean; hasFfprobe?: () => boolean; ffmpeg?: string; probe?: (file: string) => Promise<number> }

/** (tidy wave) the page's phase timing, the stamps to store (stamps.ts: what the frames were captured from), and the massing clay's encode to run beside clay.mp4's (resolves to why it failed, or null) */
export interface KitFinishExtra { timing?: ClayTiming; massing?: () => Promise<string | null>; stamps?: ClayStamps }

/** Start the massing encode now, beside clay.mp4's; it never rejects, and a failure is only logged (the precise clay stands). */
function runMassing(encode: () => Promise<string | null>, takeId: string): Promise<{ ms: number; error: string | null }> {
  const t0 = Date.now()
  return new Promise<string | null>((r) => r(encode())).catch((e: unknown) => (e instanceof Error ? e.message : String(e))).then((error) => {
    if (error) console.warn(`[clay] the massing clay of ${takeId} was not made (the precise clay is): ${error}`)
    return { ms: Date.now() - t0, error }
  })
}

/** Finish a kit take's clay. The caller checked the take is locked and nothing is running. `cameras`: the page's, when they parsed. */
export function finishKitClay(d: KitFinishDeps, rec: TakeRecord, cameras?: ClayCamera[], idColors?: ClayIdPass['colors'], extra: KitFinishExtra = {}): Result {
  const dir = path.join(d.publicDir, shotPaths(rec.id).clay)
  const { missing, wrongSize } = missingFinal(dir, rec.frames)
  if (missing.length) return { code: 400, body: { error: `${missing.length} of ${rec.frames} clay frames are not uploaded (first: ${missing[0]}): export the clay again` } }
  if (wrongSize.length) return { code: 400, body: { error: `${wrongSize.length} clay frames are not ${CLAY_W}x${CLAY_H} PNGs (first: ${wrongSize[0]}): export the clay again` } }
  if (!d.hasFfmpeg()) return { code: 503, body: { error: 'ffmpeg is not on PATH: the clay video needs it' } }
  if (!d.probe && d.hasFfprobe && !d.hasFfprobe()) return { code: 503, body: { error: 'ffprobe is not on PATH: the clay video\'s frame count needs it' } }
  const n = rec.frames
  for (const [tag, i] of Object.entries(STILL_FRAMES(n))) copyFileSync(path.join(dir, frameFile('final', i)), path.join(dir, `clay-${tag}.png`))
  const pub = `/${shotPaths(rec.id).clay}`
  const out = path.join(dir, 'clay.mp4')
  if (cameras) writeFileSync(path.join(dir, 'cameras.json'), JSON.stringify({ takeId: rec.id, width: CLAY_W, height: CLAY_H, fps: 24, frames: cameras }, null, 1))
  const depth = depthOf(dir, n)
  const base: ClayExport = { takeId: rec.id, startKey: rec.startKey, mp4: null, frames: n, width: CLAY_W, height: CLAY_H, status: 'running', method: 'browser', depth, idPass: idPassOf(dir, n, idColors), timing: { ...extra.timing }, ...extra.stamps }
  const probe = d.probe ?? ((f: string) => countFrames(f))
  const t0 = Date.now()
  let massing: Promise<{ ms: number; error: string | null }> | null = null
  // the clay is called done once both videos are: whoever reads the clay next finds the massing clay too (as when it ran first)
  const verify = async (file: ClayFile) => {
    const got = await probe(out)
    const t = (file.timing ??= {})
    t.ffmpegMs = Date.now() - t0
    if (massing) {
      const m = await massing
      t.massingFfmpegMs = m.ms
      if (m.error) t.massingError = m.error.slice(0, 300)
    }
    return got === n ? null : `the clay video holds ${got} frames, the take ${n}: export the clay again`
  }
  const f: ClayFile = d.runner.start(rec.id, base, { mp4: `${pub}/clay.mp4`, still: `${pub}/clay-f0.png` }, d.ffmpeg ?? 'ffmpeg', kitFfmpegArgs(dir, n, out), verify)
  if (extra.massing) massing = runMassing(extra.massing, rec.id)
  const { pid: _pid, log: _log, ...clay } = f
  return { code: 202, body: { clay } }
}
