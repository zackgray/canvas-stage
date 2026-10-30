// Recipe wave 3, track CARRY: a re-lock whose frame 0 is unchanged inherits the approved opening still; anything unsure carries nothing.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isStale, shotPaths, type HeroStill, type TakeRecord } from '../../../src/shared/shotContract.ts'
import type { JobStore } from '../../jobs/index.ts'
import { approvedStill } from '../../l2r/inputs.ts'
import { approvedOpening, carryOpening, carryRefusal } from '../carry.ts'
import { approveStill, heroDirOf, listStills } from '../store.ts'

const noJobs = { list: () => [] } as unknown as JobStore
let pub = ''
beforeEach(() => { pub = mkdtempSync(path.join(tmpdir(), 'carry-')) })
afterEach(() => rmSync(pub, { recursive: true, force: true }))

const take = (id: string, over: Partial<TakeRecord> = {}): TakeRecord => ({
  id, worldId: 'loc-a', packId: 'mocap-1', fps: 24, frames: 97, samples: [], focal: 35, viewAspect: 16 / 9, perfStart: 0,
  startKey: 'aaaa0000', lockedAt: `2026-10-24T10:00:0${id.slice(-1)}.000Z`, createdAt: 'x', frame0Key: '0f0f0f0f', ...over,
})
function writeTake(t: TakeRecord) {
  mkdirSync(path.join(pub, shotPaths(t.id).root), { recursive: true })
  writeFileSync(path.join(pub, shotPaths(t.id).take), JSON.stringify(t))
}
function writeStill(t: TakeRecord, id: string, over: Partial<HeroStill> = {}) {
  const dir = heroDirOf(pub, t.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${id}.png`), `png of ${id}`)
  const s: HeroStill = { id, takeId: t.id, startKey: t.startKey, png: '', seed: 7, jobId: 'job-1', credits: 21, approved: true, createdAt: '2026-10-24T09:00:00Z', ...over }
  writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(s))
}

describe('carryRefusal: never carry when unsure', () => {
  const a = take('take-1'), b = take('take-2')
  it('carries between equal frame 0s of the same world, start, focal, aspect, lens and Bible', () => expect(carryRefusal(a, b)).toBeNull())
  it('refuses a missing key on the new take', () => expect(carryRefusal(a, { ...b, frame0Key: undefined })).toBe('no frame-0 key'))
  it('refuses a missing key on the old take', () => expect(carryRefusal({ ...a, frame0Key: undefined }, b)).toBe('no frame-0 key'))
  it('refuses another world', () => expect(carryRefusal(a, { ...b, worldId: 'loc-b' })).toBe('another world'))
  it('refuses another focal', () => expect(carryRefusal(a, { ...b, focal: 50 })).toBe('another focal or aspect'))
  it('refuses another aspect', () => expect(carryRefusal(a, { ...b, viewAspect: 2.39 })).toBe('another focal or aspect'))
  it('refuses another start (camera or performance frame)', () => expect(carryRefusal(a, { ...b, startKey: 'bbbb0000' })).toBe('another start (camera or performance frame)'))
  it('a lens recorded by an older version is not a reason to refuse', () => expect(carryRefusal(a, { ...b, lens: { dof: true, fNumber: 2, format: 'ff', sensorMm: 36 } } as typeof b)).toBeNull())
  it('refuses another Bible version', () => expect(carryRefusal(a, { ...b, bibleVersion: 3 })).toBe('another scene sheet version'))
  it('refuses a changed frame 0 (a moved figure)', () => expect(carryRefusal(a, { ...b, frame0Key: '1f0f0f0f' })).toBe('frame 0 changed'))
  it('refuses the take itself', () => expect(carryRefusal(a, a)).toBe('same take'))
})

describe('carryOpening', () => {
  it('copies the approved opening still into the new take: fresh for Shoot, approve and Render; mid / end and unapproved stills stay behind', async () => {
    const a = take('take-1'), b = take('take-2', { packId: 'mocap-2' })
    writeTake(a); writeTake(b)
    writeStill(a, 'hero-open')
    writeStill(a, 'hero-alt', { approved: false })
    writeStill(a, 'hero-mid', { role: 'mid', frame: 48 })
    writeFileSync(path.join(heroDirOf(pub, a.id), 'hero-open-draw.png'), 'draw')
    writeFileSync(path.join(heroDirOf(pub, a.id), 'opening.png'), 'frame 0')

    expect(await carryOpening(pub, b, [a, b])).toEqual({ stillId: 'hero-open', from: 'take-1' })
    const dir = heroDirOf(pub, b.id)
    expect(['hero-open.png', 'hero-open-draw.png', 'opening.png'].every((f) => existsSync(path.join(dir, f)))).toBe(true)
    expect(existsSync(path.join(dir, 'hero-mid.json')) || existsSync(path.join(dir, 'hero-alt.json'))).toBe(false)
    const listed = await listStills(pub, b.id, noJobs)
    expect(listed.map((s) => [s.id, s.takeId, s.approved, s.carriedFrom, s.credits])).toEqual([['hero-open', 'take-2', true, 'take-1', 0]])
    expect(isStale(listed[0], b)).toBe(false)
    expect(approvedStill(dir, b.id)?.id).toBe('hero-open') // Render's readiness reads it as this take's approved opening
    expect((await approveStill(pub, b, 'hero-open', noJobs)).approved).toBe(true)
    // the old take keeps its own still as it was
    expect(JSON.parse(readFileSync(path.join(heroDirOf(pub, a.id), 'hero-open.json'), 'utf8')).takeId).toBe('take-1')
  })

  it('carries nothing without an approved opening on the earlier take', async () => {
    const a = take('take-1'), b = take('take-2')
    writeStill(a, 'hero-alt', { approved: false })
    writeStill(a, 'hero-mid', { role: 'mid', frame: 48 })
    expect(await carryOpening(pub, b, [a, b])).toBeNull()
    expect(existsSync(heroDirOf(pub, b.id))).toBe(false)
  })

  it('carries nothing from a take whose frame 0 differs, or across worlds, or without a key', async () => {
    const a = take('take-1')
    writeStill(a, 'hero-open')
    expect(await carryOpening(pub, take('take-2', { frame0Key: 'ffffffff' }), [a])).toBeNull()
    expect(await carryOpening(pub, take('take-3', { worldId: 'loc-b' }), [a])).toBeNull()
    expect(await carryOpening(pub, take('take-4', { frame0Key: undefined }), [a])).toBeNull()
    expect(await carryOpening(pub, take('take-5', { focal: 50 }), [a])).toBeNull()
  })

  it('an approved opening drawn on an older start of the earlier take is no opening to carry', async () => {
    const a = take('take-1')
    writeStill(a, 'hero-open', { startKey: 'old00000' })
    expect(await approvedOpening(pub, a)).toBeNull()
    expect(await carryOpening(pub, take('take-2'), [a])).toBeNull()
  })

  it('takes the newest matching earlier take', async () => {
    const a = take('take-1'), b = take('take-2')
    writeStill(a, 'hero-a'); writeStill(b, 'hero-b')
    expect(await carryOpening(pub, take('take-3'), [a, b])).toEqual({ stillId: 'hero-b', from: 'take-2' })
  })
})
