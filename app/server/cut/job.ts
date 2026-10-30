/**
 * The export job. State lives on disk (cuts/status.json), not in this module: a refresh, a second dev-server module
 * instance or a restart all read the same truth. One export at a time -- a `running` record whose owner process is
 * still alive answers 409; one whose owner died is reported as interrupted (and no longer blocks). Names are claimed,
 * never overwritten: `cut-<stamp>.json` is created exclusively (wx) before ffmpeg runs, the video is written beside it
 * as `.part.mp4` and renamed into place, and ffmpeg itself runs with -n.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CUT_FPS, cutFrames, outputSize, validateCut, type CutSegment, type CutTake } from '../../src/labs/projection/cut/model.ts'
import { buildCutArgs, type CutAudio } from './args.ts'
import { performanceAudio } from './audio.ts'
import { ffmpegAvailable, ffprobeProbe, listPerformances, takeFile, type Prober } from './takes.ts'

export type CutRun = (args: string[]) => Promise<void>

export interface CutStatus {
  state: 'idle' | 'running' | 'done' | 'error' | 'interrupted'
  packId?: string
  id?: string
  startedAt?: string
  finishedAt?: string
  output?: string
  error?: string
  pid?: number
}

export interface CutDeps { run?: CutRun; probe?: Prober; ffmpegOk?: () => Promise<boolean>; pid?: number; alive?: (pid: number) => boolean }

export class CutError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export const FFMPEG_MISSING = 'ffmpeg is not installed or not on PATH: the Cut exports with it. Install ffmpeg (ffmpeg.org), restart the dev server, and export again. Nothing was written.'

const realRun: CutRun = (args) => new Promise((resolve, reject) => {
  execFile('ffmpeg', args, { windowsHide: true, maxBuffer: 1 << 20 }, (e, _o, stderr) =>
    e ? reject(new Error(String(stderr || e.message).trim().slice(-400))) : resolve())
})
const realAlive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { return (e as { code?: string }).code === 'EPERM' } }

const stampNow = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23)

export interface PriorCut { packId: string; id: string; url: string; frames: number; segments: number; createdAt: string }

export class CutJob {
  private readonly statusFile: string
  private readonly publicDir: string
  private readonly deps: CutDeps
  constructor(publicDir: string, deps: CutDeps = {}) {
    this.publicDir = publicDir
    this.deps = deps
    this.statusFile = path.join(publicDir, 'lab-assets', 'cuts', 'status.json')
  }
  private get rendersDir() { return path.join(this.publicDir, 'lab-assets', 'renders') }
  private get pid() { return this.deps.pid ?? process.pid }

  status(): CutStatus {
    let s: CutStatus
    try { s = JSON.parse(readFileSync(this.statusFile, 'utf8')) as CutStatus } catch { return { state: 'idle' } }
    if (s.state === 'running' && !(this.deps.alive ?? realAlive)(s.pid ?? -1)) {
      return { ...s, state: 'interrupted', error: 'The dev server stopped during the export; nothing was published. Export again.' }
    }
    return s
  }

  private write(s: CutStatus) {
    mkdirSync(path.dirname(this.statusFile), { recursive: true })
    writeFileSync(this.statusFile, JSON.stringify(s, null, 1))
  }

  /** Previous exports of every performance, newest first. */
  cuts(): PriorCut[] {
    const root = path.join(this.publicDir, 'lab-assets', 'cuts')
    const out: PriorCut[] = []
    let packs: string[] = []
    try { packs = readdirSync(root) } catch { return out }
    for (const packId of packs) {
      let files: string[] = []
      try { files = readdirSync(path.join(root, packId)) } catch { continue }
      for (const f of files.filter((n) => /^cut-[\w-]+\.json$/.test(n))) {
        try {
          const j = JSON.parse(readFileSync(path.join(root, packId, f), 'utf8'))
          if (j.complete) out.push({ packId, id: j.id, url: `/lab-assets/cuts/${packId}/${j.id}.mp4`, frames: j.frames, segments: j.segments.length, createdAt: j.createdAt })
        } catch { /* a reserved name whose export did not finish */ }
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Validate, claim the name, answer at once; the encode runs on and ends in status(). `done` is for tests.
   * `audio`: 'performance' = the performance's own track (audio.ts) over the cut's clock range; 'take' = each render's
   * own sound. Unset = 'take' when every render used has sound, else 'performance' when the performance has a track.
   */
  async start(packId: string, segments: CutSegment[], audio?: 'take' | 'performance'): Promise<{ status: CutStatus; done: Promise<void> }> {
    const busy = () => new CutError(409, 'An export is already running; wait for it to finish.')
    if (!/^[\w-]+$/.test(packId)) throw new CutError(400, 'bad performance id')
    if (this.status().state === 'running') throw busy()
    if (!(await (this.deps.ffmpegOk ?? (() => ffmpegAvailable()))())) throw new CutError(503, FFMPEG_MISSING)
    const perf = (await listPerformances(this.rendersDir, this.deps.probe)).find((p) => p.packId === packId)
    if (!perf) throw new CutError(404, `no takes on disk for ${packId}`)
    const errs = validateCut(segments, perf.takes)
    if (errs.length) throw new CutError(400, errs.join(' '))
    if (this.status().state === 'running') throw busy() // the awaits above are the only gap

    const byId = new Map<string, CutTake>(perf.takes.map((t) => [t.id, t]))
    const parts = segments.map((seg) => { const take = byId.get(seg.takeId)!; return { seg, take, file: takeFile(this.rendersDir, take) } })
    const size = outputSize(segments, perf.takes)
    const perfAudio = audio === 'take' ? null : await performanceAudio(this.publicDir, packId, this.deps.probe ?? ffprobeProbe)
    if (audio === 'performance' && !perfAudio) throw new CutError(409, `no sound found for performance ${packId} (its approved Perform take has no audio track, or is gone): export with audio 'take'`)
    const sound: CutAudio = perfAudio && (audio === 'performance' || parts.some((p) => !p.take.hasAudio)) ? { mode: 'performance', file: perfAudio } : { mode: 'take' }
    const dir = path.join(this.publicDir, 'lab-assets', 'cuts', packId)
    mkdirSync(dir, { recursive: true })
    const id = this.claim(dir, stampNow(), () => ({
      packId, fps: CUT_FPS, ...size, frames: cutFrames(segments), complete: false, createdAt: new Date().toISOString(),
      audio: sound.mode === 'performance' ? { mode: 'performance', file: path.relative(this.publicDir, sound.file).split(path.sep).join('/') } : { mode: 'take' },
      segments: parts.map(({ seg, take }) => ({ ...seg, kind: take.kind, file: `${take.warpFolder}/${take.file}`, sourceStart: take.sourceStart })),
    }))
    const mp4 = path.join(dir, `${id}.mp4`)
    const part = path.join(dir, `${id}.part.mp4`)
    const status: CutStatus = { state: 'running', packId, id, startedAt: new Date().toISOString(), pid: this.pid }
    this.write(status)
    const done = (async () => {
      try {
        await (this.deps.run ?? realRun)(buildCutArgs(parts, size, part, sound))
        renameSync(part, mp4)
        const jsonFile = path.join(dir, `${id}.json`)
        writeFileSync(jsonFile, JSON.stringify({ ...JSON.parse(readFileSync(jsonFile, 'utf8')), complete: true }, null, 1))
        this.write({ ...status, state: 'done', finishedAt: new Date().toISOString(), output: `/lab-assets/cuts/${packId}/${id}.mp4` })
      } catch (e) {
        rmSync(part, { force: true })
        rmSync(path.join(dir, `${id}.json`), { force: true })
        this.write({ ...status, state: 'error', finishedAt: new Date().toISOString(), error: (e as Error).message })
      }
    })()
    return { status, done }
  }

  /** Create cut-<stamp>.json exclusively; on a taken stamp, bump a suffix. Never opens an existing file for writing. */
  private claim(dir: string, stamp: string, meta: () => object): string {
    for (let n = 0; n < 1000; n++) {
      const id = `cut-${stamp}${n ? `-${n}` : ''}`
      if (existsSync(path.join(dir, `${id}.mp4`))) continue // a video with no json is still somebody's file
      try {
        writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, ...meta() }, null, 1), { flag: 'wx' })
        return id
      } catch (e) {
        if ((e as { code?: string }).code !== 'EEXIST') throw e
      }
    }
    throw new CutError(500, 'could not pick a free cut name')
  }
}
