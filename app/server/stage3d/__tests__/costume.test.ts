// One neutral figure (stage-only plan, section 6): a new world's performance names no costume, whatever the words or an older
// client's `hero` field say; the old parser's rule still holds for what is written (an extra carries 'modern'); and an old
// performance.json naming a hero costume and old extras still parses, loads as it was saved, and builds the neutral figure.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as THREE from 'three'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Library } from '../../../src/stage3d/motion/library.ts'
import { performerFrom } from '../../../src/stage3d/performer.ts'
import { PLANS, WALK_TOWARD } from '../../../src/stage3d/presets.ts'
import { diskLibrary } from '../../../src/stage3d/__tests__/motion.fixture.ts'
import { draftFrom, planOf } from '../../../src/studio/stage/panels/blocking/blockingPlan.ts'
import { parsePerformancePlan } from '../perf.ts'
import { FILES, KitStore } from '../store.ts'
import { NEW_WALK } from '../strideFitStamp.ts'

let dir = ''
let lib: Library
beforeAll(async () => { lib = await diskLibrary() }, 60_000)
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = '' })
const store = () => new KitStore((dir = mkdtempSync(path.join(os.tmpdir(), 'kit-costume-'))))
const plan = PLANS['open-field-day']

describe('a new world writes no costume', () => {
  it('neither the words nor an older client\'s hero entries put a costume in performance.json', () => {
    const s = store(), at = new Date('2026-10-24T10:00:00Z')
    const words = ['A smoky club. @singer stands centre stage in a sequinned gown.', 'A snowy platform. @guard in plate armour and a long coat.', '']
    words.forEach((description, n) => {
      const w = s.create({ plan, description, hero: ['The singer: a woman in a long gown', '@singer waits.'] }, new Date(at.getTime() + n))
      expect(w.perf).not.toHaveProperty('costume')
      expect(JSON.parse(readFileSync(path.join(s.dir(w.id), FILES.perf), 'utf8'))).not.toHaveProperty('costume')
    })
  })
  it('a performance the request brings is kept as sent', () => {
    const w = store().create({ plan, description: 'a gown', perf: WALK_TOWARD })
    expect(w.perf).toEqual({ ...WALK_TOWARD, ...NEW_WALK }) // a new walk takes the walk's marks (strideFitStamp.ts)
  })
})

describe('old performance files', () => {
  const OLD_EXTRAS = [
    { path: [[-6, -9], [6, -8.4]], gait: 'run', delay: 0.7, costume: 'plain', variant: 2 },
    { path: [[4, -10], [4, -5]], gait: 'walk', delay: 0, costume: 'soldier', variant: 3, tag: 'crowd' },
  ]
  it('the parser still accepts every hero costume an old file holds and every old extra costume, and refuses an unknown one', () => {
    for (const costume of ['modern', 'coat', 'gown', 'plain', 'soldier']) expect(parsePerformancePlan({ ...WALK_TOWARD, costume }).ok).toBe(true)
    const bad = parsePerformancePlan({ ...WALK_TOWARD, costume: 'tunic' })
    expect(bad.ok ? '' : bad.errors.join()).toMatch(/costume must be one of modern, coat, gown/)
    const extras = parsePerformancePlan({ ...WALK_TOWARD, extras: OLD_EXTRAS })
    expect(extras.ok && extras.perf.extras!.map((e) => e.costume)).toEqual(['plain', 'soldier'])
  })

  it('loads as saved (keys hold), survives a Blocking save, and builds the same neutral figures as a costume-free file', () => {
    const s = store(), w = s.create({ plan })
    const old = { path: [[0.6, -12.5], [0.6, -8]], pace: 0.8, costume: 'soldier', castId: 'brann', extras: OLD_EXTRAS }
    writeFileSync(path.join(s.dir(w.id), FILES.perf), JSON.stringify(old))
    const read = s.read(w.id).perf
    expect(read).toMatchObject({ costume: 'soldier', extras: [{ costume: 'plain' }, { costume: 'soldier' }] }) // read and kept, never rewritten
    const resaved = parsePerformancePlan(planOf(read, { ...draftFrom(read), pace: 1 }))
    expect(resaved.ok && resaved.perf).toMatchObject({ costume: 'soldier', extras: [{ costume: 'plain' }, { costume: 'soldier' }] })
    const shape = (p: typeof read) => { const f = performerFrom(p, () => 0, lib); f.poseAt(0.5); const out: unknown[] = []
      f.object.traverse((m) => { if ((m as THREE.Mesh).isMesh) out.push([m.name, ...m.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(5))]) }); return out }
    const { costume: _c, ...plainHero } = read
    expect(shape(read)).toEqual(shape({ ...plainHero, extras: read.extras!.map((e) => ({ ...e, costume: 'modern' as const })) }))
  })
})
