// Consistency pass (qa-2026-10-27-coverage): a person drawn from three angles lost her outfit on a fresh seed and grew a second
// woman. Same look: an approved first frame of ANOTHER take of the same world and cast is the finish's gear image (Klein's image 3,
// "exactly the clothes and gear of image 3"), and the free preview offers its seed. Stage-only: only when the press asks (Klein
// copied a wide frame's prop into a close-up); by default the card's own picture goes. Alone: one figure puts a second person
// in the draw's negative. Fake Cloud: nothing is submitted for real.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import type { KitStill } from '../kitSpec.ts'
import { QWEN_NEG } from '../qwenGraph.ts'
import { readFileSync } from 'node:fs'
import { readLookPointer, setLookPointer, worldFolderOf } from '../lookPointer.ts'
import { lookPointerStale, sameLookOf, STALE_LOOK_NOTE } from '../sameLook.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

type Sent = { json: Record<string, { class_type?: string; inputs: Record<string, unknown> }> }
const OTHER = 'take-2026-10-22T11-00-00-000'
const hero = (t: KitTake) => mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
const press = (t: KitTake, body: object = {}) => {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000a02', stillPng()))
  return hero(t).render({ count: 1, ...body })
}
const preview = async (t: KitTake, body: object = {}) => (await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, ...body }) })).body as unknown as StillPreviewResponse
const kleinText = (s: Sent) => String(Object.values(s.json).find((n) => n.class_type === 'CLIPTextEncode' && n.inputs.text)!.inputs.text)

/** another take of the same world, with one still: approved for `castId` unless told otherwise */
function otherTake(t: KitTake, o: { id?: string; still?: string; approved?: boolean; castId?: string; worldId?: string; createdAt?: string; seed?: number } = {}) {
  const id = o.id ?? OTHER, sid = o.still ?? 'hero-2026-10-22T11-05-00-000-1'
  const dir = path.join(t.pub, 'lab-assets', 'shots', id, 'hero')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, '..', 'take.json'), JSON.stringify({ ...t.take, id, worldId: o.worldId ?? t.take.worldId, lockedAt: '2026-10-22T11:00:00.000Z' }))
  writeFileSync(path.join(dir, `${sid}.png`), stillPng())
  writeFileSync(path.join(dir, `${sid}.json`), JSON.stringify({ id: sid, takeId: id, startKey: t.take.startKey, png: '', seed: o.seed ?? 1082798150, jobId: 'j', credits: 21,
    approved: o.approved ?? true, createdAt: o.createdAt ?? '2026-10-22T11:05:00.000Z', castId: o.castId ?? 'ana', role: 'opening' }))
  return { id, sid, file: path.join(dir, `${sid}.png`) }
}

describe('same look as the approved frame of another take', () => {
  it('no approved frame elsewhere: nothing changes (the card front is the gear, no seed offered)', async () => {
    const t = kitTake()
    expect((await preview(t)).sameLook).toBeNull()
    const s = (await press(t)).body as { still: KitStill & { refs?: string[] } }
    expect(s.still.refs).toContain('front.png')
    expect(kleinText(t.submitted[1] as Sent)).toContain('the same clothes and colours as image 3')
  })

  it('the approved frame is image 3 only when the press asks: the gear clause names it, and the preview offers its seed', async () => {
    const t = kitTake()
    const a = otherTake(t)
    const png = `/lab-assets/shots/${OTHER}/hero/${a.sid}.png`
    expect(await preview(t, { sameLook: true })).toMatchObject({ sameLook: { seed: 1082798150, png }, lookFrame: { seed: 1082798150, png } })
    const s = (await press(t, { seed: 1082798150, sameLook: true })).body as { still: KitStill & { refs?: string[] } }
    expect(s.still.seed).toBe(1082798150)
    expect(s.still.refs).toEqual(['face.png', `${a.sid}.png`]) // face (image 2), the approved frame (image 3)
    expect(kleinText(t.submitted[1] as Sent)).toMatch(/the same face or helmet and hair as image 2, the same clothes and colours as image 3/)
  })

  it("stage-only: a press that does not ask sends the card's own front as the gear, not the approved frame, and no seed of it", async () => {
    const t = kitTake()
    const a = otherTake(t)
    const s = (await press(t)).body as { still: KitStill & { refs?: string[] } }
    expect(s.still.refs).toContain('front.png')
    expect(s.still.refs).not.toContain(`${a.sid}.png`)
    expect(s.still.seed).not.toBe(1082798150)
    expect(JSON.stringify(t.submitted[1])).not.toContain(a.sid) // the finish job binds no file of the other take
  })

  it('stage-only: the preview offers the frame either way and reports it as used only when asked', async () => {
    const t = kitTake()
    const a = otherTake(t)
    const png = `/lab-assets/shots/${OTHER}/hero/${a.sid}.png`
    const off = await preview(t)
    expect(off).toMatchObject({ sameLook: null, lookFrame: { seed: 1082798150, png, stillId: a.sid, source: 'oldest' } })
    const on = await preview(t, { sameLook: true })
    expect(on).toMatchObject({ sameLook: { seed: 1082798150, png }, lookFrame: { png } })
  })

  it('stage-only: "Draw from your approved frame" still finishes with that frame\'s clothes, asked or not', async () => {
    const t = kitTake()
    const a = otherTake(t)
    const png = `/lab-assets/shots/${OTHER}/hero/${a.sid}.png`
    expect(await preview(t, { mode: 'edit' })).toMatchObject({ sameLook: { png }, lookFrame: { png } })
    expect(await preview(t, { mode: 'edit-projected' })).toMatchObject({ sameLook: { png } })
  })

  it('stage-only: sameLook must be true or false (400, free)', async () => {
    const t = kitTake()
    otherTake(t)
    const r = await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, sameLook: 'yes' }) })
    expect(r.status).toBe(400)
    expect(t.submitted).toHaveLength(0)
  })

  it('only an approved opening of the same world and cast counts, the oldest one; an unapproved, another cast or another world does not', () => {
    const t = kitTake()
    otherTake(t, { id: 'take-2026-10-22T10-00-00-000', still: 'hero-a-1', approved: false })
    otherTake(t, { id: 'take-2026-10-22T10-10-00-000', still: 'hero-b-1', castId: 'bea' })
    otherTake(t, { id: 'take-2026-10-22T10-20-00-000', still: 'hero-c-1', worldId: 'kit-elsewhere' })
    expect(sameLookOf(t.pub, t.take, 'ana')).toBeNull()
    otherTake(t, { id: 'take-2026-10-22T10-30-00-000', still: 'hero-d-1', createdAt: '2026-10-22T10:31:00.000Z', seed: 1 })
    otherTake(t, { id: 'take-2026-10-22T10-40-00-000', still: 'hero-e-1', createdAt: '2026-10-22T10:41:00.000Z', seed: 2 })
    expect(sameLookOf(t.pub, t.take, 'ana')).toMatchObject({ stillId: 'hero-d-1', seed: 1, source: 'oldest' })
    expect(sameLookOf(t.pub, { ...t.take, id: 'take-2026-10-22T10-30-00-000' }, 'ana')).toMatchObject({ stillId: 'hero-e-1' }) // never its own take
  })
})

