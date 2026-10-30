// Wave 0.5 (docs/preproduction-plan-fable.md): the action line typed at Lock and the Bible version at lock, round-tripped through
// take.json, part of what makes two locks the same take, and optional, so older pages lock and older take.json files load as before.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lockRequest } from '../../../src/labs/projection/clay/plan.ts'
import { fakeTake } from '../../../src/labs/projection/clay/__fixtures__/take.ts'
import { shotPaths, type TakeLockRequest } from '../../../src/shared/shotContract.ts'
import { MAX_ACTION, parseLockRequest } from '../request.ts'
import { lockTake, readTake } from '../store.ts'

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })
const pub = () => { const d = mkdtempSync(path.join(tmpdir(), 'take-bible-')); roots.push(d); return d }

const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
/** what a page sends; `extra` = the Wave 0.5 fields */
const page = (extra: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify(lockRequest(fakeTake(1), pack, 'loc-a', 16 / 9))), ...extra }) as unknown
const parsed = (raw: unknown): TakeLockRequest => { const q = parseLockRequest(raw); if (typeof q === 'string') throw new Error(q); return q }

describe('the Bible version at lock comes from the world when the page sends none', () => {
  it('a world with a Bible: the take records its version; one without: none', () => {
    const dir = pub()
    const f = path.join(dir, 'lab-assets', 'locations', 'loc-a', 'bible', 'bible.json')
    mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify({ version: 4 }))
    expect(lockTake(dir, parsed(page())).take.bibleVersion).toBe(4)
    expect(lockTake(dir, parsed(page({ bibleVersion: 2 }))).take.bibleVersion).toBe(2) // what the page says wins
  })
})

describe('legacy takes (no action, no Bible version)', () => {
  it('an older page locks as before, with neither field written', () => {
    const q = parsed(page())
    expect('action' in q || 'bibleVersion' in q).toBe(false)
    const dir = pub()
    const { take } = lockTake(dir, q)
    const onDisk = JSON.parse(readFileSync(path.join(dir, shotPaths(take.id).take), 'utf8')) as Record<string, unknown>
    expect('action' in onDisk || 'bibleVersion' in onDisk).toBe(false)
  })

  it('a take.json written before Wave 0.5 loads, and the same lock finds it again (its identity did not move)', () => {
    const dir = pub()
    const { take } = lockTake(dir, parsed(page()), new Date('2026-10-22T10:00:00.000Z'))
    // rewrite it exactly as Wave B wrote takes: the base fields only
    const { id, worldId, packId, fps, frames, samples, focal, viewAspect, perfStart, startKey, lockedAt, createdAt, timelineStart } = take
    writeFileSync(path.join(dir, shotPaths(id).take), JSON.stringify({ id, worldId, packId, fps, frames, samples, focal, viewAspect, perfStart, startKey, lockedAt, createdAt, timelineStart }))
    const old = readTake(dir, id)
    expect(old?.id).toBe(id)
    expect(old?.action).toBeUndefined()
    expect(old?.bibleVersion).toBeUndefined()
    expect(lockTake(dir, parsed(page()))).toMatchObject({ reused: true, take: { id } })
  })
})

describe('action and bibleVersion at lock', () => {
  it('are kept as sent (the action trimmed) and read back from take.json', () => {
    const q = parsed(page({ action: '  he stops and looks up  ', bibleVersion: 3 }))
    expect(q).toMatchObject({ action: 'he stops and looks up', bibleVersion: 3 })
    const dir = pub()
    const { take } = lockTake(dir, q)
    expect(readTake(dir, take.id)).toMatchObject({ action: 'he stops and looks up', bibleVersion: 3 })
  })

  it('a blank or null action is no action', () => {
    for (const action of ['', '   ', null]) expect('action' in parsed(page({ action }))).toBe(false)
    expect('bibleVersion' in parsed(page({ bibleVersion: null }))).toBe(false)
  })

  it('another action or Bible version is another take; the same is the same take', () => {
    const dir = pub()
    const a = lockTake(dir, parsed(page({ action: 'walks' })), new Date('2026-10-25T10:00:00.000Z')).take
    expect(lockTake(dir, parsed(page({ action: 'walks' }))).reused).toBe(true)
    expect(lockTake(dir, parsed(page({ action: 'runs' })), new Date('2026-10-25T10:00:05.000Z')).take.id).not.toBe(a.id)
    expect(lockTake(dir, parsed(page({ action: 'walks', bibleVersion: 2 })), new Date('2026-10-25T10:00:09.000Z')).take.id).not.toBe(a.id)
  })

  it.each([
    [{ action: 7 }, /action/],
    [{ action: 'x'.repeat(MAX_ACTION + 1) }, /action/],
    [{ bibleVersion: 0 }, /bibleVersion/],
    [{ bibleVersion: 1.5 }, /bibleVersion/],
    [{ bibleVersion: '2' }, /bibleVersion/],
  ])('refuses %j', (extra, why) => {
    expect(parseLockRequest(page(extra))).toMatch(why)
  })
})
