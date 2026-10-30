import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { envValue } from './comfy/envValue.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The ONE Python the app runs (clay video, hero-still colour match, Render finishing, the massing clay):
 * CANVAS_PYTHON, else `value` (the dev server's LIFT_PYTHON, the older name), else LIFT_PYTHON from the environment, else `python`
 * on the PATH. scripts/requirements.txt lists what it needs; the finish alone needs only OpenCV and numpy, and a missing optional
 * piece is named when it is used (pythonCheck.ts). A bare command name is trusted; a path must exist.
 */
export function pythonFor(value: string | undefined): { python: string } | { error: string } {
  const chosen = envValue('CANVAS_PYTHON') ?? value?.trim() ?? envValue('LIFT_PYTHON') ?? 'python'
  const isPath = /[\\/]/.test(chosen)
  if (isPath && !existsSync(chosen)) return { error: `CANVAS_PYTHON points at ${chosen}, which does not exist: set it to your Python (it needs OpenCV and numpy), or remove it to use the python on your PATH` }
  return { python: chosen }
}

/** the old name's value as a plugin sees it: passed in by vite.config, else LIFT_PYTHON in the mode's .env files */
export function legacyPythonValue(passed: string | undefined, cfg: { mode?: string; envDir?: string | false }): string | undefined {
  return passed ?? (cfg.mode ? loadEnv(cfg.mode, cfg.envDir || APP, 'LIFT_').LIFT_PYTHON : undefined)
}

/** `pythonFor`, as the lazy lookup the steps take: the path, or undefined when the setting points at nothing */
export function pythonPath(value: string | undefined): string | undefined {
  const p = pythonFor(value ?? process.env.LIFT_PYTHON)
  return 'python' in p ? p.python : undefined
}
