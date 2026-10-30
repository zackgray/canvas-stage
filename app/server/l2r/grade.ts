/**
 * The grade to the Bible's master: an optional, free finish step, first in the chain (grade -> sharpen -> grain).
 * Track D's scripts/l2r/colormatch.py (COLORMATCH) matches the raw clip's colour to the master (reinhard in LAB); Wave 0 P0 found
 * a full match flattens drama, so the script blends it in at `strength` (default 0.7) itself, in LAB. The target, method,
 * Bible version and strength are recorded on the render when it is made, so "Finish again" regrades the same way and an old
 * render (no `grade`) finishes exactly as before.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import { COLORMATCH } from '../../src/shared/shotContract.ts'
import { GRADE_DEFAULT, type GradeRecord } from '../../src/shared/keyframeContract.ts'
import { httpError } from './spec.ts'

export const GRADE_MIN = 0.1

/** the master the grade matches to: the Bible's own grade target, else its approved master */
export function gradeTarget(bible: BibleRecord | null): { png: string; bibleVersion: number } | null {
  const png = bible?.grade?.target || bible?.master?.png
  return bible && png ? { png, bibleVersion: bible.version } : null
}

/** the grade a render records, from the request's `grade` (absent = none); refused (free) when there is no master or a bad strength */
export function resolveGrade(bible: BibleRecord | null, want: unknown): GradeRecord | undefined {
  if (want === undefined || want === null || want === false) return undefined
  const o = (typeof want === 'object' ? want : {}) as { strength?: unknown }
  const strength = o.strength === undefined ? GRADE_DEFAULT : Number(o.strength)
  if (!Number.isFinite(strength) || strength < GRADE_MIN || strength > 1) throw httpError(400, `grade strength must be ${GRADE_MIN} to 1`, 'bad_request')
  const t = gradeTarget(bible)
  if (!t) throw httpError(409, 'There is no approved master to grade to: turn the grade off.', 'no_master')
  return { target: t.png, method: COLORMATCH.method, bibleVersion: t.bibleVersion, strength: Math.round(strength * 100) / 100 }
}

/** the master's file, kept inside the public dir */
export function targetFile(publicDir: string, target: string): string {
  const f = path.resolve(publicDir, target.replace(/^\/+/, ''))
  if (path.relative(path.resolve(publicDir), f).startsWith('..') || !existsSync(f)) throw httpError(409, `The grade target ${target} is not on disk: finish without the grade.`, 'no_master')
  return f
}

/** colormatch.py on the raw clip at the recorded strength (the script blends in LAB; frame count preserved) */
export const colormatchArgs = (script: string, target: string, input: string, out: string, strength: number, fps: number): string[] =>
  [script, '--target', target, '--in', input, '--out', out, '--strength', String(strength), '--fps', String(fps)]
