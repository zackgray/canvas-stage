// M4: a kit still is two billed jobs under one intent. Both must fit the day budget before the first is sent; a draw whose
// finish never ran is listed as "drawn, unfinished" and "Finish" runs only the Klein step from the saved intent. Fake Cloud.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Job } from '@comfyorg/sdk'
import { describe, expect, it } from 'vitest'
import type { KitListExtra, KitStill } from '../kitSpec.ts'
import { kitInfo, kitTake, pngJob, stillPng } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'

type Sent = { json: Record<string, { class_type?: string; inputs: Record<string, unknown> }> }
const classes = (s: Sent) => Object.values(s.json).map((n) => n.class_type)

describe('kit still: budget for both jobs, and Finish for a draw whose finish never ran', () => {
  it('15 cr left today: refused before the draw (429, free), no intent, no draw on disk', async () => {
    const t = kitTake({ cap: 15 })
    const r = await mount(t, t.runtime({ fetchInfo: async () => kitInfo() })).render({})
    expect([r.status, t.jobs.submits]).toEqual([429, 0])
    expect(existsSync(t.heroDir) ? readdirSync(t.heroDir).filter((f) => /^intent-|-draw\.png$/.test(f)) : []).toEqual([])
  })

  it('the finish never ran: the draw is listed unfinished; Finish sends only the Klein job and the still appears', async () => {
    const t = kitTake()
    let n = 0
    const submit = async (wf: { json: unknown }) => {
      n++; t.jobs.submits++
      t.submitted.push({ json: JSON.parse(JSON.stringify(wf.json)) })
      if (n === 2) throw new Error('network down') // the dev server's link died between the two jobs: nothing billed for the finish
      return pngJob('aaaaaaaa-0000-4000-8000-000000000d01', stillPng()) as Job
    }
    const rt1 = t.runtime({ fetchInfo: async () => kitInfo(), submit })
    const first = await mount(t, rt1).render({})
    expect(first.status).toBe(502)
    const drawLabel = rt1.store.list().find((r) => r.jobId)!.label
    expect(drawLabel).toMatch(/^hero-still \S+ hero-\S+-draw$/) // m3: the draw job is labelled apart from the still

    t.queue.push(pngJob('aaaaaaaa-0000-4000-8000-000000000d02', stillPng()))
    const hero = mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
    const listed = (await hero.list()).body as { stills: KitStill[] } & KitListExtra
    expect(listed.stills).toEqual([])
    expect(listed.unfinished).toHaveLength(1)
    const u = listed.unfinished![0]
    expect(u).toMatchObject({ role: 'opening', frame: 0, png: expect.stringMatching(/-draw\.png\?v=\d+-\d+$/) })

    const before = t.jobs.submits
    const fin = await hero.raw('/finish', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE }) })
    expect(fin.status).toBe(200)
    expect(t.jobs.submits).toBe(before + 1)
    const sent = t.submitted.at(-1) as Sent
    expect(classes(sent)).not.toContain('ControlNetApplyAdvanced') // no second draw
    expect(classes(sent)).toContain('ReferenceLatent') // the Klein finish
    const after = (await hero.list()).body as { stills: KitStill[] } & KitListExtra
    expect(after.unfinished).toEqual([])
    expect(after.stills.map((s) => s.id)).toEqual([u.id])
    expect(after.stills[0]).not.toHaveProperty('finish')
    expect(existsSync(path.join(t.heroDir, `${u.id}.json`))).toBe(true)
    // nothing left to finish: 404, free
    const again = await hero.raw('/finish', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE }) })
    expect([again.status, t.jobs.submits]).toEqual([404, before + 1])
  })
})
