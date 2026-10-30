// QA m13: an approved hero still can be un-approved (the still stays, only the approval comes off), and the route refuses what approve refuses.
import { describe, expect, it } from 'vitest'
import type { HeroStill } from '../../../src/shared/shotContract.ts'
import { mount, world } from './rig.ts'

describe('unapprove', () => {
  it('takes the approval off; the still stays in the list, and approving it again works', async () => {
    const w = world(); const m = mount(w, w.runtime())
    const a = (await m.render({ seed: 1 })).body.still as HeroStill
    expect((await m.approve(a.id)).body.still.approved).toBe(true)
    const r = await m.unapprove(a.id)
    expect([r.status, r.body.still]).toEqual([200, expect.objectContaining({ id: a.id, approved: false })])
    const listed = (await m.list()).body.stills as HeroStill[]
    expect(listed.map((s) => [s.id, s.approved])).toEqual([[a.id, false]])
    expect((await m.approve(a.id)).body.still.approved).toBe(true)
  })
  it('unknown and unsafe ids are refused; a foreign page cannot', async () => {
    const w = world(); const m = mount(w, w.runtime())
    expect((await m.unapprove('hero-missing')).status).toBe(404)
    expect((await m.unapprove('../take')).status).toBe(400)
    expect((await m.unapprove('hero-x', 'take-other')).status).toBe(404)
    expect((await m.raw('/unapprove', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{}' })).status).toBe(403)
  })
})
