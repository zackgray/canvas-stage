/**
 * The clay finish and status (docs/wave-b-contract.md, T1). Finish checks the take is locked, every frame's three passes are on
 * disk and the cameras match the take, writes clay/cameras.json, then runs scripts/clay/clay.py (LIFT_PYTHON) as a child: the
 * E102 clay (E96 clay, face sculpted; the face found per frame with YuNet) -> clay/clay.mp4 at 1920x1088, the take's 8k+1
 * frames, 24 fps, H.264 yuv420p, and clay.json (ClayExport) beside it. One at a time: a second finish while one runs is 409.
 * A take on a kit world (Stage3D) takes kit.ts instead: finished frames from the page, encoded by ffmpeg alone.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { shotPaths, type ClayCamera, type ClayExport, type ClayFinishRequest, type ClayFrameKind } from '../../src/shared/shotContract.ts'
import { pythonFor } from '../python.ts'
import { readTake } from '../takes/store.ts'
import { claySetMoved } from '../l2r/inputs.ts'
import { restampSetKey, setFinishRefusal } from './setRestamp.ts'
import { parseClayStamps, stampRefusal } from './stamps.ts'
import { isKitWorld } from '../stage3d/takeWorld.ts'
import { ENTITY_TAG_RE } from '../../src/stage3d/contract.ts'
import { parseClayTiming } from '../../src/shared/clayTiming.ts'
import { finishMassingClay } from '../pieces/massingClay.ts'
import { finishKitClay } from './kit.ts'
import { ClayRunner, type ClayFile, type ClayRunnerOpts } from './runner.ts'
import { CLAY_H, CLAY_W, DEPTH_BYTES, frameFile } from './upload.ts'

export const ffmpegOk = () => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true }); return true } catch { return false } }

export const ffprobeOk = () => { try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore', windowsHide: true }); return true } catch { return false } }

export interface ClayServiceOpts {
  publicDir: string
  appDir: string
  python: () => string | undefined
  /** YuNet face model (OpenCV Zoo face_detection_yunet_2023mar.onnx) */
  yunet?: string
  hasFfmpeg?: () => boolean
  /** kit clay: ffprobe is on PATH (the frame-count check needs it); not asked when probeFrames is given */
  hasFfprobe?: () => boolean
  runner?: Partial<ClayRunnerOpts>
  /** kit clay: the frame count of an encoded video (tests); default ffprobe's packet count */
  probeFrames?: (file: string) => Promise<number>
  /** kit clay with massing pieces: encode massing.mp4 (tests); default server/pieces/massingClay.ts. Resolves to why it failed, or null */
  finishMassing?: (publicDir: string, takeId: string) => Promise<string | null>
}

/** The tracked YuNet copy (scripts/clay/models, MIT; LICENSE-yunet.txt beside it), else the experiments cache. CLAY_YUNET overrides both. */
export function defaultYunet(appDir: string): string {
  const tracked = path.join(appDir, 'scripts', 'clay', 'models', 'face_detection_yunet_2023mar.onnx')
  return existsSync(tracked) ? tracked : path.join(appDir, 'experiments', 'cache', 'faceid', 'yunet.onnx')
}

type Result = { code: number; body: unknown }
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const tuple = (x: unknown, n: number) => Array.isArray(x) && x.length === n && x.every(finite)

