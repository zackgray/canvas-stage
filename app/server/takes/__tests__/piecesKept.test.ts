// A take's set copy names its built pieces by URL (locations/<w>/pieces/<kind>/p-<stamp>/{mesh,massing}.glb), so nothing may delete
// a built piece's folder (PLAN-PER-TAKE-SET.md, risk 4). Pinned two ways: every recursive delete in the server is one of a known
// few, and the only one under pieces/ is the failed-submit cleanup of a build that never started (pieces/run.ts, nothing billed);
// and taking a piece out of the plan, resetting the set or sweeping orphan worlds leaves a built world's piece folders on disk.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { resetToBuilt } from '../../stage3d/builtPlan.ts'
import { FILES } from '../../stage3d/store.ts'
import { tempPub } from './takePerfFixture.ts'
import { setPlan, setWorld } from './takeSetFixture.ts'

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n)
    if (statSync(f).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : sources(f)
    return /\.(ts|mts|js|mjs)$/.test(n) && !/\.test\./.test(n) ? [f] : []
  })
}

/** every recursive delete in the server, and why it cannot reach a placed piece */
const KNOWN: Record<string, string> = {
  'pieces/run.ts': 'a build refused before submit (nothing billed, never placed): its own new p-<stamp> folder',
  'stage3d/store.ts': 'sweepOrphans: a kit world with no still after 30 min (its master render failed; no take or piece can be on it)',
  'scene/concepts.ts': 'a concept draw refused before submit: its own new folder',
  'planner/store.ts': 'a planner run folder',
  'hero/faceCount.ts': 'its own temp folder',
}

describe('no route deletes a built piece folder', () => {
  it('every recursive delete in the server is a known one', () => {
    const found = new Set<string>()
    for (const f of sources(SERVER)) {
      const text = readFileSync(f, 'utf8')
      if (/\b(rm|rmSync|rmdir|rmdirSync)\s*\([^\n]*recursive\s*:\s*true/.test(text)) found.add(path.relative(SERVER, f).replace(/\\/g, '/'))
    }
    expect([...found].sort()).toEqual(Object.keys(KNOWN).sort())
  })

  it('under pieces/ the only delete of a folder is the failed-submit cleanup, once', () => {
    const run = readFileSync(path.join(SERVER, 'pieces', 'run.ts'), 'utf8')
    const hits = run.split('\n').filter((l) => /\brm\s*\(/.test(l))
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatch(/isFreeRefusal\(e\) \|\| \(e instanceof JobError && !e\.jobId && e\.code === 'submit'\)\) await rm\(dir, \{ recursive: true/)
  })

  const pubs: string[] = []
  afterAll(() => pubs.forEach((p) => rmSync(p, { recursive: true, force: true })))
  it('taking a piece out, resetting the set and sweeping orphans leave a built world\'s piece folders', () => {
    const p = tempPub('pieces'); pubs.push(p)
    const w = setWorld(p)
    const dir = path.join(w.store.dir(w.id), 'pieces', 'crates', 'p-20261029120000-abcd')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'mesh.glb'), 'glb')
    writeFileSync(path.join(w.store.dir(w.id), FILES.still), 'png') // a built world: it has its still
    w.store.movePiece(w.id, { index: 0, kind: setPlan.kit[0].kind, remove: true })
    resetToBuilt(w.store, w.id)
    w.store.sweepOrphans(new Date('2030-01-01T00:00:00.000Z'))
    expect(existsSync(path.join(dir, 'mesh.glb'))).toBe(true)
  })
})
