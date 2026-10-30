// m6 (Wave 2 review): bible.json lost or corrupt while versions/ remains: the store reads the newest saved version and the next
// save writes the version after it, instead of a 500 or "version 1 already exists" for ever.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BibleStore } from '../store.ts'

const WORLD = 'loc-2026-10-24T00-00-00-000'
async function twoVersions() {
  const pub = mkdtempSync(path.join(tmpdir(), 'bible-rec-'))
  mkdirSync(path.join(pub, 'lab-assets', 'locations', WORLD), { recursive: true })
  const store = new BibleStore(pub)
  await store.save(WORLD, { prompt: 'A field.' })
  await store.save(WORLD, { prompt: 'A field at dusk.' })
  return { store, file: path.join(pub, 'lab-assets', 'locations', WORLD, 'bible', 'bible.json') }
}

describe('Bible store recovery', () => {
  it('bible.json missing: the newest version reads, and the next save is the version after it', async () => {
    const { store, file } = await twoVersions()
    rmSync(file)
    expect((await store.get(WORLD))?.prompt).toBe('A field at dusk.')
    expect((await store.save(WORLD, { prompt: 'A field at night.' }))?.version).toBe(3)
  })
  it('bible.json corrupt: the same', async () => {
    const { store, file } = await twoVersions()
    writeFileSync(file, '{"worldId": "loc-')
    expect((await store.get(WORLD))?.version).toBe(2)
  })
})
