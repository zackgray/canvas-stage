// Render overrides and the Bible's background ACTION line: since the prompt wave's join (owner decision 1, pasted = verbatim) the line
// is never appended to an override, tagged or not; the override goes as typed, its @tags expanded. Real files, no network.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { TakeRecord } from '../../../src/shared/shotContract.ts'
import { expandOverride, sentOverride } from '../compose.ts'

const WORLD = 'loc-2026-10-24T00-00-00-000'
const take = { worldId: WORLD } as TakeRecord
function pub(o: Partial<BibleRecord> | null): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'l2r-bg-'))
  if (!o) return dir
  const f = path.join(dir, ...biblePaths(WORLD).file.split('/'))
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, JSON.stringify({ worldId: WORLD, version: 3, prompt: 'A field.', master: null, candidates: [], lighting: 'Dusk', materials: 'Mud',
    elements: [{ tag: 'ana', kind: 'cast', refs: [], line: 'a tired courier' }], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', ...o }))
  return dir
}

describe('Render override and the background action line', () => {
  it('an untagged override is shown and sent exactly as typed, the Bible\'s background line not appended', async () => {
    const p = pub({ background: 'soldiers fighting far behind' })
    expect((await expandOverride(p, take, 'She runs at the camera')).text).toBe('She runs at the camera')
    expect(await sentOverride(p, take, 'She runs at the camera.')).toBe('She runs at the camera.')
  })
  it('a tagged override: tags expanded, nothing added (no background line, scene prompt, lighting or materials)', async () => {
    const x = await expandOverride(pub({ background: 'soldiers fighting far behind' }), take, '@ana runs at the camera')
    expect(x.text).toBe('A tired courier runs at the camera')
  })
  it('once: an override that already says it, no line, or no Bible goes as typed', async () => {
    expect((await expandOverride(pub({ background: 'soldiers fighting far behind' }), take, 'She runs; soldiers fighting far behind.')).text).toBe('She runs; soldiers fighting far behind.')
    expect((await expandOverride(pub({}), take, 'She runs')).text).toBe('She runs')
    expect((await expandOverride(pub(null), take, 'She runs')).text).toBe('She runs')
  })
  it('a pasted override goes verbatim (owner decision 1): fire and grain words kept, an all-banned text sent', async () => {
    const p = pub({})
    expect(await sentOverride(p, take, '  A hall at night, a roaring fire, Kodak film grain  ')).toBe('A hall at night, a roaring fire, Kodak film grain')
    expect(await sentOverride(p, take, 'embers and flames')).toBe('embers and flames')
    expect(await sentOverride(p, take, '@ana runs past a bonfire')).toBe('A tired courier runs past a bonfire') // the user's words, the tag in words, nothing added
  })
  it('only an unknown tag is refused (400, free)', async () => {
    await expect(sentOverride(pub({}), take, '@ghost walks')).rejects.toMatchObject({ status: 400, code: 'unknown_tag' })
  })
})
