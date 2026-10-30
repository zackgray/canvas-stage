// The join's "two clays" seam (E139), through the real press, preview and render: the still's depth control and the render's
// layout video are the massing clay when it is current for the take, else the precise clay, and each records which; the layout
// check keeps reading the precise clay; a new precise export makes the last massing clay not current. Fake Cloud, no credits.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import { writeDepthControl } from '../../hero/depthImage.ts'
import type { KitStill } from '../../hero/kitSpec.ts'
import { kitInfo, kitTake, pngJob, stillPng, zdepthPng, type KitTake } from '../../hero/__tests__/kitRig.ts'
import { mount as heroMount, TAKE as HERO_TAKE } from '../../hero/__tests__/rig.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { resetFinishing } from '../../l2r/finish.ts'
import { mount as l2rMount, world } from '../../l2r/__tests__/rig.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { forgetMassing } from '../modelClay.ts'

afterEach(() => { resetClaims(); resetFinishing() })

/** a massing clay beside the take's precise clay: massing.json for `startKey` (default the take's) and a zdepth that is NOT the precise one */
function putMassing(pub: string, take: { id: string; startKey: string; frames: number }, o: { startKey?: string; depth?: boolean } = {}) {
  const dir = path.join(pub, 'lab-assets', 'shots', take.id, 'clay', 'massing')
  mkdirSync(dir, { recursive: true })
  const url = `/lab-assets/shots/${take.id}/clay/massing`
  writeFileSync(path.join(dir, 'massing.json'), JSON.stringify({ takeId: take.id, startKey: o.startKey ?? take.startKey, frames: take.frames, mp4: `${url}/massing.mp4`, dir: url,
    depth: o.depth === false ? null : { kind: 'planar', unitM: 0.01, frames: take.frames, width: 1920, height: 1088, pattern: 'zdepth_%03d.png' }, finishedAt: '2026-10-25T00:00:00.000Z' }))
  writeFileSync(path.join(dir, 'zdepth_000.png'), zdepthPng(40))
  writeFileSync(path.join(dir, 'massing.mp4'), 'massing')
  return dir
}

type Sent = { json: Record<string, { inputs: Record<string, unknown> }> }
const hero = (t: KitTake) => heroMount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
async function press(t: KitTake) {
  t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000b01', stillPng()), pngJob('aaaaaaaa-0000-4000-8000-000000000b02', stillPng()))
  return (await hero(t).render({ count: 1 })).body as { still: KitStill }
}
/** what writeDepthControl makes of a zdepth file, as bytes (to tell which clay the control image came from) */
const controlOf = (zdepth: string) => { const out = path.join(tmpdir(), `ctl-${Math.random().toString(36).slice(2)}.png`); writeDepthControl(zdepth, out); return readFileSync(out) }

describe('the still\'s depth control: massing when current, else precise', () => {
  it('a current massing clay drives the control image and is recorded; the layout check still reads the precise clay', async () => {
    const t = kitTake()
    const mdir = putMassing(t.pub, t.take)
    const { still } = await press(t)
    expect(still.controlDepth).toBe('massing')
    expect(readFileSync(path.join(t.heroDir, 'depth-000.png'))).toEqual(controlOf(path.join(mdir, 'zdepth_000.png')))
    // the drawn picture matches the PRECISE box; the massing box is 40 px away, so a layout check on the massing would fail it
    expect(still.layout).toMatchObject({ ok: true })
  })
  it('none, stale (an earlier start) or depthless: the precise depth, recorded as precise, silently', async () => {
    for (const o of [null, { startKey: 'deadbeef' }, { depth: false }] as const) {
      const t = kitTake()
      if (o) putMassing(t.pub, t.take, o)
      const { still } = await press(t)
      expect(still.controlDepth).toBe('precise')
      expect(readFileSync(path.join(t.heroDir, 'depth-000.png'))).toEqual(controlOf(path.join(t.clayDir, 'zdepth_000.png')))
    }
  })
  it('the free preview shows the same clay the press would bind, in its own file per clay', async () => {
    const t = kitTake()
    const pv = async () => (await hero(t).raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: HERO_TAKE }) })).body as unknown as StillPreviewResponse
    expect((await pv()).depthUrl).toMatch(/\/preview-depth-000\.png/)
    const mdir = putMassing(t.pub, t.take)
    expect((await pv()).depthUrl).toMatch(/\/preview-massing-depth-000\.png/)
    expect(readFileSync(path.join(t.heroDir, 'preview-massing-depth-000.png'))).toEqual(controlOf(path.join(mdir, 'zdepth_000.png')))
  })
})

describe('the render\'s layout video: massing when current, else precise', () => {
  it('a current massing clay is the bound video, the chip and the record; a stale one falls back to the precise clay', async () => {
    for (const stale of [false, true]) {
      const w = world()
      putMassing(w.pub, w.take, stale ? { startKey: 'deadbeef' } : {})
      const bound: string[] = []
      const rt = w.runtime({ bind: (_wf, _n, _f, file) => { bound.push(file) } })
      const m = l2rMount(w, rt)
      const chip = ((await m.status()).body as { chips: { role: string; url: string }[] }).chips.find((c) => c.role === 'layout')!
      const r = await m.render()
      expect(r.status).toBe(200)
      const rec = (r.body as { render: { clay: string; layoutClay: string } }).render
      const want = stale ? 'precise' : 'massing'
      expect(rec.layoutClay).toBe(want)
      expect(path.basename(bound.find((f) => f.endsWith('.mp4'))!)).toBe(want === 'massing' ? 'massing.mp4' : 'clay.mp4')
      expect(rec.clay).toBe(chip.url)
      expect(chip.url).toMatch(want === 'massing' ? /\/clay\/massing\/massing\.mp4$/ : /\/clay\/clay\.mp4$/)
    }
  })
})

describe('a new precise export makes the last massing clay not current', () => {
  it('forgetMassing (the clay upload of frame 0 calls it) drops massing.json, and the press falls back', async () => {
    const t = kitTake()
    const mdir = putMassing(t.pub, t.take)
    forgetMassing(t.pub, t.take.id)
    expect(existsSync(path.join(mdir, 'massing.json'))).toBe(false)
    expect((await press(t)).still.controlDepth).toBe('precise')
  })
})
