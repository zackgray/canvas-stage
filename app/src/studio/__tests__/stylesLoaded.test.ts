// Every stylesheet the app ships is loaded by the page (2026-10-29): the cleanup deleted the last importer of a stylesheet and the
// Prompt box lost its width, and a stylesheet whose only importer is dead code styles nothing (the empty stage's "Opening an empty
// stage…" line sat unstyled). This walks the static and dynamic imports from the page's entry and fails on any stylesheet under src
// that the walk never reaches, and on any class live rows still use whose rule went with a deleted stylesheet.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname, '..', '..')
const EXTS = ['.ts', '.tsx', '.js', '.css', '.json']
const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const p = path.resolve(path.dirname(from), spec)
  for (const c of [p, ...EXTS.map((e) => p + e), ...EXTS.map((e) => path.join(p, `index${e}`))]) if (existsSync(c) && statSync(c).isFile()) return c
  return null
}

function reached(): Set<string> {
  const seen = new Set<string>()
  const stack = [path.join(SRC, 'main.tsx')]
  while (stack.length) {
    const f = stack.pop()!
    if (seen.has(f)) continue
    seen.add(f)
    if (!/\.(ts|tsx|js)$/.test(f)) continue
    for (const m of readFileSync(f, 'utf8').matchAll(IMPORT)) {
      const r = resolve(f, m[1] ?? m[2] ?? m[3])
      if (r) stack.push(r)
    }
  }
  return seen
}

const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/')

describe('the stylesheets the app ships are loaded', () => {
  const seen = reached()
  it('every stylesheet under src is imported by a module the page loads', () => {
    const css = walk(SRC).filter((f) => f.endsWith('.css') && !/__tests__|__checks__|__fixtures__/.test(f))
    expect(css.length).toBeGreaterThan(10)
    expect(css.filter((f) => !seen.has(f)).map(rel)).toEqual([])
  })
  it('the rows the cleanup left unstyled have their rules on the page again', () => {
    const rules = [...seen].filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n')
    // the panels' action rows, the Render and Export small buttons, the @ menu's badge, the empty stage's line
    for (const c of ['sd-act', 'sc-small', 'sd-bdg', 'st-setup-vp']) expect(rules, c).toMatch(new RegExp(`\\.${c}\\b`))
  })
})
