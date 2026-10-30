// The server side of the ID pass: the 'id' kind is accepted, ClayExport.idPass is recorded only for a complete keyframe set with a
// colour table, and an export without them (or an old clay) is as before.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { frameFile, isPngKind, uploadTarget } from '../upload.ts'
import { idKeyframes, idPassOf } from '../kit.ts'
import { parseIdColors } from '../service.ts'
import { lockTake } from '../../takes/store.ts'

let dir = ''
/** a PNG signature + IHDR only (what pngHeader reads) */
function pngStub(file: string, w = 1920, h = 1088, bitDepth = 8, colorType = 2) {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b)
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = bitDepth; b[25] = colorType
  writeFileSync(file, b)
}
beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'id-pass-')) })
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const colors = { hero: [255, 0, 0] as [number, number, number] }

describe('ID pass on the server', () => {
  it('accepts the id kind as a PNG pass named id_NNN.png', () => {
    expect(isPngKind('id')).toBe(true)
    expect(frameFile('id', 4)).toBe('id_004.png')
  })
  it('the upload route takes kind=id (and still refuses unknown kinds)', () => {
    const pub = mkdtempSync(path.join(tmpdir(), 'id-up-'))
    const take = lockTake(pub, { worldId: 'w', packId: null, fps: 24, frames: 9, focal: 24, viewAspect: 16 / 9, perfStart: 0, samples: [{ t: 0, position: [0, 1, 0], quaternion: [0, 0, 0, 1], focal: 24 }] }, new Date('2026-10-23T03:00:00Z')).take
    const t = uploadTarget(pub, new URLSearchParams({ take: take.id, frame: '4', kind: 'id' }))
    expect(Array.isArray(t)).toBe(false)
    expect((t as { file: string }).file.endsWith('id_004.png')).toBe(true)
    expect(uploadTarget(pub, new URLSearchParams({ take: take.id, frame: '4', kind: 'nope' }))).toEqual([400, expect.stringContaining('id')])
    rmSync(pub, { recursive: true, force: true })
  })
  it('records idPass for a full set of keyframe PNGs with a colour table', () => {
    const d = path.join(dir, 'ok'); mkdirSync(d)
    for (const i of idKeyframes(97)) pngStub(path.join(d, frameFile('id', i)))
    expect(idPassOf(d, 97, colors)).toEqual({ frames: [0, 48, 96], pattern: 'id_%03d.png', colors })
  })
  it('is null with no table (no entities), a missing keyframe, or a wrong-size PNG; the clay finishes either way', () => {
    const d = path.join(dir, 'bad'); mkdirSync(d)
    expect(idPassOf(d, 97, colors)).toBeNull() // old clay: no files at all
    for (const i of idKeyframes(97)) pngStub(path.join(d, frameFile('id', i)))
    expect(idPassOf(d, 97, undefined)).toBeNull()
    expect(idPassOf(d, 97, {})).toBeNull()
    pngStub(path.join(d, frameFile('id', 48)), 640, 360)
    expect(idPassOf(d, 97, colors)).toBeNull()
  })
  it('reads only a well-formed colour table from the finish body', () => {
    expect(parseIdColors({ idColors: { hero: [255, 0, 0], 'extra:2:1': [0, 255, 0] } })).toEqual({ hero: [255, 0, 0], 'extra:2:1': [0, 255, 0] })
    expect(parseIdColors({})).toBeUndefined()
    expect(parseIdColors({ idColors: { hero: [300, 0, 0] } })).toBeUndefined()
    expect(parseIdColors({ idColors: { 'not a tag': [1, 2, 3] } })).toBeUndefined()
  })
})
