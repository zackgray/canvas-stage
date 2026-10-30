// Join (fix 7): the set build stores the master view's metric depth beside still.png, so the Bible master draw holds to the set.
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { FILES, KitStore } from '../store.ts'

const grey16 = (w: number, h: number) => PNG.sync.write(Object.assign(new PNG({ width: w, height: h, bitDepth: 16, colorType: 0, inputColorType: 0, inputHasAlpha: false }), { data: Buffer.alloc(w * h * 2) }), { bitDepth: 16, colorType: 0, inputColorType: 0, inputHasAlpha: false })
const rgb8 = (w: number, h: number) => PNG.sync.write(new PNG({ width: w, height: h }))

describe('master view depth', () => {
  it('a 16-bit grey 1920x1088 PNG is stored and named on the world; an 8-bit or wrong-size one is a 400', () => {
    const pub = mkdtempSync(path.join(tmpdir(), 'kitdepth-'))
    const s = new KitStore(pub)
    const w = s.create({ plan: BATTLEFIELD, description: 'depth' })
    expect(s.read(w.id).masterDepth).toBeNull()
    expect(() => s.writeMasterDepth(w.id, rgb8(1920, 1088))).toThrow(/16-bit greyscale/)
    expect(() => s.writeMasterDepth(w.id, grey16(64, 36))).toThrow(/1920 x 1088/)
    const got = s.writeMasterDepth(w.id, grey16(1920, 1088))
    expect(got.masterDepth).toBe(`/lab-assets/locations/${w.id}/${FILES.masterDepth}`)
    expect(existsSync(path.join(pub, 'lab-assets', 'locations', w.id, FILES.masterDepth))).toBe(true)
  })
})
