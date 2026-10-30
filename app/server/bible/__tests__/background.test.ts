// S2: the Bible's background ACTION line (add-only). Saved and versioned like lighting; composePrompt puts it in still and
// Render prompts after the action; an old Bible without the field composes exactly as before and is not re-versioned.
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import { composePrompt } from '../prompt.ts'
import { BibleStore } from '../store.ts'

const WORLD = 'loc-2026-10-24T00-00-00-000'
const OLD: BibleRecord = { worldId: WORLD, version: 2, prompt: 'A muddy field at dusk.', master: null, candidates: [], lighting: 'Low dusk light', materials: 'Wet mud',
  elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' }

describe('the background action line', () => {
  it('both targets carry it after the action; an old Bible (no field) composes as before', () => {
    const b = { ...OLD, background: 'soldiers fighting and running in the smoke far behind him' }
    for (const target of ['still', 'video'] as const) {
      expect(composePrompt({ bible: b, target, action: 'He walks toward us' }).text)
        .toBe('Low dusk light. Wet mud. A muddy field at dusk. He walks toward us. Soldiers fighting and running in the smoke far behind him.')
    }
    expect(composePrompt({ bible: OLD, target: 'video', action: 'He walks' }).text).toBe('Low dusk light. Wet mud. A muddy field at dusk. He walks.')
  })
  it('saved like lighting (a new version, length-limited); an empty line on an old Bible writes nothing', async () => {
    const pub = mkdtempSync(path.join(tmpdir(), 'bible-bg-'))
    mkdirSync(path.join(pub, 'lab-assets', 'locations', WORLD), { recursive: true })
    const store = new BibleStore(pub)
    const v1 = await store.save(WORLD, { prompt: 'A field.' })
    expect(v1?.background).toBeUndefined()
    expect((await store.save(WORLD, { background: '' }))?.version).toBe(1)
    const v2 = await store.save(WORLD, { background: 'villagers fleeing far behind' })
    expect([v2?.version, v2?.background]).toEqual([2, 'villagers fleeing far behind'])
    expect((await store.save(WORLD, { background: '' }))?.background).toBe('')
    expect(() => store.save(WORLD, { background: 'x'.repeat(301) })).toThrow(/longer than 300/)
  })
})
