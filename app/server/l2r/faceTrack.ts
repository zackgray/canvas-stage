/**
 * The face pass's free local steps around the paid job, as child processes (scripts/l2r/face_track.py, face_paste.py) on the Python
 * the finish uses (CANVAS_PYTHON / LIFT_PYTHON, server/python.ts). Track: one person's head on every frame of the render's CURRENT
 * picture (the raw, or the face-passed raw a kept pass left, faceSource.ts), redone only when that picture changes; it also writes
 * the strip of their face at frames 0 / 24 / 40 / last. Window: the fixed square that follows the head, cut from that picture and
 * from the approved still (the Klein frame -1's input) at 1088.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ClayExport, L2RRender } from '../../src/shared/shotContract.ts'
import type { FaceTrackView } from '../../src/studio/render/FacePassTypes.ts'
import { runPython, whyPython, type RunPython } from './finish.ts'
import type { FacePerson } from './facePeople.ts'
import { faceDirs, faceUrl, subjectDir } from './faceSpec.ts'
import { finishSource } from './faceSource.ts'
import type { L2RCtx } from './run.ts'
import { httpError, shotDirs } from './spec.ts'

export interface FaceCtx { l2r: L2RCtx; run?: RunPython; yunet: string }

interface TrackFile { summary: { ok: boolean; why?: string; hits?: number; strip?: number[]; frames: number }; source?: string }
const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }

/** the picture a pass on this render starts from now */
export const sourceOf = (ctx: FaceCtx, r: L2RRender) => finishSource(shotDirs(ctx.l2r.publicDir, r.takeId).l2r, r.id)
/** the picture's name inside the take's l2r folder (a track remembers it, so a kept pass makes every other person's track stale) */
const sourceKey = (ctx: FaceCtx, r: L2RRender) => path.relative(shotDirs(ctx.l2r.publicDir, r.takeId).l2r, sourceOf(ctx, r)).split(path.sep).join('/')

export async function py(ctx: FaceCtx, script: 'face_track.py' | 'face_paste.py', cmd: string, plan: object, planFile: string): Promise<void> {
  writeFileSync(planFile, JSON.stringify(plan, null, 1))
  const python = ctx.l2r.deps.python() ?? 'python'
  try { await (ctx.run ?? runPython)(python, [path.join(ctx.l2r.appRoot, 'scripts', 'l2r', script), cmd, planFile]) } catch (e) {
    throw httpError(500, whyPython(python, e).replace(/^the finish/, 'the face pass'), 'face_failed')
  }
}

/** the track on disk for this person, when it was made from the render's current picture (else null: it must be made again) */
export function readTrack(ctx: FaceCtx, r: L2RRender, subject: string): FaceTrackView | null {
  const dir = faceDirs(ctx.l2r.publicDir, r.takeId, r.id).subject(subject)
  const t = readJson<TrackFile>(path.join(dir, 'track.json'))
  if (!t?.summary || t.source !== sourceKey(ctx, r)) return null
  const s = t.summary
  return { ok: !!s.ok, ...(s.why ? { why: s.why } : {}), ...(typeof s.hits === 'number' ? { hits: s.hits } : {}),
    ...(s.ok && s.strip && existsSync(path.join(dir, 'strip.png')) ? { strip: `${faceUrl(r.takeId, r.id, subjectDir(subject), 'strip.png')}?v=${encodeURIComponent(t.source ?? '')}`, frames: s.strip } : {}) }
}

/** free: track one person on the render (no-op when the track is fresh) */
export async function trackFace(ctx: FaceCtx, r: L2RRender, p: FacePerson): Promise<FaceTrackView> {
  const have = readTrack(ctx, r, p.subject)
  if (have) return have
  if (!r.frames) throw httpError(409, 'this render does not record its length: recover it by id first', 'not_finished')
  const clayDir = shotDirs(ctx.l2r.publicDir, r.takeId).clay
  const clay = readJson<ClayExport>(path.join(clayDir, 'clay.json'))
  if (!clay?.idPass || !clay.depth) throw httpError(409, 'The 3D set preview has no ID pass or depth: press Prepare the frames under the locked take on the Stage (free).', 'not_fixable')
  if (!existsSync(ctx.yunet)) throw httpError(503, `the face finder (YuNet, OpenCV Zoo face_detection_yunet_2023mar.onnx) is not at ${ctx.yunet}: set CLAY_YUNET in app/.env to its full path, or restore scripts/clay/models/ from git`, 'no_yunet')
  const dir = faceDirs(ctx.l2r.publicDir, r.takeId, r.id).subject(p.subject)
  mkdirSync(dir, { recursive: true })
  const n = r.frames
  await py(ctx, 'face_track.py', 'track', { raw: sourceOf(ctx, r), sourceKey: sourceKey(ctx, r), clayDir, frames: n, idFrames: clay.idPass.frames, color: p.color, unitM: clay.depth.unitM,
    yunet: ctx.yunet, out: dir, stripFrames: [0, 24, 40, n - 1] }, path.join(dir, 'track-plan.json'))
  const got = readTrack(ctx, r, p.subject)
  if (!got) throw httpError(500, 'the face track wrote nothing', 'face_failed')
  return got
}

/** free: the window clips and the Klein inputs for one person; returns the files the paid job binds */
export async function windowFace(ctx: FaceCtx, r: L2RRender, p: FacePerson): Promise<{ dir: string; win: string; still: string; mask: string }> {
  const dir = faceDirs(ctx.l2r.publicDir, r.takeId, r.id).subject(p.subject)
  const still = path.join(shotDirs(ctx.l2r.publicDir, r.takeId).hero, `${r.stillId}.png`)
  if (!existsSync(still)) throw httpError(409, 'the approved opening still of this render is not on disk', 'not_fixable')
  await py(ctx, 'face_track.py', 'window', { raw: sourceOf(ctx, r), still, out: dir }, path.join(dir, 'window-plan.json'))
  const files = { dir, win: path.join(dir, 'win-raw.mp4'), still: path.join(dir, 'still-win.png'), mask: path.join(dir, 'face-mask-win.png') }
  for (const f of [files.win, files.still, files.mask]) if (!existsSync(f)) throw httpError(500, `the face window did not write ${path.basename(f)}`, 'face_failed')
  return files
}

/** the frame-0 window in render pixels (the candidate's box) */
export function windowBox(dir: string): { x: number; y: number; w: number; h: number } {
  const w = readJson<{ win: number; boxes: [number, number][] }>(path.join(dir, 'window.json'))
  if (!w?.boxes?.length) throw httpError(500, 'the face window wrote no boxes', 'face_failed')
  return { x: Math.round(w.boxes[0][0]), y: Math.round(w.boxes[0][1]), w: w.win, h: w.win }
}
