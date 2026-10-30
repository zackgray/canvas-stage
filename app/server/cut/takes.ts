/**
 * The takes of every performance on disk: public/lab-assets/renders/warp-*\/ holds the camera move (cameras.json:
 * packId + sourceStart) and its renders -- drafts `crossview-<stamp>.mp4`, 1920 finals `final-<stamp>.mp4`, Realism
 * `realism-<stamp>.mp4`, Reskin `reskin-<stamp>-1920.mp4` (its playback file; the 1248 stitch and the chunks are never
 * takes), finished `finished-<source id>-<stamp>.mp4`. A Realism or Reskin take exists only once its `.json` does (the
 * step writes it last). Each file is probed (size, frames, audio) and cached by path + mtime.
 */
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { CUT_FPS, type CutTake, type TakeKind } from '../../src/labs/projection/cut/model.ts'
import { REALISM_MP4_RE } from '../realism/ids.ts'
import { RESKIN_1920_RE } from '../reskin/ids.ts'

const exec = promisify(execFile)

export interface Probe { width: number; height: number; frames: number; hasAudio: boolean }
export type Prober = (file: string) => Promise<Probe | null>

/**
 * File name -> kind. Group 1 is the take's name inside the folder (the file stem; for a reskin the render id, not the
 * `-1920` stem), `stamp` orders takes of one kind (newest wins). Realism and Reskin use the ids those steps export.
 */
export const KINDS: [TakeKind, RegExp][] = [
  ['draft', /^(crossview-[\w.-]+)\.mp4$/],
  ['final', /^(final-[\w.-]+)\.mp4$/],
  ['realism', REALISM_MP4_RE],
  ['reskin', RESKIN_1920_RE],
  ['finished', /^(finished-[\w.-]+)\.mp4$/],
]
/** The kinds whose render exists only when its record does (docs/chain-contract.md, "Write order"). */
const NEEDS_RECORD: ReadonlySet<TakeKind> = new Set(['realism', 'reskin'])
/** A take id is `warp-<stamp>/<take name>`; nothing else reaches a path. */
export const TAKE_ID = /^warp-[\w-]+\/(crossview|final|realism|reskin|finished)-[\w.-]+$/

const cache = new Map<string, Probe | null>()

export const ffprobeProbe: Prober = async (file) => {
  let key = file
  try { const s = statSync(file); key = `${file}:${s.mtimeMs}:${s.size}` } catch { return null }
  if (cache.has(key)) return cache.get(key) ?? null
  let probe: Probe | null = null
  try {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,nb_frames,duration', '-of', 'json', file], { windowsHide: true, timeout: 30_000 })
    const streams = (JSON.parse(stdout).streams ?? []) as { codec_type: string; width?: number; height?: number; nb_frames?: string; duration?: string }[]
    const v = streams.find((s) => s.codec_type === 'video')
    if (v?.width && v.height) {
      const frames = Number(v.nb_frames) || Math.round(Number(v.duration) * CUT_FPS) || 0
      probe = { width: v.width, height: v.height, frames, hasAudio: streams.some((s) => s.codec_type === 'audio') }
    }
  } catch { probe = null }
  cache.set(key, probe)
  return probe
}

export async function ffmpegAvailable(bin = 'ffmpeg'): Promise<boolean> {
  try { await exec(bin, ['-version'], { windowsHide: true, timeout: 15_000 }); return true } catch { return false }
}

export interface Performance { packId: string; takes: CutTake[] }

export async function listPerformances(rendersDir: string, probe: Prober = ffprobeProbe): Promise<Performance[]> {
  const byPack = new Map<string, CutTake[]>()
  let folders: string[] = []
  try { folders = readdirSync(rendersDir).filter((d) => /^warp-[\w-]+$/.test(d)).sort() } catch { return [] }
  for (const warpFolder of folders) {
    const dir = path.join(rendersDir, warpFolder)
    let cams: { packId?: unknown; sourceStart?: unknown }
    try { cams = JSON.parse(readFileSync(path.join(dir, 'cameras.json'), 'utf8')) } catch { continue }
    if (typeof cams.packId !== 'string' || !/^[\w-]+$/.test(cams.packId)) continue
    const sourceStart = Number.isInteger(cams.sourceStart) && (cams.sourceStart as number) >= 0 ? (cams.sourceStart as number) : 0
    for (const file of readdirSync(dir).sort()) {
      const hit = KINDS.map(([kind, re]) => [kind, re.exec(file)] as const).find(([, m]) => m)
      if (!hit || !hit[1]) continue
      const name = hit[1][1]
      if (NEEDS_RECORD.has(hit[0]) && !existsSync(path.join(dir, `${name}.json`))) continue
      const p = await probe(path.join(dir, file))
      if (!p || p.frames < 1) continue
      const take: CutTake = {
        id: `${warpFolder}/${name}`, warpFolder, kind: hit[0], file, stamp: name.slice(name.indexOf('-') + 1),
        url: `/lab-assets/renders/${warpFolder}/${file}`, width: p.width, height: p.height, frames: p.frames, sourceStart, hasAudio: p.hasAudio,
      }
      byPack.set(cams.packId, [...(byPack.get(cams.packId) ?? []), take])
    }
  }
  return [...byPack].map(([packId, takes]) => ({ packId, takes }))
}

export const takeFile = (rendersDir: string, take: CutTake) => path.join(rendersDir, take.warpFolder, take.file)
export const hasDir = (p: string) => existsSync(p)
