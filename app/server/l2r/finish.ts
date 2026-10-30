/**
 * The free finish of an L2R render: the grade to the Bible's master when switched on (grade.ts: colormatch.py at its strength),
 * then scripts/l2r/sharpen.py (E103 luma local contrast + unsharp, halo-clamped), then
 * scripts/l2r/grain.py at std 2.4 on top, as child processes; raw -> <id>-finished.mp4, same frames, 24 fps, H.264 yuv420p.
 * The switches are the finish's, not the press's, so each is toggled free and followed by Finish again: a request carries
 * {grade?} (renderFinishContract.ts), absent = what the render recorded. There is no depth of field: a `dof` an older client sent, or an older render recorded, is ignored.
 * The new picture is written beside the old one and replaces it only when whole, so a failed Finish again keeps the last good cut.
 * Python: CANVAS_PYTHON (server/python.ts; LIFT_PYTHON is the older name), else `python` on the PATH; a Python without cv2 is named in the error.
 * One finish per render at a time (409). A failure keeps the raw and records `finishError`; Finish can be pressed again.
 */
import { execFile } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { replaceFile } from '../replace.js'
import path from 'node:path'
import { COLORMATCH, type L2RRender } from '../../src/shared/shotContract.ts'
import { GRADE_DEFAULT, type GradeRecord } from '../../src/shared/keyframeContract.ts'
import { readTake } from '../takes/store.ts'
import type { FinishRequest } from '../../src/shared/renderFinishContract.ts'
import { explainImportError } from '../pythonCheck.ts'
import { bibleOf } from './keyframes.ts'
import { colormatchArgs, resolveGrade, targetFile } from './grade.ts'
import { finishedName, type L2RCtx } from './run.ts'
import { GRAIN_STD, httpError, L2R_FPS, publicUrl, shotDirs } from './spec.ts'
import { findRender, writeRender } from './store.ts'
import { finishSource } from './faceSource.ts'

/** runs `python args…`; rejects with the child's stderr */
export type RunPython = (python: string, args: string[]) => Promise<void>

export const runPython: RunPython = (python, args) => new Promise((resolve, reject) => {
  execFile(python, args, { windowsHide: true, timeout: 30 * 60_000, maxBuffer: 8 * 1024 * 1024 }, (err, _out, stderr) => {
    // not found: no such file, or Windows' Store stub for a bare `python` (exit 9009, "Python was not found") (p-14)
    const code = (err as { code?: unknown } | null)?.code
    if (err) reject(Object.assign(new Error(`${String(stderr || err.message).trim().slice(-600)}`), { enoent: code === 'ENOENT' || code === 9009 || /^Python was not found/i.test(String(stderr).trim()) }))
    else resolve()
  })
})

const KEY = Symbol.for('canvas-stage.l2r.finishing')
const busy = (): Set<string> => ((globalThis as Record<symbol, Set<string> | undefined>)[KEY] ??= new Set())
export const finishing = (): string[] => [...busy()]
/** tests only */
export const resetFinishing = () => busy().clear()
/** the render held as finishing while `fn` runs (a face pass's Keep re-finishing onto it): Finish again answers 409 busy meanwhile */
export async function holdFinishing<T>(renderId: string, fn: () => Promise<T>): Promise<T> {
  if (busy().has(renderId)) throw httpError(409, 'this render is being finished right now: keep the face once that is done', 'busy')
  busy().add(renderId)
  try { return await fn() } finally { busy().delete(renderId) }
}
/** the switches a finish of `r` applies now (recordedFinish's inputs): a face pass's after records it, so Keep knows when to re-finish.
 *  `dof: 'off'` is constant: it keeps the key of every face pass recorded before depth of field was removed (they all finished without it) equal to today's. */
export const finishKeyOf = (r: L2RRender): string => JSON.stringify({ grade: r.gradeOff ? null : r.grade ?? null, dof: 'off' })

