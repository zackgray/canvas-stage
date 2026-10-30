// The browser bundle must never reach a Node-only module. A src file may import a server file for its constants or types, but
// that file and everything it imports must stay free of node: modules (Vite throws at load and the page goes blank).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const APP = path.resolve(__dirname, '..', '..')
/** a Node builtin by either spelling: 'node:fs', or the bare 'fs' / 'fs/promises' / 'child_process' (Fable review: only node: was caught) */
const BUILTIN = new Set(builtinModules)
export const isNodeBuiltin = (spec: string): boolean => spec.startsWith('node:') || BUILTIN.has(spec) || BUILTIN.has(spec.split('/')[0])
const IMPORT = /(?:import(?!\s+type\b)|export(?!\s+type\b))\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '__tests__' || n.startsWith('.')) continue
    const f = path.join(dir, n)
    if (statSync(f).isDirectory()) files(f, out)
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(f)
  }
  return out
}
const local = (from: string, spec: string) => {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), spec)
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try { if (statSync(c).isFile()) return c } catch { /* next candidate */ }
  }
  return base
}

describe('browser boundary', () => {
  it('a bare builtin is a Node import too; a package or a local file is not', () => {
    expect(['node:fs', 'fs', 'fs/promises', 'path', 'child_process', 'os'].every(isNodeBuiltin)).toBe(true)
    expect(['three', 'react', './fs', '../path.ts', 'three/addons/controls/OrbitControls.js'].some(isNodeBuiltin)).toBe(false)
  })
  it('no src file reaches a node: import through the server files it imports', () => {
    const offenders: string[] = []
    for (const f of files(path.join(APP, 'src'))) {
      const seen = new Set<string>()
      const walk = (file: string, via: string) => {
        if (seen.has(file)) return
        seen.add(file)
        let text = ''
        try { text = readFileSync(file, 'utf8') } catch { return }
        for (const m of text.matchAll(IMPORT)) {
          const spec = m[1] ?? m[2]
          if (isNodeBuiltin(spec)) { if (file.includes(`${path.sep}server${path.sep}`)) offenders.push(`${path.relative(APP, f)} -> ${path.relative(APP, file)} (${spec})`); continue }
          const t = local(file, spec)
          if (t && t.includes(`${path.sep}server${path.sep}`)) walk(t, via)
          else if (t && file.includes(`${path.sep}server${path.sep}`)) walk(t, via)
        }
      }
      for (const m of readFileSync(f, 'utf8').matchAll(IMPORT)) {
        const t = local(f, m[1] ?? m[2])
        if (t && t.includes(`${path.sep}server${path.sep}`)) walk(t, f)
      }
    }
    expect(offenders).toEqual([])
  })
})
