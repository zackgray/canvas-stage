// (owner 10-29) "What will be sent" is editable at the first frame's draw: the draw words (prompt) and the finish words
// (finishPrompt) go exactly as written, the preview shows them with the composed words beside them for Reset, and nothing but the
// text changes: every image input of both jobs (the depth control, the face, the gear, the board tiles) is the same. Fake Cloud.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

type Node = { class_type?: string; inputs: Record<string, unknown> }
type Sent = { json: Record<string, Node> }
const hero = (t: KitTake) => mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
function press(t: KitTake, body: object = {}) {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000a01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000a02', stillPng()))
  return hero(t).render({ count: 1, seed: 7, ...body })
}
const preview = async (t: KitTake, body: object = {}) => (await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, ...body }) })).body as unknown as StillPreviewResponse
const texts = (s: Sent) => Object.values(s.json).filter((n) => n.class_type === 'CLIPTextEncode' || /TextEncode/.test(n.class_type ?? '')).map((n) => String(n.inputs.text ?? n.inputs.prompt ?? ''))
/** every image a job loads, by node key (the file names the upload gave them) */
const images = (s: Sent) => Object.fromEntries(Object.entries(s.json).filter(([, n]) => /LoadImage/.test(n.class_type ?? '')).map(([k, n]) => [k, n.inputs.image]))
const tiles = { elements: [{ tag: 'palisade', kind: 'prop' as const, refs: ['/lab-assets/tiles/palisade.png'], line: 'A rotten, moss-green log palisade.' }] }
function withTiles(t: KitTake): KitTake {
  mkdirSync(path.join(t.pub, 'lab-assets', 'tiles'), { recursive: true })
  writeFileSync(path.join(t.pub, 'lab-assets', 'tiles', 'palisade.png'), stillPng())
  return t
}

const DRAW = 'A lone figure at a log wall at dusk, wide, photographic.'
const FINISH = 'Image 1 exactly as it is; the person given the face of image 2.'

describe('editing what the draw sends', () => {
  it('the preview marks both jobs editable and keeps the composed words; an edit shows as written', async () => {
    const t = withTiles(kitTake({ bible: tiles }))
    const plain = await preview(t)
    expect(plain.sent?.map((j) => j.edit)).toEqual(['prompt', 'finishPrompt'])
    expect(plain.sent![0].composed).toBe(plain.sent![0].prompt)
    expect(plain.sent![1].composed).toBe(plain.sent![1].prompt)
    const edited = await preview(t, { prompt: DRAW, finishPrompt: FINISH })
    expect(edited.sent![0].prompt).toBe(DRAW)
    expect(edited.sent![1].prompt).toBe(FINISH)
    expect(edited.sent![0].composed).toBe(plain.sent![0].prompt) // Reset goes back to these
    expect(edited.sent![1].composed).toBe(plain.sent![1].prompt)
    expect(edited.price).toBe(plain.price)
  })

  it('the press sends the edited words exactly, and every image input of the draw and the finish is the same', async () => {
    const a = withTiles(kitTake({ bible: tiles }))
    await press(a)
    const b = withTiles(kitTake({ bible: tiles }))
    await press(b, { prompt: DRAW, finishPrompt: FINISH })
    const [drawA, finA] = a.submitted as Sent[], [drawB, finB] = b.submitted as Sent[]
    expect(texts(drawB)).toContain(DRAW)
    expect(texts(finB)).toContain(FINISH)
    expect(texts(finA)).not.toContain(FINISH)
    expect(Object.keys(images(drawA)).length).toBeGreaterThan(0)
    expect(images(drawB)).toEqual(images(drawA))
    expect(images(finB)).toEqual(images(finA))
    expect(drawB.json.cn?.inputs).toEqual(drawA.json.cn?.inputs) // the depth lock is untouched
  })

  it('an over-long finish edit is a free 400', async () => {
    const t = kitTake()
    const r = await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, finishPrompt: 'x'.repeat(4001) }) })
    expect(r.status).toBe(400)
    expect(t.jobs.submits).toBe(0)
  })
})
