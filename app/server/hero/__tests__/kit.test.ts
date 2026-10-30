// Hero still on a kit world (wave 2): who plays the 3D performer (none named: a plain 409; else perform session first, then the
// cast card Perform picked, then a plain 409), and the kit words (fire words only for a fire kind; a generated piece by its plain
// noun, never aged). The end-to-end press runs over the fake Cloud: no network, no credits.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { BANNED, GRAIN } from '../../prompt/banned.ts'
import { promptFor } from '../../l2r/prompt.ts'
import { KitStore } from '../../stage3d/store.ts'
import { approveSetOnDisk } from '../../bible/__tests__/approveFixture.ts'
import { resolveWho } from '../face.ts'
import { FIRE_KINDS, plainNoun } from '../kitWords.ts'
import { mount, SID, world } from './rig.ts'

const CAST = { name: 'Brann', description: 'a weathered soldier in his forties with a grey beard' }

/** the rig's world with its take moved onto a kit world (performance.json may name a cast card) */
function kitWorld(o: Parameters<typeof world>[0] & { castId?: string; session?: boolean } = {}) {
  const w = world(o)
  const kit = new KitStore(w.pub).create({ plan: BATTLEFIELD, perf: { path: [[0, -20], [0, 4]], ...(o.castId ? { castId: o.castId } : {}) }, description: 'kit hero test' })
  approveSetOnDisk(w.pub, kit.id)
  const take = { ...w.take, worldId: `locations/${kit.id}`, packId: 'mocap-0000beef' }
  writeFileSync(path.join(w.shot, 'take.json'), JSON.stringify(take))
  if (o.session) { // a perform session lifted into the mocap pack id: the session still comes first
    const lift = path.join(w.pub, 'lab-assets', 'perform', SID, 'lift', 'lift.json')
    writeFileSync(lift, JSON.stringify({ status: 'done', packId: take.packId }))
  }
  return { ...w, take, kit }
}
/** a second cast card ("brann") with its face image on disk */
function addBrann(pub: string) {
  const f = path.join(pub, 'lab-assets', 'projects', 'default', 'project.json')
  const proj = JSON.parse(readFileSync(f, 'utf8'))
  const refs = ['/lab-assets/cast/brann/front.png', '/lab-assets/cast/brann/face.png']
  for (const r of refs) { mkdirSync(path.dirname(path.join(pub, r)), { recursive: true }); writeFileSync(path.join(pub, r), 'img') }
  proj.ingredients.cast.push({ id: 'brann', name: 'Brann', versions: [{ version: 1, created: '2026-10-20T00:00:00.000Z', payload: { ...CAST, references: refs, sheets: [] } }] })
  writeFileSync(f, JSON.stringify(proj))
}

describe('who plays the 3D performer: session, then cast, then 409', () => {
  it('a perform session lifted into the take\'s pack comes first', async () => {
    const w = kitWorld({ session: true, castId: 'brann' }); addBrann(w.pub)
    const who = await resolveWho(w.pub, w.take, undefined, { castId: 'brann' })
    expect([who.sid.startsWith('perf-'), who.name]).toEqual([true, 'Ana'])
  })
  it('no session: the cast card Perform picked; with none picked, a 409 (never a guessed first card)', async () => {
    const w = kitWorld(); addBrann(w.pub)
    expect((await resolveWho(w.pub, w.take, undefined, { castId: 'brann' }))).toMatchObject({ sid: 'cast:brann', name: 'Brann' })
    expect((await resolveWho(w.pub, w.take, undefined, { castId: 'brann' })).faceFile).toMatch(/brann[\\/]face\.png$/)
    // review F9: the free pick first (a rebuilt set keeps the looks but names nobody), a new look only when there is none
    await expect(resolveWho(w.pub, w.take, undefined, {})).rejects.toMatchObject({ status: 409, code: 'no_cast', message: expect.stringMatching(/No one plays the person yet: on the Stage pick The subject and press Plays the subject beside their look \(free\), or make their look if they have none/) })
  })
  it('no cast card with a face: 409 no_cast in plain words, never an invented face', async () => {
    const w = kitWorld({ face: false })
    await expect(resolveWho(w.pub, w.take, undefined, {})).rejects.toMatchObject({ status: 409, code: 'no_cast', message: expect.stringMatching(/No one plays the person yet: on the Stage pick The subject/) })
    await expect(resolveWho(w.pub, w.take, undefined, { castId: 'ghost' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/"ghost"/) })
  })
  it('a panorama take is unchanged: no session is still a 400, never a cast fallback', async () => {
    const w = world({ cast: false })
    await expect(resolveWho(w.pub, w.take)).rejects.toMatchObject({ status: 400, code: 'no_cast' })
  })
  it('end to end: a kit take with its cast but no clay depth is 409 no_depth; with no cast it is 409 no_cast; nothing is submitted', async () => {
    const w = kitWorld({ castId: 'brann' }); addBrann(w.pub)
    const r = await mount(w, w.runtime()).render()
    expect([r.status, r.body.code, w.jobs.submits]).toEqual([409, 'no_depth', 0])
    const bare = kitWorld({ face: false })
    const refused = await mount(bare, bare.runtime()).render()
    expect([refused.status, refused.body.code, bare.jobs.submits]).toEqual([409, 'no_cast', 0])
    rmSync(w.root, { recursive: true, force: true }); rmSync(bare.root, { recursive: true, force: true })
  })
})

describe('kit words', () => {
  it('only the fire kinds name fire; a generated piece (a plain-noun kind, no KIT key) is named by its noun, never aged', () => {
    for (const [k, w] of Object.entries(FIRE_KINDS)) expect(BANNED.test(w), k).toBe(true)
    expect(plainNoun('steam_train')).toBe('steam train'); expect(plainNoun('leatherTrunk')).toBe('leather trunk'); expect(plainNoun('old-trunk')).toBe('old trunk')
  })
  it('Render\'s prompt for a kit take reads the plan\'s sentence and the performer\'s cast card (never fire)', async () => {
    const w = kitWorld({ castId: 'brann' }); addBrann(w.pub)
    const p = await promptFor(w.pub, w.take)
    expect(p).toMatch(/^A weathered soldier in his forties with a grey beard, at /)
    expect(p).toMatch(/battlefield at dusk: broken fences, a burning palisade, spears in the mud/i)
    expect(GRAIN.test(p)).toBe(false) // the app adds no grain words of its own
    rmSync(w.root, { recursive: true, force: true })
  })
})
