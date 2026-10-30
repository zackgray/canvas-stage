/**
 * Which raw a render's finish starts from. A kept face pass makes its pasted raw the render's source (shots/<take>/l2r/<id>-face.json),
 * so a later free "Finish again" (grade switch) re-finishes the face-passed picture instead of silently dropping it, and a
 * second person's pass pastes onto the first person's kept face. No file = the render's own raw, as before. The raw is never changed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { replaceFileSync } from '../replace.ts'
import { rawName } from './run.ts'

export interface FaceKept { passId: string; subject: string; at: string }
export interface FaceState {
  /** the raw the finish starts from, relative to the take's l2r folder */
  source: string
  /** every kept pass, oldest first */
  kept: FaceKept[]
}

export const faceStateFile = (l2rDir: string, renderId: string) => path.join(l2rDir, `${renderId}-face.json`)

export function readFaceState(l2rDir: string, renderId: string): FaceState | null {
  try { const s = JSON.parse(readFileSync(faceStateFile(l2rDir, renderId), 'utf8')) as FaceState; return typeof s?.source === 'string' ? s : null } catch { return null }
}

export function writeFaceState(l2rDir: string, renderId: string, s: FaceState): void {
  const f = faceStateFile(l2rDir, renderId)
  writeFileSync(`${f}.tmp`, JSON.stringify(s, null, 2) + '\n')
  replaceFileSync(`${f}.tmp`, f) // a reader holding it open refuses a bare rename on Windows
}

/** the absolute raw a finish or the next face pass starts from; a state whose file is gone falls back to the raw (never a missing input) */
export function finishSource(l2rDir: string, renderId: string): string {
  const s = readFaceState(l2rDir, renderId)
  const f = s ? path.resolve(l2rDir, s.source) : null
  return f && !path.relative(l2rDir, f).startsWith('..') && existsSync(f) ? f : path.join(l2rDir, `${rawName(renderId)}.mp4`)
}

/** the finish source's name inside the take's l2r folder: what a face pass records it started from, and Keep compares */
export const sourceKeyOf = (l2rDir: string, renderId: string): string => path.relative(l2rDir, finishSource(l2rDir, renderId)).split(path.sep).join('/')
