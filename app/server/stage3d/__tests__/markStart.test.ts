// Wave A (S4): the mark is the walk's first point. A performance save snaps the path start onto the mark and never writes the plan,
// so the set approval key (a hash of the plan) does not move; moving the mark moves the start; old performances read back as saved.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { markOf } from '../../../src/stage3d/mark.ts'
import { standPath } from '../../../src/stage3d/motion/standPlan.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { FILES, KitStore } from '../store.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-markstart-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const mk = (perf: object) => { const s = new KitStore(pub); return { s, w: s.create({ plan: BATTLEFIELD, perf }) } }
const WALK: [number, number][] = [[0, -20], [0, 4]]

describe('the mark is the walk start', () => {
  it('create() snaps a supplied performance onto the mark (walk and stand), as the saves do; the default is a stand built on the mark', () => {
    const { s, w } = mk({ path: [[5, 5], [1, 1]], pace: 0.8 })
    const at = markOf(w.plan).at
    expect(w.perf.path).toEqual([at, [1, 1]])
    expect(JSON.parse(readFileSync(path.join(s.dir(w.id), FILES.perf), 'utf8')).path).toEqual([at, [1, 1]])
    expect(mk({ path: [[9, 9], [9, 9.2]], stand: true }).w.perf.path).toEqual(standPath(markOf(w.plan)))
    const plain = new KitStore(pub).create({ plan: BATTLEFIELD })
    expect(plain.perf.path[0]).toEqual([0.6, -12.5])
  })

  it('moves the start with the mark even when the start was somewhere else', () => {
    const { s, w } = mk({ path: WALK })
    const moved = s.setMark(w.id, { at: [2, -9], yawDeg: 90 })
    expect(moved.perf.path[0]).toEqual([2, -9])
    expect(moved.perf.path[1]).toEqual([0, 4])
  })

  it('a Blocking save with the start off the mark snaps it, and the set approval key is unchanged', () => {
    const { s, w } = mk({ path: WALK })
    const key = setKeyOf(s.read(w.id).plan), planBefore = readFileSync(path.join(s.dir(w.id), FILES.plan), 'utf8')
    const saved = s.savePerformance(w.id, { path: [[5, 5], [1, 1], [2, 2]], pace: 0.8 })
    expect(saved.perf.path).toEqual([markOf(saved.plan).at, [1, 1], [2, 2]])
    expect(saved.perf.pace).toBe(0.8)
    expect(setKeyOf(saved.plan)).toBe(key)
    expect(readFileSync(path.join(s.dir(w.id), FILES.plan), 'utf8')).toBe(planBefore)
  })

  it('a standing hero keeps the stub rebuilt from the mark, on a save and when the mark turns', () => {
    const { s, w } = mk({ path: WALK })
    const saved = s.savePerformance(w.id, { path: [[9, 9], [9, 9.2]], stand: true })
    expect(saved.perf.path).toEqual(standPath(markOf(saved.plan)))
    const turned = s.setMark(w.id, { at: [1, -8], yawDeg: 90 })
    expect(turned.perf.path).toEqual(standPath({ at: [1, -8], yawDeg: 90 }))
    expect(turned.perf.stand).toBe(true)
  })

  it('reads an old performance back as saved (no snap on read) and the plan stays as it was', () => {
    const { s, w } = mk({ path: WALK })
    const legacy = { path: [[3, 3], [4, 4]], pace: 0.8, actions: [{ kind: 'kneel', at: 4.5, seconds: 2 }], costume: 'soldier' }
    writeFileSync(path.join(s.dir(w.id), FILES.perf), JSON.stringify(legacy))
    expect(s.read(w.id).perf).toEqual(legacy)
  })
})
