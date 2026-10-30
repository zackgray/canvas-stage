/**
 * What the app's one Python can do. The finish needs OpenCV and numpy; one piece is optional and needs more (the massing clay of a
 * generated piece: trimesh + scipy + scikit-image). scripts/check_python.py
 * lists which modules import; the dev server logs the gaps at start, and a step that fails on a missing module says which piece
 * needs it, in the sentence the owner reads, instead of a Python traceback.
 */
import { execFile } from 'node:child_process'
import path from 'node:path'

export interface PyFeature { key: 'finish' | 'face' | 'massing'; label: string; modules: string[] }
export const PY_FEATURES: PyFeature[] = [
  { key: 'finish', label: 'The Render finish and hero-still colour match', modules: ['cv2', 'numpy'] },
  { key: 'face', label: 'The face detail pass', modules: ['cv2', 'numpy'] },
  { key: 'massing', label: 'The massing clay for built pieces', modules: ['trimesh', 'scipy', 'skimage'] },
]
const PIP: Record<string, string> = { cv2: 'opencv-python', skimage: 'scikit-image' }
export const pipName = (m: string): string => PIP[m] ?? m

/** "The massing clay for built pieces needs trimesh + scipy + scikit-image — see SETUP.md" */
export const needsMessage = (f: PyFeature, only?: string[]): string =>
  `${f.label} needs ${(only ?? f.modules).map(pipName).join(' + ')} in the app's Python — see SETUP.md`

/** the plain sentence for a Python "No module named 'x'" (null for any other error); only the optional pieces: the finish has its own */
export function explainImportError(msg: string): string | null {
  const mod = /No module named '?(\w+)/.exec(msg)?.[1]
  const f = mod ? PY_FEATURES.find((x) => x.key === 'massing' && x.modules.includes(mod)) : undefined
  return f && mod ? needsMessage(f, [mod]) : null
}

export interface PythonReport { python: string; present: Record<string, boolean>; missing: { feature: PyFeature; modules: string[] }[]; error?: string }
export type Exec = (python: string, args: string[]) => Promise<string>

const exec: Exec = (python, args) => new Promise((resolve, reject) => {
  execFile(python, args, { windowsHide: true, timeout: 60_000 }, (err, out) => (err ? reject(err) : resolve(String(out))))
})

/** runs scripts/check_python.py; resolves a report, never rejects (a Python that will not start is an `error`) */
export async function checkPython(python: string, appDir: string, run: Exec = exec): Promise<PythonReport> {
  try {
    const present = JSON.parse(await run(python, ['-I', path.join(appDir, 'scripts', 'check_python.py'), '--json'])) as Record<string, boolean>
    const missing = PY_FEATURES.map((feature) => ({ feature, modules: feature.modules.filter((m) => !present[m]) })).filter((x) => x.modules.length)
    return { python, present, missing }
  } catch (e) {
    return { python, present: {}, missing: [], error: `could not start ${python} to check it: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}` }
  }
}

/** the start-up lines: nothing when whole; one line per gap, each saying which piece fails and what to install */
export function reportLines(r: PythonReport): string[] {
  if (r.error) return [`[python] ${r.error} (set CANVAS_PYTHON; see SETUP.md${process.platform === 'win32' ? "; on Windows the Store `python` stub does not run: point CANVAS_PYTHON at your venv's python.exe" : ''})`]
  return r.missing.map((x) => `[python] ${needsMessage(x.feature, x.modules)} (pip install -r app/scripts/requirements.txt into ${r.python})`)
}

/** at plugin start, once per process: log the gaps (never under tests: no child process, no console noise) */
export function logPythonGaps(python: string | undefined, appDir: string, log: (line: string) => void = (l) => console.warn(l)): void {
  if (process.env.VITEST || !python) return
  const g = globalThis as Record<symbol, boolean | undefined>, key = Symbol.for('canvas-stage.python.checked')
  if (g[key]) return
  g[key] = true
  void checkPython(python, appDir).then((r) => { for (const l of reportLines(r)) log(l) })
}
