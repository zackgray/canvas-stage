// The set key the server checks a take's set copy with is the page's (shoot/setKey.ts setKeyOf), pinned on real scenes' plan.json
// (copied into fixtures/set-<key>.json from worlds whose takes carry that setKey; tests never read lab-assets). And the server hashes
// what the page hashes: parsePlan (how the kit store reads plan.json, and how Lock take reads a sent set) leaves a stored plan's key
// as it was, so an adopted or locked copy hashes to the take's setKey.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parsePlan } from '../../../src/stage3d/plan.ts'
import { setKeyOf } from '../../../src/studio/shoot/setKey.ts'
import { setMatchesKey } from '../../../src/shared/takeSetContract.ts'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixtures = readdirSync(DIR).filter((f) => /^set-[0-9a-f]{8}\.json$/.test(f))

describe('setKeyOf pinned on real plan.json files', () => {
  it('has the fixtures (the race-track world 7370714d among them)', () => {
    expect(fixtures).toContain('set-7370714d.json')
    expect(fixtures.length).toBeGreaterThanOrEqual(3)
  })
  for (const f of fixtures) {
    const key = f.slice(4, 12)
    const raw = JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as unknown
    it(`${f}: the raw file hashes to its takes' setKey, and so does the plan parsePlan reads from it (twice)`, () => {
      expect(setKeyOf(raw)).toBe(key)
      const p = parsePlan(raw)
      expect(p.ok).toBe(true)
      if (!p.ok) return
      expect(setKeyOf(p.plan)).toBe(key)
      const again = parsePlan(JSON.parse(JSON.stringify(p.plan)))
      expect(again.ok && setKeyOf(again.plan)).toBe(key)
      expect(setMatchesKey(p.plan, key)).toBe(true)
      expect(setMatchesKey(p.plan, '00000000')).toBe(false)
    })
  }
  it('null and undefined have no key; nothing matches an empty key', () => {
    expect([setKeyOf(null), setKeyOf(undefined)]).toEqual([null, null])
    expect(setMatchesKey(null, '7370714d')).toBe(false)
  })
})
