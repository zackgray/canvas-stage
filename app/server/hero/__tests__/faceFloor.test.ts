// The face-count floor in scripts/hero/count_faces.py: low-confidence or tiny hits (tree canopy, fabric) are not faces.
// Runs the script's own clears_floor with the app's Python (LIFT_PYTHON, else python); skipped when OpenCV is not importable.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPTS = path.join(process.cwd(), 'scripts', 'hero')
const PY = process.env.LIFT_PYTHON || 'python'
const floor = (w: number, h: number, score: number, shorter: number): boolean | null => {
  try {
    const out = execFileSync(PY, ['-c', `import sys; sys.path.insert(0, sys.argv[1]); import count_faces as c; print(c.clears_floor(${w}, ${h}, ${score}, ${shorter}))`, SCRIPTS], { encoding: 'utf8' })
    return out.trim() === 'True'
  } catch { return null }
}
const ready = floor(100, 100, 0.95, 1000) !== null

describe.skipIf(!ready)('the face-count floor', () => {
  it('keeps a real face (0.92, 74 px on a 1080 px short side)', () => expect(floor(74, 89, 0.92, 1080)).toBe(true))
  it('drops a low-confidence hit (0.76) even when it is big', () => expect(floor(90, 90, 0.76, 1080)).toBe(false))
  it('drops a tiny hit (21 px on 1080 is under 3%) even when confident', () => expect(floor(21, 25, 0.95, 1080)).toBe(false))
  it('measures size against the shorter side, so the same box passes on a small image', () => expect(floor(21, 25, 0.95, 500)).toBe(true))
})
