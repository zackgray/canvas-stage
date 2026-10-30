/**
 * A built piece's massing clay (E139), free and local: scripts/pieces/massing.py on the downloaded mesh, with the piece kind's
 * pitch and dilation at its real size. Never a reason to fail a paid piece: no Python, no script or a failing run place the piece
 * without a massing mesh (the massing clay export then uses the precise one) and say why on piece.json.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pieceKindOf } from '../../src/stage3d/pieceKinds.ts'
import { explainImportError } from '../pythonCheck.ts'
import type { RunPython } from '../hero/colorMatch.ts'

export const MASSING_SCRIPT = 'scripts/pieces/massing.py'

export interface MassingDeps { appDir: string; python: () => string | undefined; run: RunPython }

/** writes `out` from `mesh`; returns null when written, else why not (one sentence) */
export async function buildMassing(d: MassingDeps, noun: string, mesh: string, out: string): Promise<string | null> {
  const script = path.join(d.appDir, MASSING_SCRIPT)
  if (!existsSync(script)) return `${MASSING_SCRIPT} is missing`
  const python = d.python()
  if (!python) return 'no Python for the massing clay (set CANVAS_PYTHON to a Python with trimesh, scipy and scikit-image: pip install -r scripts/requirements.txt)'
  const k = pieceKindOf(noun)
  try {
    await d.run(python, [script, '--in', mesh, '--out', out, '--size', String(k.size), '--pitch', String(k.pitch), '--dilate', String(k.dilate)])
    return existsSync(out) ? null : 'the massing script wrote nothing'
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    return explainImportError(msg) ?? `the massing clay did not build: ${msg.slice(-200)}`
  }
}
