// E140 A: independently drawn keyframes morph the set. A mid / end keyframe that does not follow the clay at its frame says so
// (the hero still's free layout check, read-only); one that does, or one with no clay depth to judge by, says nothing.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HeroStill, TakeRecord } from '../../../src/shared/shotContract.ts'
import { BOX, stillPng, zdepthPng } from '../../hero/__tests__/kitRig.ts'
import { setDiffers } from '../keyframes.ts'
import { shotDirs } from '../spec.ts'

const TAKE = 'take-2026-10-24T10-00-00-000'
const take = { id: TAKE } as TakeRecord
const still = (id: string, frame = 24): HeroStill => ({ id, takeId: TAKE, frame, role: 'mid', approved: true } as HeroStill)

function pub(o: { zdepth?: boolean; stills: Record<string, Buffer> }) {
  const p = path.join(mkdtempSync(path.join(tmpdir(), 'setdiff-')), 'public')
  const d = shotDirs(p, TAKE)
  mkdirSync(d.clay, { recursive: true }); mkdirSync(d.hero, { recursive: true })
  if (o.zdepth !== false) writeFileSync(path.join(d.clay, 'zdepth_024.png'), zdepthPng())
  for (const [id, png] of Object.entries(o.stills)) writeFileSync(path.join(d.hero, `${id}.png`), png)
  return p
}

describe('a keyframe whose set differs from the opening', () => {
  it('a keyframe that follows the clay at its frame says nothing', () => {
    expect(setDiffers(pub({ stills: { 'k-good': stillPng() } }), still('k-good'), take)).toBeNull()
  })
  it('one that moved the set (the box shifted, a wall drawn) is named, with the frame', () => {
    const moved = stillPng({ ...BOX, x0: BOX.x0 + 60, x1: BOX.x1 + 60 })
    expect(setDiffers(pub({ stills: { 'k-moved': moved } }), still('k-moved'), take)).toMatch(/This keyframe's set differs from the opening.*frame 24/)
  })
  it('with no clay depth for that frame, or no frame, there is nothing to judge by: no warning', () => {
    expect(setDiffers(pub({ zdepth: false, stills: { 'k-x': stillPng({ x0: 0, x1: 50, y0: 8, y1: 100 }) } }), still('k-x'), take)).toBeNull()
    expect(setDiffers(pub({ stills: { 'k-y': stillPng() } }), { ...still('k-y'), frame: undefined }, take)).toBeNull()
  })
})
