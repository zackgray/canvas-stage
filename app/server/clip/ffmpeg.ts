/**
 * ffmpeg on the dev server's PATH: encodes the lab's guide frames to the mp4 LTX loads (as E12/E15 did: 24 fps,
 * libx264 CRF 10, yuv420p), and ffprobe reads a downloaded clip's size and frame count for the provenance check.
 * Missing binaries fail with a clear 503 before anything is counted or submitted. Server-side only.
 */
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { httpError } from './request.ts'
import { CLIP_FPS, is8n1 } from './spec.ts'

const run = promisify(execFile)

export const FFMPEG_MISSING = 'ffmpeg is not installed or not on PATH: the clip step encodes the guide frames with it (and checks clips with ffprobe). ' +
  'Install ffmpeg (ffmpeg.org; it ships ffprobe), restart the dev server, and render again. Nothing was submitted.'

const missing = (e: unknown) => (e as { code?: string }).code === 'ENOENT'

/** The guide's depth frames, in order; throws (400) unless they are depth_000..depth_<n-1>.png, n = 8n+1 ≤ 121. */
export async function guideFrames(depthDir: string): Promise<string[]> {
  let names: string[]
  try { names = (await readdir(depthDir)).filter((f) => f.endsWith('.png')) } catch { throw httpError(400, 'that clip folder has no depth frames: export the guide again') }
  const want = names.map((_, i) => `depth_${String(i).padStart(3, '0')}.png`)
  if (names.sort().join() !== want.join()) throw httpError(400, 'the guide frames are not depth_000…depth_NNN.png without gaps: export the guide again')
  if (!is8n1(names.length)) throw httpError(400, `${names.length} guide frames; LTX needs 8n+1 between 9 and 121: export the guide again`)
  return want
}

/** Encode depth_NNN.png at `fps` to `out`. ENOENT (no ffmpeg) -> 503 FFMPEG_MISSING. */
export async function encodeGuide(depthDir: string, out: string, bin = 'ffmpeg'): Promise<void> {
  try {
    await run(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(CLIP_FPS), '-start_number', '0',
      '-i', path.join(depthDir, 'depth_%03d.png'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '10', '-r', String(CLIP_FPS), out],
    { windowsHide: true, timeout: 120_000 })
  } catch (e) {
    if (missing(e)) throw httpError(503, FFMPEG_MISSING)
    throw httpError(500, `ffmpeg could not encode the guide: ${String((e as { stderr?: string }).stderr || (e as Error).message).slice(0, 300)}`)
  }
}

export interface VideoFacts {
  width: number
  height: number
  frames: number
}

/** Size and decoded frame count of a video's first stream. ENOENT (no ffprobe) -> 503. */
export async function probeVideo(file: string, bin = 'ffprobe'): Promise<VideoFacts> {
  let stdout: string
  try {
    ({ stdout } = await run(bin, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames',
      '-of', 'json', file], { windowsHide: true, timeout: 120_000 }))
  } catch (e) {
    if (missing(e)) throw httpError(503, FFMPEG_MISSING)
    throw httpError(500, `ffprobe could not read the clip: ${String((e as Error).message).slice(0, 200)}`)
  }
  const s = (JSON.parse(stdout) as { streams?: { width?: number; height?: number; nb_read_frames?: string }[] }).streams?.[0]
  return { width: Number(s?.width ?? 0), height: Number(s?.height ?? 0), frames: Number(s?.nb_read_frames ?? 0) }
}
