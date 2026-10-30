/**
 * The black-render guard (QA run 5): a paid render once came back as a 97-frame video of solid black (every pixel at the video
 * black level, raw 44 KB) and the app listed it as Rendered. After download the raw is sampled at a few frames; when no pixel of
 * any sampled frame rises above near-black, the render is filed as failed (kept on disk, billed, never offered for the finish)
 * and the owner is told in plain words. A real night scene has highlights (a lamp, a window, a fire), so the test is the
 * brightest pixel, not the average. A tool failure answers "not blank": the guard never stops a good render.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** the brightest luma (0..255, limited range: black is 16) a sampled frame may reach and still count as black */
export const BLANK_MAX_LUMA = 24
/** how many frames are sampled, evenly across the clip */
const SAMPLES = 5

/** the line the owner sees (the server's error and the render record's) */
export const blankLine = (credits: number): string =>
  `The render came back black. Nothing usable was saved. You were billed ${Math.round(credits * 10) / 10} cr.`

/** the per-frame brightest luma of the sampled frames, from ffmpeg's signalstats; [] when ffmpeg cannot read the file */
export async function sampledMaxLuma(file: string, frames: number, bin = 'ffmpeg'): Promise<number[]> {
  const step = Math.max(1, Math.floor(frames / SAMPLES))
  try {
    const { stdout, stderr } = await run(bin, ['-hide_banner', '-v', 'info', '-i', file, '-an', '-vf',
      `select=not(mod(n\\,${step})),signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=-`, '-f', 'null', '-'],
    { windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
    return [...`${stdout}\n${stderr}`.matchAll(/YMAX=([\d.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite)
  } catch {
    return []
  }
}

/** true when every sampled frame is black (and at least one frame was read) */
export const isBlank = (maxLuma: number[]): boolean => maxLuma.length > 0 && maxLuma.every((y) => y <= BLANK_MAX_LUMA)

export async function blankVideo(file: string, frames: number, bin = 'ffmpeg'): Promise<boolean> {
  return isBlank(await sampledMaxLuma(file, frames, bin))
}
