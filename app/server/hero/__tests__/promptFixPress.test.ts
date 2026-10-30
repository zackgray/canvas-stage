// Prompt-fix pass (2026-10-30), through the real press and preview with a fake Cloud (no network, no credits): a cast take whose
// performer is out of the frame sends no face or gear image and a card that says nobody is there (tonight's burnout close-up grew a
// driver in the empty cockpit); the press honours "Added by the app" switched off; the preview shows the additions and the negative in
// English. And the stale guard: an approved still made under tonight's words stays current, and an edited finish still goes as written.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { isStale } from '../../../src/shared/shotContract.ts'
import { stillHardWhy } from '../../../src/shared/wordsOnFrame.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { takeBible } from '../../takes/words.ts'
import type { KitStill } from '../kitSpec.ts'
import { NO_PERSON_LINE } from '../kleinCard.ts'
import { kitInfo, kitTake, pngJob, stillPng, type KitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

type Sent = { json: Record<string, { class_type?: string; inputs: Record<string, unknown> }> }
const nodesOf = (s: Sent, cls: string) => Object.values(s.json).filter((n) => n.class_type === cls)
const kleinText = (s: Sent) => String(nodesOf(s, 'CLIPTextEncode').find((n) => n.inputs.text)!.inputs.text)
const hero = (t: KitTake) => mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
let n = 0
const press = (t: KitTake, body: object = {}) => {
  const id = (k: number) => `aaaaaaaa-0000-4000-8000-${String(++n * 10 + k).padStart(12, '0')}`
  t.queue.push(pngJob(id(1), stillPng()), pngJob(id(2), stillPng()))
  return hero(t).render({ count: 1, ...body })
}
const preview = async (t: KitTake, body: object = {}) => (await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, count: 1, ...body }) })).body as unknown as StillPreviewResponse

/** the clay's ID pass at frame 0: the hero in red where `heroIn`, else nobody on the frame */
function idPass(t: KitTake, heroIn: boolean) {
  const w = 192, h = 108, png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, on = heroIn && x >= 90 && x < 100 && y >= 40 && y < 100
    png.data[i] = on ? 255 : 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 255
  }
  writeFileSync(path.join(t.clayDir, 'id_000.png'), PNG.sync.write(png))
  const f = path.join(t.clayDir, 'clay.json'), clay = JSON.parse(readFileSync(f, 'utf8'))
  writeFileSync(f, JSON.stringify({ ...clay, idPass: { frames: [0], pattern: 'id_%03d.png', colors: { hero: [255, 0, 0] } } }))
}

describe('a cast take with the performer out of the frame', () => {
  it('the finish sends no face or gear image and its card says nobody is there; no person line', async () => {
    const t = kitTake(); idPass(t, false) // "ana" is cast, but not in this frame
    const r = await press(t)
    expect(r.status).toBe(200)
    const fin = t.submitted[1] as Sent
    const card = kleinText(fin)
    expect(card).toContain(NO_PERSON_LINE)
    expect(card).not.toMatch(/looking like|face or helmet|exact face/)
    expect(nodesOf(fin, 'ImageScaleToTotalPixels').map((x) => x.inputs.megapixels)).toEqual([1]) // the draw alone: no face, no gear
    expect((r.body as { still: KitStill }).still.castId).toBe('ana') // still drawn for the cast (Render's cast check is unchanged)
    rmSync(t.root, { recursive: true, force: true })
  })
  it('in the frame: the face goes and the person line is the generic one', async () => {
    const t = kitTake(); idPass(t, true)
    await press(t)
    const fin = t.submitted[1] as Sent
    expect(kleinText(fin)).toMatch(/looking like the person in images? 2\b.*Never add or reveal a face that image 2 does not show\./)
    expect(nodesOf(fin, 'ImageScaleToTotalPixels').length).toBeGreaterThan(1)
    rmSync(t.root, { recursive: true, force: true })
  })
})