export function whyPython(python: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if ((e as { enoent?: boolean }).enoent) return `the finish needs Python with cv2 and numpy: ${python} was not found. Set CANVAS_PYTHON to your Python (with OpenCV and numpy) in app/.env.local (scripts/README.md).`
  if (/No module named '?(cv2|numpy)/.test(msg)) return `the finish Python (${python}) has no cv2/numpy: install opencv-python into it, or set CANVAS_PYTHON to a Python that has them. ${msg.slice(-200)}`
  const optional = explainImportError(msg)
  if (optional) return optional
  if (/ffmpeg/i.test(msg) && /not (found|recognized)|No such file/i.test(msg)) return `ffmpeg is not on PATH: the finish encodes with it. ${msg.slice(-200)}`
  return `the finish failed: ${msg}`
}

export interface FinishDeps { run?: RunPython }
export type FinishWant = Omit<FinishRequest, 'renderId'>

/** the grade this finish applies and whether it is switched off, from the request over what the render recorded; refused (free, 409) with no master */
export function gradeChoice(ctx: L2RCtx, r: L2RRender, worldId: string | undefined, want: FinishWant['grade']): { grade: GradeRecord | undefined; gradeOff: boolean } {
  const rec = r.grade as GradeRecord | null | undefined
  if (want === undefined) return { grade: r.gradeOff ? undefined : rec ?? undefined, gradeOff: !!r.gradeOff }
  if (want === false || want === null) return { grade: undefined, gradeOff: true }
  const strength = typeof want === 'object' ? want.strength : undefined
  if (rec && strength === undefined) return { grade: rec, gradeOff: false }
  return { grade: resolveGrade(worldId ? bibleOf(ctx.publicDir, worldId) : null, strength === undefined ? {} : { strength }), gradeOff: false }
}

export async function finishL2R(ctx: L2RCtx, renderId: string, d: FinishDeps = {}, want: FinishWant = {}): Promise<L2RRender> {
  const r = findRender(ctx.publicDir, renderId)
  if (!r) throw httpError(404, `no render ${renderId}`, 'not_found')
  const dir = shotDirs(ctx.publicDir, r.takeId).l2r
  // a kept face pass is the render's picture now (faceSource.ts): Finish again re-finishes it, never the raw underneath
  const raw = finishSource(dir, r.id)
  if (r.status !== 'done' || !existsSync(raw)) throw httpError(409, 'this render has no raw video yet: render it (or recover it by id) first', 'no_raw')
  if (busy().has(r.id)) throw httpError(409, 'this render is being finished already', 'busy')
  const take = readTake(ctx.publicDir, r.takeId)
  const { grade, gradeOff } = gradeChoice(ctx, r, take?.worldId, want.grade) // free refusal: no master to grade to
  busy().add(r.id)
  const out = path.join(dir, finishedName(r.id))
  const next = path.join(dir, `${r.id}-finishing.mp4`)
  try {
    await finishChain(ctx, { grade }, raw, next, path.join(dir, r.id), d)
    if (r.frames) {
      const got = await ctx.deps.probe(next)
      if (got.frames !== r.frames) throw httpError(500, `the finished video has ${got.frames} frames, the raw ${r.frames}: not kept`, 'finish_failed')
    }
    await replaceFile(next, out)
    return writeRender(ctx.publicDir, { ...r, grade: grade ?? r.grade, gradeOff: gradeOff || undefined, dofMode: undefined, finished: publicUrl(r.takeId, 'l2r', finishedName(r.id)),
      finishedAt: new Date().toISOString(), finishError: undefined, dof: null })
  } catch (e) {
    rmSync(next, { force: true })
    writeRender(ctx.publicDir, { ...r, finishError: (e as Error).message.slice(0, 600) })
    throw e
  } finally {
    busy().delete(r.id)
  }
}

/** what one finish applies: the grade (absent = none) */
export interface FinishPlan { grade: GradeRecord | undefined }

/** the grade a finish of `r` would apply now with the switches it recorded (the face pass finishes its candidate so) */
export function recordedFinish(ctx: L2RCtx, r: L2RRender): FinishPlan {
  const take = readTake(ctx.publicDir, r.takeId)
  return { grade: gradeChoice(ctx, r, take?.worldId, undefined).grade }
}

/**
 * The chain itself (grade -> sharpen -> grain) from `src` to `out`, its intermediates named `<stem>-grade|sharp` and
 * removed after. Shared with the face pass (facePass.ts), so its candidate is finished exactly as Finish again finishes the render.
 */
export async function finishChain(ctx: L2RCtx, plan: FinishPlan, src: string, out: string, stem: string, d: FinishDeps = {}): Promise<void> {
  const python = ctx.deps.python() ?? 'python'
  const run = d.run ?? runPython
  const script = (name: string) => path.join(ctx.appRoot, 'scripts', 'l2r', name)
  const tmpGrade = `${stem}-grade.mp4`, tmp = `${stem}-sharp.mp4`
  try {
    let head = src
    if (plan.grade) { // first: grade -> sharpen -> grain, so the sharpen and the grain work on the graded picture
      const target = targetFile(ctx.publicDir, plan.grade.target)
      const strength = typeof plan.grade.strength === 'number' ? plan.grade.strength : GRADE_DEFAULT // m4: a record from before `strength` regrades as gently as the first finish
      await run(python, colormatchArgs(path.join(ctx.appRoot, COLORMATCH.script), target, src, tmpGrade, strength, L2R_FPS))
      head = tmpGrade
    }
    await run(python, [script('sharpen.py'), head, tmp, String(L2R_FPS)])
    await run(python, [script('grain.py'), tmp, out, String(GRAIN_STD), String(L2R_FPS)])
  } catch (e) {
    throw httpError(500, whyPython(python, e), 'finish_failed')
  } finally {
    for (const f of [tmp, tmpGrade]) rmSync(f, { force: true })
  }
}