const A = 'take-2026-10-22T10-30-00-000', B = 'take-2026-10-22T10-40-00-000'
function twoFrames(t: KitTake) {
  otherTake(t, { id: A, still: 'hero-d-1', createdAt: '2026-10-22T10:31:00.000Z', seed: 1 })
  otherTake(t, { id: B, still: 'hero-e-1', createdAt: '2026-10-22T10:41:00.000Z', seed: 2 })
}
const dirOf = (t: KitTake) => worldFolderOf(t.pub, t.take.worldId)!

describe('the scene look pointer', () => {
  it('oldest wins with no pointer; the newer frame is not picked', () => {
    const t = kitTake(); twoFrames(t)
    expect(sameLookOf(t.pub, t.take, 'ana')).toMatchObject({ takeId: A, source: 'oldest' })
    expect(sameLookOf(t.pub, t.take, 'ana')?.stale).toBeUndefined()
  })

  it('the pointer wins over the oldest', async () => {
    const t = kitTake(); twoFrames(t)
    await setLookPointer(t.pub, { ...t.take, id: B }, 'hero-e-1')
    expect(sameLookOf(t.pub, t.take, 'ana')).toMatchObject({ takeId: B, stillId: 'hero-e-1', seed: 2, source: 'pointer' })
    expect(lookPointerStale(t.pub, t.take, 'ana')).toBe(false)
  })

  it('a pointer to a still that is gone or no longer approved falls back to the oldest and says so', async () => {
    const t = kitTake(); twoFrames(t)
    await setLookPointer(t.pub, { ...t.take, id: B }, 'hero-e-1')
    rmSync(path.join(t.pub, 'lab-assets', 'shots', B, 'hero', 'hero-e-1.json'))
    expect(sameLookOf(t.pub, t.take, 'ana')).toMatchObject({ takeId: A, source: 'oldest', stale: STALE_LOOK_NOTE })
    expect(lookPointerStale(t.pub, t.take, 'ana')).toBe(true)
  })

  it('the pointer file is written in the world folder; the look route refuses an unapproved or unknown still and writes nothing', async () => {
    const t = kitTake(); twoFrames(t)
    otherTake(t, { id: 'take-2026-10-22T10-50-00-000', still: 'hero-f-1', approved: false })
    const f = hero(t)
    const bad = await f.raw('/look', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: 'take-2026-10-22T10-50-00-000', stillId: 'hero-f-1' }) })
    expect(bad.status).toBe(409)
    expect((await f.raw('/look', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: B, stillId: 'hero-nope-1' }) })).status).toBe(404)
    expect(readLookPointer(t.pub, t.take.worldId)).toBeNull()
    const ok = await f.raw('/look', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: B, stillId: 'hero-e-1' }) })
    expect(ok.status).toBe(200)
    const onDisk = JSON.parse(readFileSync(path.join(dirOf(t), 'look.json'), 'utf8'))
    expect(onDisk).toMatchObject({ takeId: B, stillId: 'hero-e-1' })
    expect(typeof onDisk.setAt).toBe('string')
    expect(await preview(t)).toMatchObject({ sameLook: null, lookFrame: { seed: 2 } })
  })
})

describe('one person: the draw\'s negative', () => {
  it('a still whose figures say one person sends the generic negative and no alone line', async () => {
    const t = kitTake()
    await press(t)
    expect((t.submitted[0] as Sent).json.neg.inputs.text).toBe(QWEN_NEG)
    expect(String((t.submitted[0] as Sent).json.pos.inputs.text)).not.toContain('alone in the picture')
  })
})
