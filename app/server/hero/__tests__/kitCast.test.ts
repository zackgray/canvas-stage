// Review M2: who plays the 3D performer is only ever the card Perform saved, in the studio's project. A kit world whose performance
// names no castId is refused (409, plain words) before anything is written or submitted, for the hero still and for Render; a card
// id that only exists in another project never resolves.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { emptyProject } from '../../../src/project/model.ts'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { KitStore } from '../../stage3d/store.ts'
import { approveSetOnDisk } from '../../bible/__tests__/approveFixture.ts'
import { mount as mountL2R, world as l2rWorld } from '../../l2r/__tests__/rig.ts'
import { castFace } from '../castCard.ts'
import { resolveWho } from '../face.ts'
import { mount, world } from './rig.ts'

/** the hero rig's take moved onto a kit world whose performance names `castId` (or nothing) */
function kitHero(castId?: string) {
  const w = world()
  const kit = new KitStore(w.pub).create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]], ...(castId ? { castId } : {}) }, description: 'kit cast test' })
  approveSetOnDisk(w.pub, kit.id)
  const take = { ...w.take, worldId: `locations/${kit.id}`, packId: 'mocap-0000beef' }
  writeFileSync(path.join(w.shot, 'take.json'), JSON.stringify(take))
  return { ...w, take }
}

/** a second project on disk with a card "bob" that has a face: the studio never edits it */
function otherProject(pub: string) {
  const refs = ['/lab-assets/cast/bob/front.png', '/lab-assets/cast/bob/face.png']
  for (const r of refs) { mkdirSync(path.dirname(path.join(pub, r)), { recursive: true }); writeFileSync(path.join(pub, r), 'img') }
  const p = emptyProject('other', 'Other', '2026-10-20T00:00:00.000Z')
  p.ingredients.cast.push({ id: 'bob', name: 'Bob', versions: [{ version: 1, created: '2026-10-20T00:00:00.000Z', payload: { name: 'Bob', description: 'someone else', references: refs, sheets: [] } }] })
  mkdirSync(path.join(pub, 'lab-assets', 'projects', 'other'), { recursive: true })
  writeFileSync(path.join(pub, 'lab-assets', 'projects', 'other', 'project.json'), JSON.stringify(p))
}

describe('kit hero: no cast card named', () => {
  it('is 409 in plain words, with no intent, no job, no ledger line and nothing sent to Cloud', async () => {
    const w = kitHero()
    const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([409, 'no_cast'])
    expect(r.body.error ?? r.body.message).toMatch(/No one plays the person yet: on the Stage pick The subject/)
    expect(readdirSync(w.heroDir).filter((f) => f.startsWith('intent-') || /^hero-.*\.json$/.test(f))).toEqual([])
    expect(w.jobs.submits).toBe(0)
    expect(w.submitted).toEqual([])
    expect(w.jobs.ledger()).toBe('')
    expect(existsSync(w.jobs.dir) ? readdirSync(w.jobs.dir) : []).toEqual([])
    rmSync(w.root, { recursive: true, force: true })
  })

  it('with the card named it passes the cast check and waits on the clay depth (the paid draw for the card is in kitStill.test)', async () => {
    const w = kitHero('ana')
    const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'no_depth', 0])
    rmSync(w.root, { recursive: true, force: true })
  })
})

describe('the cast card is read from the studio\'s project only', () => {
  it('a card in another project never resolves, and no id resolves no one', async () => {
    const w = kitHero('bob'); otherProject(w.pub)
    expect(await castFace(w.pub, 'bob')).toBeNull()
    expect(await castFace(w.pub, undefined)).toBeNull()
    expect(await castFace(w.pub, 'ana')).toMatchObject({ cardId: 'ana' })
    await expect(resolveWho(w.pub, w.take, undefined, { castId: 'bob' })).rejects.toMatchObject({ status: 409, code: 'no_cast', message: expect.stringMatching(/"bob"/) })
    const r = await mount(w, w.runtime()).render()
    expect([r.status, w.jobs.submits]).toEqual([409, 0])
    rmSync(w.root, { recursive: true, force: true })
  })
})

describe('kit Render (Layout-To-Render): no cast card named', () => {
  it('is 409 before any render record or submit', async () => {
    const w = l2rWorld()
    const kit = new KitStore(w.pub).create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]] }, description: 'kit l2r cast test' })
    writeFileSync(w.dirs.take, JSON.stringify({ ...w.take, worldId: `locations/${kit.id}`, packId: 'mocap-0000beef' }))
    const r = await mountL2R(w, w.runtime()).render()
    expect([r.status, r.body.code]).toEqual([409, 'no_cast'])
    expect(existsSync(w.dirs.l2r) ? readdirSync(w.dirs.l2r) : []).toEqual([])
    expect([w.jobs.submits, w.jobs.ledger()]).toEqual([0, ''])
    rmSync(w.root, { recursive: true, force: true })
  })
})
