/**
 * The free face count of a drawn still (plan-draw-from-master §4): scripts/hero/count_faces.py on the app's one Python, with the
 * tracked YuNet model the clay uses (server/clay/service.ts defaultYunet). Only ever a hint for the judge: when Python, the script
 * or the model is missing, or the run fails, the answer is null, never an error, so Approve keeps working without Python.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultYunet } from '../clay/service.ts'
import type { RunPython } from './colorMatch.ts'
import type { FaceBox } from './redrawSpec.ts'

export interface FaceDeps { appDir: string; python: () => string | undefined; run: RunPython }

/** the hero deps as the count's: undefined (no count) unless the app folder and a Python runner are there */
export const faceDepsOf = (d: { python?: () => string | undefined; runPython?: RunPython; appDir?: string }): FaceDeps | undefined =>
  d.python && d.runPython && d.appDir ? { appDir: d.appDir, python: d.python, run: d.runPython } : undefined

/** faces found in `file`, or null when they could not be counted */
export async function countFaces(d: FaceDeps, file: string): Promise<{ seen: number; boxes: FaceBox[] } | null> {
  const script = path.join(d.appDir, 'scripts', 'hero', 'count_faces.py')
  const yunet = process.env.CLAY_YUNET || defaultYunet(d.appDir)
  const python = d.python()
  if (!python || !existsSync(script) || !existsSync(yunet)) return null
  // the sidecar goes to the OS temp dir, never the hero folder (a failed run must not leave a file among the stills)
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'faces-')), out = path.join(tmp, 'faces.json')
  try {
    await d.run(python, [script, '--in', file, '--yunet', yunet, '--json', out])
    const j = JSON.parse(readFileSync(out, 'utf8')) as { seen?: unknown; boxes?: unknown }
    if (typeof j.seen !== 'number' || !Array.isArray(j.boxes)) return null
    return { seen: j.seen, boxes: j.boxes as FaceBox[] }
  } catch { return null } finally { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* nothing to clean */ } }
}
