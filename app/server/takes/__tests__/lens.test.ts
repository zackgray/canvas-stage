// There is no depth of field, so a take records no lens. A lock request from an older page that still sends one (and a focus per
// sample) is accepted and the lens is ignored: not validated, not stored, not part of what makes two locks the same take. A take.json
// written while the lens existed still loads, keeping its lens field for nothing to read.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lockRequest } from '../../../src/labs/projection/clay/plan.ts'
import { fakeTake } from '../../../src/labs/projection/clay/__fixtures__/take.ts'
import { shotPaths, type TakeLockRequest } from '../../../src/shared/shotContract.ts'
import { parseLockRequest, takeIdentity } from '../request.ts'
import { lockTake, readTake } from '../store.ts'

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })
const pub = () => { const d = mkdtempSync(path.join(tmpdir(), 'take-lens-')); roots.push(d); return d }

const OLD_LENS = { dof: true, fNumber: 1.4, format: 'lf', sensorMm: 54.12 } as const
const pack = { id: 'mocap-0000beef', fps: 24, frames: 400 }
const page = () => JSON.parse(JSON.stringify(lockRequest(fakeTake(1), pack, 'loc-a', 16 / 9))) as Record<string, unknown>

describe('no lens at lock', () => {
  it('a new take locks with no lens and no focus on its samples', () => {
    const q = parseLockRequest(page())
    if (typeof q === 'string') throw new Error(q)
    expect('lens' in q).toBe(false)
    expect(q.samples.every((s) => !('focus' in s))).toBe(true)
    const dir = pub()
    const { take } = lockTake(dir, q)
    expect('lens' in readTake(dir, take.id)!).toBe(false)
  })

  it('a lens an older page sends is ignored (even a bad one); it is not stored and does not make another take', () => {
    const plain = parseLockRequest(page()) as TakeLockRequest
    for (const lens of [OLD_LENS, { ...OLD_LENS, fNumber: 11 }, { ...OLD_LENS, fNumber: 0 }, 'f/2']) {
      const q = parseLockRequest({ ...page(), lens })
      if (typeof q === 'string') throw new Error(q)
      expect('lens' in q).toBe(false)
      expect(takeIdentity(q)).toBe(takeIdentity(plain))
    }
  })

  it('samples that carry a focus (an older page) are accepted and keep it; samples without one are accepted too', () => {
    const body = page() as { samples: Record<string, unknown>[] }
    const withFocus = parseLockRequest({ ...body, samples: body.samples.map((s) => ({ ...s, focus: 7.5 })) })
    if (typeof withFocus === 'string') throw new Error(withFocus)
    expect(withFocus.samples[0].focus).toBe(7.5)
    expect(typeof parseLockRequest(body)).toBe('object')
  })

  it('a take.json written while the lens existed still loads', () => {
    const q = parseLockRequest(page()) as TakeLockRequest
    const dir = pub()
    const { take } = lockTake(dir, q)
    const file = path.join(dir, shotPaths(take.id).take)
    const rec = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    writeFileSync(file, JSON.stringify({ ...rec, lens: OLD_LENS }))
    expect(readTake(dir, take.id)?.lens).toEqual(OLD_LENS)
  })
})
