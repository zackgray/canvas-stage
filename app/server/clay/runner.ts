/**
 * Runs the clay shading script (scripts/clay/clay.py) as a child process, one clay at a time across the app, and keeps the
 * state ON DISK in shots/<take>/clay/clay.json (a ClayExport + the child's pid): `done` follows the script's "frame k/N"
 * lines, `faceFrames` its "faces found on X/N" line; the file is rewritten at most every 400 ms and once at the end. A runner
 * built after a dev-server restart finds a live child by its pid and stays busy; a "running" file with no live process
 * behind it reads as failed ("interrupted"). The spawn is injectable so the tests never run Python. Free: no Cloud job.
 * Once clay.mp4 and clay.json have landed, the raw passes (~20 MB a frame, 2-3.5 GB a take) are deleted, all but frame 0's
 * colour (the opening reference); a failed run keeps them for a retry, and CLAY_KEEP_FRAMES=1 keeps them for debugging.
 */
import { execFile, spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { SHOTS_DIR, shotPaths, type ClayExport } from '../../src/shared/shotContract.ts'
import { pidAlive } from '../jobs/inflight.ts'
import { TAKE_ID_RE } from '../takes/request.ts'
import { writeJson } from '../takes/store.ts'

export type ClayFile = ClayExport & { pid?: number; log?: string[] }
type Spawn = (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => Pick<ChildProcess, 'stdout' | 'stderr' | 'on'> & { pid?: number }

export interface ClayRunnerOpts {
  publicDir: string
  appDir: string
  spawn?: Spawn
  flushMs?: number
  kill?: (pid: number) => void
  alive?: (pid: number | undefined) => boolean
  /** keep the raw passes after a done clay (CLAY_KEEP_FRAMES=1, for debugging); default false */
  keepFrames?: () => boolean
}

/** a clay of 161 frames takes minutes; a "running" file older than this is not trusted even if its pid is reused */
export const MAX_CLAY_MS = 60 * 60_000
const LOG_CAP = 40

const killTree = (pid: number) => {
  if (process.platform === 'win32') execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => {})
  else { try { process.kill(pid, 'SIGTERM') } catch { /* gone */ } }
}

export const clayJson = (publicDir: string, takeId: string) => path.join(publicDir, shotPaths(takeId).clay, 'clay.json')

/** the raw capture passes (a kit world's final_NNN.png too) and interrupted uploads; the classic colour_000.png (the opening reference) is not one of them,
 *  but a kit take's final_000.png is: clay-f0.png is its copy, made before the encode */
const RAW_PASS = /^(colour_(?!000\.)\d{3,}\.png|final_\d{3,}\.png|depth_\d{3,}\.f32|bg_\d{3,}\.f32)(\.part)?$|\.part$/

/** Deletes a done clay's raw passes from its folder; returns how many files went. Only call with clay.mp4 and clay.json on disk. */
export function dropRawPasses(dir: string): number {
  let n = 0
  for (const f of readdirSync(dir)) if (RAW_PASS.test(f) && f !== 'clay.mp4.part') { rmSync(path.join(dir, f), { force: true }); n++ }
  return n
}

export class ClayRunner {
  private current: { take: string; pid?: number; stopping?: boolean } | null = null
  private o: ClayRunnerOpts
  constructor(o: ClayRunnerOpts) { this.o = o }

  private stored(take: string): ClayFile | null {
    try { return JSON.parse(readFileSync(clayJson(this.o.publicDir, take), 'utf8')) as ClayFile } catch { return null }
  }
  private aliveIn(f: ClayFile | null): boolean {
    if (!f || f.status !== 'running' || f.pid === undefined) return false
    if (f.startedAt && Date.now() - Date.parse(f.startedAt) > MAX_CLAY_MS) return false
    return (this.o.alive ?? pidAlive)(f.pid)
  }

  /** The take whose clay is shading now: this runner's, or a live child an earlier (restarted) server started. */
  get busyWith(): string | null {
    if (this.current) return this.current.take
    let ids: string[] = []
    try { ids = readdirSync(path.join(this.o.publicDir, SHOTS_DIR)).filter((n) => TAKE_ID_RE.test(n)) } catch { /* no shots */ }
    return ids.find((id) => this.aliveIn(this.stored(id))) ?? null
  }

  /** The stored clay, or null; "running" with nothing behind it was interrupted. */
  read(take: string): ClayFile | null {
    const f = this.stored(take)
    if (f?.status === 'running' && this.current?.take !== take && !this.aliveIn(f)) {
      return { ...f, status: 'failed', error: 'the clay export was interrupted (the server restarted); export it again' }
    }
    return f
  }

  stop(): void {
    const cur = this.current
    if (!cur?.pid) return
    cur.stopping = true
    ;(this.o.kill ?? killTree)(cur.pid)
  }

  /** Start the script; `base` is the clay.json to write (status running), `out` what it points at once done. The caller checked nothing is running. */
  /** `verify` (a kit clay's frame count) runs after a clean exit and may note on the file before it is written done (its timing) */
  start(take: string, base: ClayExport, out: { mp4: string; still: string }, cmd: string, args: string[], verify?: (f: ClayFile) => Promise<string | null>): ClayFile {
    if (this.current) throw new Error(`a clay export is already running (${this.current.take})`)
    const cur: { take: string; pid?: number; stopping?: boolean } = { take }
    this.current = cur
    const file = clayJson(this.o.publicDir, take)
    const f: ClayFile = { ...base, mp4: null, still: null, status: 'running', done: 0, startedAt: new Date().toISOString(), log: [] }
    writeJson(file, f)
    const spawn: Spawn = this.o.spawn ?? ((c, a, p) => nodeSpawn(c, a, { ...p, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }))
    const child = spawn(cmd, args, { cwd: this.o.appDir, env: { ...process.env, PYTHONUNBUFFERED: '1' } })
    if (child.pid) { cur.pid = child.pid; f.pid = child.pid; writeJson(file, f) }
    let last = 0, timer: NodeJS.Timeout | null = null
    const flush = () => { timer = null; last = Date.now(); writeJson(file, f) }
    const line = (raw: string) => {
      const t = raw.trim()
      if (!t) return
      const m = /^frame (\d+)\/(\d+)/.exec(t) ?? /^frame=\s*(\d+)$/.exec(t) // the clay script's line, or ffmpeg's -progress key (kit clay)
      if (m) f.done = Math.min(Number(m[1]), f.frames)
      else if (/^[a-z0-9_]+=\s*\S*$/.test(t)) { /* ffmpeg's other -progress keys (fps=, bitrate= 814kbits/s, stream_0_0_q=): not log lines */ }
      else {
        const faces = /^faces found on (\d+)\/(\d+)/.exec(t)
        if (faces) f.faceFrames = Number(faces[1])
        if (!/^face \d+\/\d+/.test(t)) { f.log!.push(t.slice(0, 300)); if (f.log!.length > LOG_CAP) f.log!.splice(0, f.log!.length - LOG_CAP) }
      }
      if (!timer) timer = setTimeout(flush, Math.max(0, (this.o.flushMs ?? 400) - (Date.now() - last)))
    }
    const feed = (rest: { v: string }) => (d: Buffer) => {
      const parts = (rest.v + d.toString('utf8')).split(/\n/)
      rest.v = parts.pop() ?? ''
      for (const p of parts) line(p.split('\r').pop() ?? '')
    }
    const so = { v: '' }, se = { v: '' }
    child.stdout?.on('data', feed(so))
    child.stderr?.on('data', feed(se))
    let ended = false
    const end = (code: number | null, err?: string) => {
      if (ended) return
      ended = true
      if (timer) clearTimeout(timer)
      line(so.v); line(se.v)
      if (timer) clearTimeout(timer)
      timer = null
      delete f.pid
      f.finishedAt = new Date().toISOString()
      if (code === 0 && !err) { f.status = 'done'; f.done = f.frames; f.mp4 = out.mp4; f.still = out.still; delete f.error }
      else {
        f.status = 'failed'
        f.mp4 = null
        f.still = null
        f.error = err ?? (cur.stopping ? 'the clay export was stopped because the dev server restarted or closed; export it again'
          : `the clay script stopped (exit ${code}): ${(f.log ?? []).slice(-2).join(' / ')}`)
      }
      writeJson(file, f)
      // the passes are only an input to the shade: gone once its outputs are on disk; kept on failure (a retry re-shades them)
      if (f.status === 'done' && !(this.o.keepFrames?.() ?? false) && existsSync(path.join(path.dirname(file), 'clay.mp4')) && existsSync(file)) {
        try { dropRawPasses(path.dirname(file)) } catch { /* a locked file stays; the next export overwrites it */ }
      }
      if (this.current === cur) this.current = null
    }
    child.on('error', (e: Error) => end(null, `could not start the clay script: ${e.message}`))
    // a kit clay's video is checked (its frame count probed) before it is called done; the panorama script's has no check here
    child.on('close', (code: number | null) => {
      if (code !== 0 || !verify || ended) return end(code)
      verify(f).then((err) => end(code, err ?? undefined), (e: unknown) => end(code, `the clay video could not be checked: ${(e as Error).message}`))
    })
    return f
  }
}