describe('"Added by the app" at the press', () => {
  it('the preview lists what the app adds with its switch, and the negative in English beside the Chinese', async () => {
    const t = kitTake(); idPass(t, true)
    const draw = (await preview(t)).sent![0]
    expect(draw.negativeEnglish).toMatch(/^Low resolution, low quality, deformed limbs, deformed fingers, oversaturated, .*cluttered composition, blurry or distorted text$/)
    expect(draw.negativeSource).toBe("Qwen's own recommended negative prompt")
    const tail = draw.added?.find((a) => a.key === 'frameTail')
    expect(tail).toMatchObject({ on: true })
    expect(draw.prompt).toContain(tail!.text)
    const off = (await preview(t, { drawAdds: { frameTail: false } })).sent![0]
    expect(off.added?.find((a) => a.key === 'frameTail')).toMatchObject({ on: false, text: tail!.text })
    expect(off.prompt).not.toContain(tail!.text)
    rmSync(t.root, { recursive: true, force: true })
  })
  it('the paid draw honours a switch turned off; a bad switch is refused free', async () => {
    const t = kitTake(); idPass(t, true)
    const tail = (await preview(t)).sent![0].added!.find((a) => a.key === 'frameTail')!.text
    await press(t, { drawAdds: { frameTail: false } })
    expect(String((t.submitted[0] as Sent).json.pos.inputs.text)).not.toContain(tail)
    const bad = await hero(t).render({ count: 1, drawAdds: { frameTail: 'off' } })
    expect([bad.status, t.jobs.submits]).toEqual([400, 2])
    rmSync(t.root, { recursive: true, force: true })
  })
})

describe('stale safety: approved stills and edited words survive the new words', () => {
  // tonight's finish card, word for word (take-2026-10-30T03-35-56-412), as a still and an edit made under the old composer hold it
  const OLD_CARD = 'A real photograph: image 1 exactly as it is, with the person in it made the person shown in image 2: the exact face of image 2. Keep everything else in image 1 unchanged: the camera, framing, their pose, size and place in the frame, the ground, the background, the light and the colours. From image 2 only the person, not their pose, framing, background or light. Real photographic detail.'
  it('an approved still made under the old words is not stale after the change: same startKey, no Bible reason, the list says nothing', async () => {
    const t = kitTake(); idPass(t, true)
    const made = (await press(t)).body as { still: KitStill }
    const file = path.join(t.heroDir, `${made.still.id}.json`)
    // the still as the old composer wrote it: its own draw words with the raw tag tail, approved
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), prompt: 'A battlefield. In the frame: car2; grandstand. The top of the grandstand runs out of the picture at the top edge.', approved: true }))
    const takeBefore = readFileSync(path.join(t.shot, 'take.json'), 'utf8')
    const pv = await preview(t) // the new composer runs on the same take
    expect(pv.finishPrompt).not.toBe(OLD_CARD) // the words did change
    const list = (await hero(t).list()).body as { stills: (KitStill & { bibleWhy?: string; wordsChanged?: boolean })[] }
    const s = list.stills.find((x) => x.id === made.still.id)!
    expect(s.approved).toBe(true)
    expect(s.bibleWhy).toBeUndefined()
    expect(s.wordsChanged).toBeUndefined()
    const take = JSON.parse(readFileSync(path.join(t.shot, 'take.json'), 'utf8'))
    expect(readFileSync(path.join(t.shot, 'take.json'), 'utf8')).toBe(takeBefore) // composing never touches the take's keys
    expect(isStale(s, take)).toBe(false)
    expect(stillHardWhy(s, takeBible(t.pub, take))).toBeNull()
    rmSync(t.root, { recursive: true, force: true })
  })
  it('an edited finish stored on the take still goes exactly as written, even with the performer out of the frame', async () => {
    const t = kitTake(); idPass(t, false)
    await press(t, { finishPrompt: OLD_CARD })
    expect(kleinText(t.submitted[1] as Sent)).toBe(OLD_CARD)
    const pv = await preview(t, { finishPrompt: OLD_CARD })
    expect(pv.sent![1]).toMatchObject({ prompt: OLD_CARD, edit: 'finishPrompt' })
    expect(pv.sent![1].composed).not.toBe(OLD_CARD) // the box's Reset goes to the new words; the edit itself is untouched
    rmSync(t.root, { recursive: true, force: true })
  })
})
