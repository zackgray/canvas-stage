/**
 * The free colour-match of a drawn still (plan §3.3), with track D's script by the name and arguments fixed in Wave 0.5:
 *   <CANVAS_PYTHON> scripts/l2r/colormatch.py --target <png> --in <png> --out <png>   (reinhard LAB; exit 0 = written)
 * Never a reason to fail a paid still: no target, no script (track D not merged yet), no Python or a failing run all leave the
 * draw as it was and say why on the still (`grade.skipped`).
 */
import { existsSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import path from 'node:path'
import { COLORMATCH } from '../../src/shared/shotContract.ts'
import type { StillGrade } from './kitSpec.ts'

/** runs `python args…`; rejects with the child's stderr (server/l2r/finish.ts runPython has this shape) */
export type RunPython = (python: string, args: string[]) => Promise<void>

const NO_PYTHON = 'the colour match was skipped because Python was not found, so this still keeps its own colours. Install Python with OpenCV and numpy (or set CANVAS_PYTHON to it) and restart.'

export interface ColorMatchDeps { appDir: string; python: () => string | undefined; run: RunPython }

/** Matches `file` in place to `target`'s colour. `targetUrl` is what the still records (a public path). */
export async function colorMatch(d: ColorMatchDeps, file: string, target: { file: string; url: string } | null): Promise<StillGrade> {
  const method = COLORMATCH.method
  if (!target || !existsSync(target.file)) return { target: null, method, skipped: 'no master or opening still to match to yet' }
  const script = path.join(d.appDir, COLORMATCH.script)
  if (!existsSync(script)) return { target: target.url, method, skipped: `${COLORMATCH.script} is not installed` }
  const python = d.python()
  if (!python) return { target: target.url, method, skipped: NO_PYTHON }
  const out = file.replace(/\.png$/i, '-cm.png')
  try {
    await d.run(python, [script, '--target', target.file, '--in', file, '--out', out])
    if (!existsSync(out)) return { target: target.url, method, skipped: 'the colour-match wrote nothing' }
    await rename(out, file)
    return { target: target.url, method }
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    if (/ENOENT/.test(msg)) return { target: target.url, method, skipped: NO_PYTHON }
    return { target: target.url, method, skipped: `the colour match did not run, so this still keeps its own colours: ${msg.slice(-200)}` }
  }
}