export function parseFinish(raw: unknown, frames: number): { takeId: string; cameras: ClayCamera[]; key?: [number, number, number] } | string {
  const q = raw as Partial<ClayFinishRequest> | null
  if (!q || typeof q !== 'object' || typeof q.takeId !== 'string') return 'body must be {takeId, cameras}'
  if (!Array.isArray(q.cameras) || q.cameras.length !== frames) return `cameras must hold one camera per frame (${frames})`
  for (const [i, c] of q.cameras.entries()) {
    if (!c || c.i !== i || !finite(c.t) || !tuple(c.position, 3) || !tuple(c.quaternion, 4) || !finite(c.focal) || !finite(c.vfovDeg) || c.vfovDeg <= 0 || c.vfovDeg >= 180) {
      return `cameras[${i}] needs i = ${i}, t, position [3], quaternion [4], focal and a vfovDeg in (0, 180)`
    }
  }
  if (q.key !== undefined && (!tuple(q.key, 3) || Math.hypot(...q.key) < 1e-6)) return 'key must be a non-zero camera-space direction [x, y, z]'
  return {
    takeId: q.takeId,
    cameras: q.cameras.map((c) => ({ i: c.i, t: c.t, position: c.position, quaternion: c.quaternion, focal: c.focal, vfovDeg: c.vfovDeg })),
    ...(q.key ? { key: q.key } : {}),
  }
}

/** the ID pass's colour table from the finish body (an extra field beside the contract's): tag -> [r, g, b] in 0..255, or undefined */
export function parseIdColors(raw: unknown): Record<string, [number, number, number]> | undefined {
  const c = (raw as { idColors?: unknown } | null)?.idColors
  if (!c || typeof c !== 'object' || Array.isArray(c)) return undefined
  const out: Record<string, [number, number, number]> = {}
  for (const [tag, v] of Object.entries(c)) {
    if (!ENTITY_TAG_RE.test(tag) || !Array.isArray(v) || v.length !== 3 || !v.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) return undefined
    out[tag] = v as [number, number, number]
  }
  return out
}

export class ClayService {
  readonly runner: ClayRunner
  private o: ClayServiceOpts
  constructor(o: ClayServiceOpts) {
    this.o = o
    this.runner = new ClayRunner({ publicDir: o.publicDir, appDir: o.appDir, ...o.runner })
  }

  private dir(take: string) { return path.join(this.o.publicDir, shotPaths(take).clay) }

  status(take: string | null): Result {
    const rec = take ? readTake(this.o.publicDir, take) : null
    if (!rec) return { code: 404, body: { error: 'no locked take with that id' } }
    const f = this.runner.read(rec.id)
    // no clay yet is an answer, not a failure: a 404 here was a console error on every Lock (QA 2026-10-25)
    if (!f) return { code: 200, body: { clay: null, busyWith: this.runner.busyWith } }
    const { pid: _pid, log: _log, ...clay } = f as ClayFile
    // the set changed after these frames were made: said here so the page prepares them again before a draw (stillPrep.ts)
    const moved = clay.status === 'done' ? claySetMoved(this.o.publicDir, rec, clay as ClayExport) : null
    return { code: 200, body: { clay: moved ? { ...clay, setMoved: moved } : clay, busyWith: this.runner.busyWith } }
  }

  /** the frames whose passes are not all on disk (depth passes must be the full Float32 size) */
  missing(take: string, frames: number): number[] {
    const out: number[] = []
    const d = this.dir(take)
    const kinds: ClayFrameKind[] = ['colour', 'depth', 'bg']
    for (let i = 0; i < frames; i++) {
      const ok = kinds.every((k) => {
        const p = path.join(d, frameFile(k, i))
        try { const s = statSync(p); return k === 'colour' ? s.size > 0 : s.size === DEPTH_BYTES } catch { return false }
      })
      if (!ok) out.push(i)
    }
    return out
  }

