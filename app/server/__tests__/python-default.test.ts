// Python for the local steps: CANVAS_PYTHON, the older LIFT_PYTHON, else `python` on the PATH; plain texts; the hero colour match says so.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { colorMatch } from '../hero/colorMatch.ts'
import { pythonFor } from '../python.ts'

const saved = { ...process.env }
afterEach(() => { process.env = { ...saved } })
const clean = () => { delete process.env.CANVAS_PYTHON; delete process.env.LIFT_PYTHON }

describe('pythonFor', () => {
  it('uses the python on PATH when nothing is set', () => { clean(); expect(pythonFor(undefined)).toEqual({ python: 'python' }) })

  it('CANVAS_PYTHON wins; LIFT_PYTHON (value or environment) still works', () => {
    clean()
    const exe = path.join(mkdtempSync(path.join(os.tmpdir(), 'py-')), 'python.exe'); writeFileSync(exe, '')
    expect(pythonFor(exe)).toEqual({ python: exe })
    process.env.LIFT_PYTHON = exe; expect(pythonFor(undefined)).toEqual({ python: exe })
    process.env.CANVAS_PYTHON = 'py3'; expect(pythonFor(exe)).toEqual({ python: 'py3' })
  })

  it('a path that does not exist is refused without mentioning torch, CUDA or a lift venv', () => {
    clean(); process.env.CANVAS_PYTHON = path.join(os.tmpdir(), 'nope', 'python.exe')
    const r = pythonFor(undefined) as { error: string }
    expect(r.error).toMatch(/does not exist/)
    expect(r.error).not.toMatch(/torch|CUDA|SAM|MoGe|lift/i)
  })
})

describe('hero colour match without Python', () => {
  it('says plainly that it was skipped when no Python is found, never failing the still', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cm-'))
    const png = path.join(dir, 'a.png'); writeFileSync(png, 'x')
    const script = path.join(dir, 'scripts', 'l2r', 'colormatch.py')
    mkdirSync(path.dirname(script), { recursive: true }); writeFileSync(script, '#')
    const t = { file: png, url: '/m.png' }
    const none = await colorMatch({ appDir: dir, python: () => undefined, run: async () => {} }, png, t)
    const enoent = await colorMatch({ appDir: dir, python: () => 'python', run: async () => { throw new Error('spawn python ENOENT') } }, png, t)
    for (const g of [none, enoent]) {
      expect(g.skipped).toMatch(/Python was not found/)
      expect(g.skipped).toMatch(/keeps its own colours/)
      expect(g.skipped).not.toMatch(/LIFT_PYTHON|torch/)
    }
  })
})
