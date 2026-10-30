import { describe, expect, it } from 'vitest'
import { addVersion, resolveUses, upsertShot } from '../model.ts'
import { staleness } from '../stale.ts'
import { CLIP, LOOK, project, STILL, T } from './fixture.ts'

const FRESH = { stale: false, reasons: [], what: [] }

describe('staleness', () => {
  it('nothing is stale when every artefact was made from what the shot uses', () => {
    expect(staleness(project())).toEqual({ a: FRESH, b: FRESH })
  })

  it('editing the look marks every shot following it stale, down the pipe, with the version change as the reason', () => {
    const p = addVersion(project(), 'look', 'loc-1', { ...LOOK, mood: 'dry, golden' }, T)
    expect(staleness(p).a).toEqual({
      stale: true,
      reasons: ['look v1 → v2', 'still is stale', 'clip is stale'],
      what: ['still', 'clip', 'finish'],
    })
  })

  it('a shot that pins the look is not stale when the look moves on', () => {
    const p = addVersion(project(), 'look', 'loc-1', LOOK, T)
    expect(staleness(p).b).toEqual(FRESH)
  })

  it('recasting ("red dress, blonde hair") marks the following shot stale, the pinned one not', () => {
    const p = addVersion(project(), 'cast', 'mara', { name: 'Mara', description: 'red dress, blonde hair', references: [], sheets: [] }, T)
    const s = staleness(p)
    expect(s.a.reasons[0]).toBe('cast mara v1 → v2')
    expect(s.b).toEqual(FRESH)
  })

  it('a re-rendered still leaves the still fresh but makes the clip and the finish stale (transitive)', () => {
    const p = project()
    const a = p.shots[0]
    const q = upsertShot(p, { ...a, still: { ...a.still!, path: '/lab-assets/renders/view-a/stills/render-9.png' } })
    expect(staleness(q).a).toEqual({ stale: true, reasons: ['still re-rendered', 'clip is stale'], what: ['clip', 'finish'] })
  })

  it('a re-rendered clip makes only the finish stale', () => {
    const p = project()
    const a = p.shots[0]
    const q = upsertShot(p, { ...a, clip: { ...a.clip!, path: '/lab-assets/renders/video-a/clip-2.mp4' } })
    expect(staleness(q).a).toEqual({ stale: true, reasons: ['clip re-rendered'], what: ['finish'] })
  })

  it('a still re-made from the new look is fresh while its old clip stays stale', () => {
    let p = addVersion(project(), 'look', 'loc-1', LOOK, T)
    const a = p.shots[0]
    p = upsertShot(p, { ...a, still: { path: '/lab-assets/renders/view-a/stills/render-3.png', created: T, madeFrom: resolveUses(p, a.uses) } })
    expect(staleness(p).a).toEqual({ stale: true, reasons: ['look v1 → v2', 'still re-rendered', 'clip is stale'], what: ['clip', 'finish'] })
  })

  it('adding or dropping an ingredient, or pinning back to an older version, is a change too', () => {
    let p = addVersion(project(), 'prop', 'car', { name: 'Car', description: 'red coupe', references: [], sheets: [] }, T)
    const b = p.shots[1]
    p = upsertShot(p, { ...b, uses: { ...b.uses, cast: [], props: [{ id: 'car', version: 'latest' }] } })
    expect(staleness(p).b.reasons).toEqual(['cast mara removed', 'prop car added'])

    p = addVersion(project(), 'look', 'loc-1', LOOK, T)
    const a = p.shots[0]
    p = upsertShot(p, { ...a, still: { ...a.still!, madeFrom: resolveUses(p, a.uses) }, clip: undefined, finish: undefined, uses: { ...a.uses, look: { id: 'loc-1', version: 1 } } })
    expect(staleness(p).a.reasons).toEqual(['look v2 → v1'])
  })

  it('a clip made from a still other than the shot\'s is stale; without a recorded source it is judged on ingredients alone', () => {
    const p = project()
    const a = p.shots[0]
    expect(staleness(upsertShot(p, { ...a, clip: { ...a.clip!, from: '/lab-assets/renders/view-z/stills/x.png' } })).a.what).toEqual(['clip', 'finish'])
    const { from: _from, ...noFrom } = a.clip!
    expect(_from).toBe(STILL)
    expect(staleness(upsertShot(p, { ...a, clip: noFrom, finish: { ...a.finish!, from: CLIP } })).a).toEqual(FRESH)
  })
})