  finish(raw: unknown): Result {
    const takeId = (raw as { takeId?: unknown } | null)?.takeId
    const rec = typeof takeId === 'string' ? readTake(this.o.publicDir, takeId) : null
    if (!rec) return { code: 404, body: { error: 'no locked take with that id' } }
    const busy = this.runner.busyWith
    if (busy) return { code: 409, body: { error: `a clay export is already running (${busy}); one at a time` } }
    // frames captured with another walk than the take's are never stored as its frames (stamps.ts); an older page sends none
    const stamps = parseClayStamps(raw)
    if (typeof stamps === 'string') return { code: 400, body: { error: stamps } }
    const refused = stampRefusal(rec, stamps)
    if (refused) return { code: 409, body: { error: refused, code: 'perf_mismatch' } }
    // frames captured on another set than the one the take is prepared on are never stored either (setRestamp.ts), before any write
    const setRefused = setFinishRefusal(this.o.publicDir, rec, stamps.setKey)
    if (setRefused) return { code: 409, body: { error: setRefused, code: 'set_mismatch' } }
    // a kit world's frames are finished in the page: encode them (ffmpeg only); the panorama path below is unchanged
    if (isKitWorld(this.o.publicDir, rec.worldId)) {
      const cams = parseFinish(raw, rec.frames) // optional here
      const body = raw as { timing?: unknown; massing?: unknown }
      const encodeMassing = this.o.finishMassing ?? ((pub: string, id: string) => finishMassingClay(pub, id).then((m) => (Array.isArray(m) ? m[1] : null)))
      const r = finishKitClay({ runner: this.runner, publicDir: this.o.publicDir, hasFfmpeg: this.o.hasFfmpeg ?? ffmpegOk, hasFfprobe: this.o.hasFfprobe ?? ffprobeOk, probe: this.o.probeFrames }, rec,
        typeof cams === 'string' ? undefined : cams.cameras, parseIdColors(raw),
        { timing: parseClayTiming(body.timing), stamps, ...(body.massing === true ? { massing: () => encodeMassing(this.o.publicDir, rec.id) } : {}) })
      // a take with no copy of its own, prepared on the scene's set: it now records that set's key (the one sent) and a copy of it
      // (setRestamp.ts); a take with its own set keeps it. No new take
      if (r.code === 202) restampSetKey(this.o.publicDir, rec, stamps.setKey)
      return r
    }
    const q = parseFinish(raw, rec.frames)
    if (typeof q === 'string') return { code: 400, body: { error: q } }
    const missing = this.missing(rec.id, rec.frames)
    if (missing.length) return { code: 400, body: { error: `${missing.length} of ${rec.frames} frames are not uploaded (first: ${missing[0]})` } }
    if (!(this.o.hasFfmpeg ?? ffmpegOk)()) return { code: 503, body: { error: 'ffmpeg is not on PATH: the clay video needs it' } }
    const py = pythonFor(this.o.python())
    if ('error' in py) return { code: 503, body: { error: py.error } }
    const yunet = this.o.yunet ?? defaultYunet(this.o.appDir)
    if (!existsSync(yunet)) return { code: 503, body: { error: `the face finder (YuNet, OpenCV Zoo face_detection_yunet_2023mar.onnx) is not at ${yunet}: the clay sculpts his face with it. Set CLAY_YUNET in app/.env to the .onnx file's full path, or restore scripts/clay/models/ from git, then restart the dev server.` } }
    const dir = this.dir(rec.id)
    writeFileSync(path.join(dir, 'cameras.json'), JSON.stringify({ takeId: rec.id, width: CLAY_W, height: CLAY_H, fps: 24, frames: q.cameras }, null, 1))
    const pub = `/${shotPaths(rec.id).clay}`
    const base: ClayExport = { takeId: rec.id, startKey: rec.startKey, mp4: null, frames: rec.frames, width: CLAY_W, height: CLAY_H, status: 'running', ...stamps }
    const args = [path.join(this.o.appDir, 'scripts', 'clay', 'clay.py'), '--in', dir, '--out', path.join(dir, 'clay.mp4'), '--yunet', yunet, '--stills',
      ...(q.key ? ['--key', q.key.join(',')] : [])]
    const f = this.runner.start(rec.id, base, { mp4: `${pub}/clay.mp4`, still: `${pub}/clay-f0.png` }, py.python, args)
    const { pid: _pid, log: _log, ...clay } = f
    return { code: 202, body: { clay } }
  }
}
