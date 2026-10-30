// One Python setting for the finish and the massing clay; the first-run check and the plain "needs scikit-image" sentences.
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { whyPython } from '../l2r/finish.ts'
import { buildMassing } from '../pieces/massing.ts'
import { legacyPythonValue, pythonPath } from '../python.ts'
import { checkPython, explainImportError, reportLines } from '../pythonCheck.ts'

const saved = { ...process.env }
afterEach(() => { process.env = { ...saved } })
const clean = () => { delete process.env.CANVAS_PYTHON; delete process.env.LIFT_PYTHON }

describe('one Python setting', () => {
  it('the finish and the massing clay read the same lookup: CANVAS_PYTHON wins, LIFT_PYTHON still works', () => {
    clean()
    const exe = path.join(mkdtempSync(path.join(os.tmpdir(), 'py-')), 'python.exe'); writeFileSync(exe, '')
    expect(pythonPath(undefined)).toBe('python')
    expect(pythonPath(exe)).toBe(exe)
    process.env.LIFT_PYTHON = exe; expect(pythonPath(undefined)).toBe(exe)
    process.env.CANVAS_PYTHON = 'py3'; expect(pythonPath(exe)).toBe('py3')
    expect(legacyPythonValue('passed', {})).toBe('passed')
    expect(legacyPythonValue(undefined, {})).toBeUndefined()
  })

  it('massing runs on that Python, not on LIFT_PYTHON alone', async () => {
    clean(); process.env.CANVAS_PYTHON = 'the-one'
    const ran: string[] = []
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ms-'))
    const script = path.join(dir, 'scripts', 'pieces', 'massing.py')
    const { mkdirSync } = await import('node:fs'); mkdirSync(path.dirname(script), { recursive: true }); writeFileSync(script, '#')
    await buildMassing({ appDir: dir, python: () => pythonPath('lift-venv'), run: async (py) => { ran.push(py) } }, 'barrel', 'a.glb', path.join(dir, 'out.glb'))
    expect(ran).toEqual(['the-one'])
  })
})

describe('first-run check', () => {
  const present = { cv2: true, numpy: true, trimesh: true, scipy: true, skimage: false }
  it('names each optional piece that cannot run, in plain words', async () => {
    const r = await checkPython('py', '/app', async () => JSON.stringify(present))
    expect(r.missing.map((m) => m.feature.key)).toEqual(['massing'])
    const lines = reportLines(r)
    expect(lines[0]).toContain('needs scikit-image')
    expect(lines[0]).toContain('see SETUP.md')
    expect(reportLines(await checkPython('py', '/app', async () => JSON.stringify({ ...present, skimage: true })))).toEqual([])
  })

  it('a Python that will not start is one readable line, never a throw', async () => {
    const r = await checkPython('nope', '/app', async () => { throw new Error('spawn nope ENOENT') })
    expect(reportLines(r)[0]).toMatch(/could not start nope.*CANVAS_PYTHON/)
  })

  it('a missing module surfaces as the piece that needs it (finish error, massing note)', async () => {
    expect(explainImportError("No module named 'torch'")).toBeNull() // nothing in the app needs torch
    expect(explainImportError("No module named 'skimage'")).toContain('scikit-image')
    expect(explainImportError('something else')).toBeNull()
    expect(whyPython('py', new Error("No module named 'skimage'"))).toMatch(/^The massing clay.*scikit-image/)
    expect(whyPython('py', new Error("No module named 'cv2'"))).toMatch(/has no cv2\/numpy/)
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ms-'))
    const { mkdirSync } = await import('node:fs'); mkdirSync(path.join(dir, 'scripts', 'pieces'), { recursive: true }); writeFileSync(path.join(dir, 'scripts', 'pieces', 'massing.py'), '#')
    const why = await buildMassing({ appDir: dir, python: () => 'py', run: async () => { throw new Error("No module named 'trimesh'") } }, 'barrel', 'a.glb', path.join(dir, 'o.glb'))
    expect(why).toContain('The massing clay for built pieces needs trimesh')
  })
})

describe('the Python setting is read in one place', () => {
  it('no plugin, script runner or the dev config reads LIFT_PYTHON itself: server/python.ts is the only reader', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const app = path.resolve(import.meta.dirname, '..', '..')
    const files = (readdirSync(path.join(app, 'server'), { recursive: true }) as string[])
      .filter((f) => /\.ts$/.test(f) && !/__tests__/.test(f) && path.basename(f) !== 'python.ts').map((f) => path.join(app, 'server', f))
    const direct = /process\.env\.LIFT_PYTHON|loadEnv\([^)]*'LIFT_'/
    expect(files.filter((f) => direct.test(readFileSync(f, 'utf8'))).map((f) => path.relative(app, f))).toEqual([])
    expect(readFileSync(path.join(app, 'vite.config.ts'), 'utf8')).not.toMatch(/env.LIFT_PYTHON/)
  })
})
