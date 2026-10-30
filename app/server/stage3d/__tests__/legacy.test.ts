// Wave 0.5 (docs/preproduction-plan-fable.md): extras and entity tags are added to the stage3d contract. A world saved before
// them (no extras, no bible/ folder) still reads, and a performance.json that already carries extras still loads.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ENTITY_TAG_RE, type ExtraPlan, type PerformancePlan } from '../../../src/stage3d/contract.ts'
import { markOf } from '../../../src/stage3d/mark.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { FILES, KitStore } from '../store.ts'
import { NEW_WALK } from '../strideFitStamp.ts'

const pub = mkdtempSync(path.join(tmpdir(), 'kit-legacy-'))
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const PATH: [number, number][] = [[0, -20], [0, 4]]

describe('stage3d contract, Wave 0.5', () => {
  it('a world without extras or a Bible reads as before', () => {
    const s = new KitStore(pub)
    const ON: [number, number][] = [markOf(BATTLEFIELD).at, PATH[1]] // starts on the mark: create() snaps a supplied start there (F2)
    const w = s.create({ plan: BATTLEFIELD, perf: { path: ON, pace: 0.9 } })
    const perfFile = path.join(s.dir(w.id), FILES.perf)
    // a new walk takes the walk's marks (strideFitStamp.ts); nothing else is added
    expect(JSON.parse(readFileSync(perfFile, 'utf8'))).toEqual({ path: ON, pace: 0.9, ...NEW_WALK })
    expect(s.read(w.id).perf).toEqual({ path: ON, pace: 0.9, ...NEW_WALK })
  })

  it('a performance.json carrying extras still loads (the hero is unchanged)', () => {
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD, perf: { path: PATH } })
    const extra: ExtraPlan = { path: [[-8, -10], [8, -10]], gait: 'walk', delay: 1.5, costume: 'plain', variant: 2, tag: 'villagers' }
    const perf: PerformancePlan = { path: PATH, extras: [extra] }
    writeFileSync(path.join(s.dir(w.id), FILES.perf), JSON.stringify(perf))
    expect(s.read(w.id).perf.path).toEqual(PATH)
  })

  it('entity tags: hero, extra:<n>:<variant>, creature:<tag>, prop:<tag>', () => {
    for (const ok of ['hero', 'extra:0:5', 'extra:12:0', 'creature:dragon', 'prop:cart_2']) expect(ok).toMatch(ENTITY_TAG_RE)
    for (const bad of ['', 'Hero', 'extra:1', 'extra:a:1', 'creature:', 'creature:@dragon', 'prop:Cart', 'world']) expect(bad).not.toMatch(ENTITY_TAG_RE)
  })
})
