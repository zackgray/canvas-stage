// Prompt wave: the Bible stores the v2 scene brief (briefContract.ts) beside the flat lines, and derives those lines from it so
// every reader keeps working before it reads `bible.brief`. An old Bible (no brief) reads and composes exactly as before.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord, type SceneBriefV2 } from '../../../src/shared/bibleContract.ts'
import { parseBrief } from '../../planner/briefCheck.ts'
import { RUN1_IDEA, RUN1_V2, SLEEK_V2 } from '../../planner/__tests__/v2rig.ts'
import { composePrompt } from '../prompt.ts'
import { handleBible } from '../routes.ts'
import { BibleStore } from '../store.ts'
import { checkDesign } from '../validate.ts'

const WORLD = 'loc-2026-10-25T00-00-00-000'
const world = () => {
  const pub = mkdtempSync(path.join(tmpdir(), 'bible-brief-'))
  mkdirSync(path.join(pub, 'lab-assets', 'locations', WORLD), { recursive: true })
  return { pub, store: new BibleStore(pub) }
}
/** Develop's gate, as the Scene step receives it: the v2 brief rides on the flat one */
const developed = (raw: unknown, idea = ''): SceneBriefV2 => {
  const r = parseBrief(structuredClone(raw), idea)
  if (!r.ok || !r.brief.v2) throw new Error(r.ok ? 'no v2' : r.errors.join('; '))
  return r.brief.v2
}

describe('the v2 brief on the Bible', () => {
  it("a develop answer in the v2 shape validates and saves; the flat lines are derived (run 1's light: a low sun behind her)", async () => {
    const { store } = world()
    const v2 = developed(RUN1_V2, RUN1_IDEA)
    const b = await store.save(WORLD, { prompt: v2.logline, brief: v2 })
    expect(b?.version).toBe(1)
    expect(b?.brief).toEqual(v2)
    expect(b?.lighting).toBe('Low golden sun from behind her, towards the camera, hard warm gold light, a strong rim light on her hair and the comb.')
    expect(b?.lighting).toMatch(/^Low .*sun.* behind her/)
    expect(b?.materials).toBe('Beekeeper: cotton smock, mesh veil, straw hat; Honeycomb frame: pine frame, golden wax comb; Wooden hive: painted pine boxes.')
    expect(b?.background).toBeUndefined() // '' on a Bible that never had the field writes nothing (S2's rule)
    expect((await store.get(WORLD))?.brief?.light.direction).toBe('from behind her, towards the camera')
  })
  it('lines written in the same save win over the derived ones; the same brief again writes no new version; null removes it', async () => {
    const { store } = world()
    const v2 = developed(SLEEK_V2)
    const b = await store.save(WORLD, { brief: v2, lighting: 'My own light.' })
    expect([b?.lighting, b?.materials]).toEqual(['My own light.', 'Architect: charcoal wool, a cotton shirt; Scale model: white card and frosted acrylic, crisp laser-cut edges; Glass table: clear tempered glass on brushed steel legs.'])
    expect((await store.save(WORLD, { brief: v2, lighting: 'My own light.' }))?.version).toBe(1)
    const gone = await store.save(WORLD, { brief: null })
    expect([gone?.version, gone?.brief, gone?.lighting]).toEqual([2, undefined, 'My own light.'])
  })
  it('a sleek brief keeps every condition empty through the store', async () => {
    const { store } = world()
    const b = await store.save(WORLD, { brief: developed(SLEEK_V2) })
    expect(b?.brief?.elements.map((e) => e.condition)).toEqual(['', '', ''])
    expect(b?.materials).not.toMatch(/worn|weathered|aged|rust/i)
  })
  it('a bad brief is refused (400, field named) by the route, and by the free design check', async () => {
    const { store } = world()
    const bad = { ...RUN1_V2, light: { ...RUN1_V2.light, quality: 'golden' } }
    const r = await handleBible({ store }, 'POST', '', new URLSearchParams(), { worldId: WORLD, brief: bad })
    expect(r.status).toBe(400)
    expect((r.body as { error: string }).error).toMatch(/^brief: light\.quality: "golden" must be one of "hard", "soft" or ""/)
    expect(checkDesign({ brief: bad })).toEqual([expect.stringMatching(/light\.quality/)])
    expect(checkDesign({ brief: 'a string' })).toEqual([expect.stringMatching(/brief must be an object in the v2 shape/)])
    const ok = await handleBible({ store }, 'POST', '', new URLSearchParams(), { worldId: WORLD, brief: developed(RUN1_V2) })
    expect([ok.status, (ok.body as { bible: BibleRecord }).bible.brief?.elements[2].tag]).toEqual([200, 'wooden_hive'])
  })
  it('an old Bible (no brief) reads unchanged, saves other lines without gaining one, and composes as before', async () => {
    const { pub, store } = world()
    const OLD: BibleRecord = { worldId: WORLD, version: 3, prompt: 'A muddy field at dusk.', master: null, candidates: [], lighting: 'Low dusk light', materials: 'Wet mud',
      elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' }
    mkdirSync(path.join(pub, biblePaths(WORLD).root), { recursive: true })
    writeFileSync(path.join(pub, biblePaths(WORLD).file), JSON.stringify(OLD))
    expect(await store.get(WORLD)).toEqual(OLD)
    const next = await store.save(WORLD, { lighting: 'Low dusk light' })
    expect(next).toEqual(OLD)
    const lit = await store.save(WORLD, { materials: 'Dry mud' })
    expect(lit && 'brief' in lit).toBe(false)
    expect(composePrompt({ bible: OLD, target: 'video', action: 'He walks' }).text).toBe('Low dusk light. Wet mud. A muddy field at dusk. He walks.')
  })
})
