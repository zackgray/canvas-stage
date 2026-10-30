// @vitest-environment jsdom
// The v2 brief on the Scene design: it is kept on the design and saved to the scene sheet with the flat lines (bibleWrite,
// writeBible); a brief replaced as a whole (Guided, Undo) reaches an existing world's sheet at once (useV2Save); Guided writes
// plain words; the v2 helpers (renameTag, savable) behave.
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validBrief } from '../../../../server/bible/validate'
import { RUSTIC } from '../../../../server/planner/briefExamples'
import type { SceneBrief } from '../../../shared/bibleContract'
import type { SceneBriefV2 } from '../../../shared/briefContract'
import { bibleWrite } from '../design/buildCheck'
import { castCard, freshGuided } from '../design/guided'
import { finishGuided } from '../design/routes'
import { freshDesign, saveDesign, type Design } from '../design/state'
import { useDesign } from '../design/useDesign'
import { writeBible } from '../design/useBuildSet'
import { flatTouched, renameTag, savable } from '../design/briefV2'
import { useV2Save } from '../design/useV2Save'
import { mkPiece, type Piece } from '../design/model'
import type { SceneCtx } from '../sceneCtx'
import { fakeApi, WORLD } from './fakes'

const V2 = RUSTIC.answer as unknown as SceneBriefV2
const FLAT: SceneBrief = {
  brief: V2.logline, lighting: 'Morning sun through the open door.', materials: 'Kick wheel: oiled olive wood.', background: '', beats: ['Potter kicks the flywheel.'], warnings: [],
  elements: V2.elements.map(({ name, tag, type, look, supported }) => ({ name, tag, type, look, supported })), v2: V2,
}
/** a design as a finished brief holds it: the flat lines, the v2 answer, a piece per element */
const designed = (v2: SceneBriefV2 | null = V2): Design => ({
  ...freshDesign(), brief: FLAT.brief, lighting: FLAT.lighting, materials: FLAT.materials, action: FLAT.background, v2,
  pieces: FLAT.elements.map((e) => mkPiece(e.tag, e.name, e.type as Piece['type'], { line: e.look })),
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

describe('the v2 brief on the scene sheet', () => {
  it('is kept on the design and saved as `brief` with the flat lines', async () => {
    const d = designed()
    expect(d.v2).toEqual(V2)
    const w = bibleWrite({ ...d, pieces: d.pieces.map((p) => ({ ...p, onBoard: true })) })
    expect(w.brief?.logline).toBe(V2.logline)
    const { api } = fakeApi()
    await writeBible(api, WORLD, { ...d, pieces: d.pieces.map((p) => ({ ...p, onBoard: true, looks: ['/lab-assets/x.png'], state: 'yours' as const, cardId: p.type === 'person' ? p.tag : undefined })) })
    const sent = api.save.mock.calls[0][0] as unknown as { brief?: SceneBriefV2; lighting?: string }
    expect(sent.brief?.light.direction).toBe(V2.light.direction)
    expect(() => validBrief(sent.brief)).not.toThrow() // the real gate takes what the UI sends
    expect(sent.lighting).toBe(d.lighting) // untouched light: the flat line travels as it was
  })
  it('a design with no v2 saves exactly as before (no brief key)', () => {
    const d = designed(null)
    expect(d.v2).toBeNull()
    expect('brief' in bibleWrite(d)).toBe(false)
  })
  it('a brief whose light is in the user list lets the sheet derive its lines (they are not sent stale)', () => {
    const d = designed()
    const edited = { ...V2, user: [...(V2.user ?? []), 'light.direction'] }
    const w = bibleWrite({ ...d, v2: edited })
    expect(w.brief?.user).toContain('light.direction')
    expect('lighting' in w).toBe(false)
    expect(flatTouched({ ...V2, user: ['camera.size'] })).toBe(false)
  })
})

function Wrap({ worldId, bible, onD }: { worldId: string | null; bible: SceneCtx['bible']; onD?: (d: Design) => void }) {
  const s = useDesign([])
  onD?.(s.d)
  useV2Save({ s, worldId, bible })
  return null
}

describe('a brief replaced whole reaches the sheet at once (useV2Save)', () => {
  it('a v2Stale design saves the brief and the lines Build would write, once, then the flag clears', async () => {
    saveDesign({ ...designed(), v2Stale: true }) // the flag a whole-brief replacement sets
    const { api } = fakeApi()
    let last: Design | null = null
    render(<Wrap worldId={WORLD} bible={api} onD={(d) => { last = d }} />)
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1), { timeout: 3000 })
    const sent = api.save.mock.calls[0][0] as unknown as { worldId: string; brief: SceneBriefV2; lighting?: string }
    expect(sent).toMatchObject({ worldId: WORLD, lighting: FLAT.lighting })
    expect(sent.brief.light).toEqual(V2.light)
    expect(last!.v2Stale).toBe(false)
    await new Promise((r) => setTimeout(r, 900))
    expect(api.save).toHaveBeenCalledTimes(1)
  })
  it('nothing is saved before there is a world, and a brief gone (Undo) clears the sheet as null', async () => {
    saveDesign({ ...freshDesign(), v2: null, v2Stale: true })
    const { api } = fakeApi()
    const r = render(<Wrap worldId={null} bible={api} />)
    await new Promise((res) => setTimeout(res, 900))
    expect(api.save).not.toHaveBeenCalled()
    r.rerender(<Wrap worldId={WORLD} bible={api} />)
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(api.save.mock.calls[0][0]).toMatchObject({ worldId: WORLD, brief: null })
  })
})

describe('Guided writes plain words', () => {
  it('the brief and v2 carry no stage labels; the order reads as a brief: place, light, who is in it, the story', () => {
    const g = freshGuided([castCard('Potter', 'person', 'a woman in a linen apron', { tag: 'potter', look: '/lab-assets/p.png' })])
    for (const id of ['loc', 'mood', 'story'] as const) { g.st[id].cands = [`/lab-assets/${id}.png`]; g.st[id].picks = [0] }
    g.st.loc.text = 'A whitewashed island workshop'
    g.st.mood.text = 'Warm morning sun through the open door'
    g.st.story.text = 'She kicks the wheel. She draws the clay up.'
    const d = freshDesign()
    d.pieces = [{ id: 'p1', tag: 'potter', name: 'Potter', type: 'person', looks: ['/lab-assets/p.png'], look: 0, state: 'yours', line: 'a woman in a linen apron', onBoard: true }]
    const out = finishGuided(d, g)
    for (const text of [out.brief!, out.v2!.logline]) for (const label of ['Set in', 'Cast:', 'Materials:', 'Mood and light:', 'Beats:']) expect(text).not.toContain(label)
    expect(out.brief).toBe('A whitewashed island workshop.\nWarm morning sun through the open door.\n@potter is in the scene.\nShe kicks the wheel. She draws the clay up.')
    expect(out.panels).toMatchObject({ brief: true })
    expect(out.v2!.light.key).toBe('Warm morning sun through the open door')
    expect(out.v2!.beats.map((b) => b.does)).toEqual(['kicks the wheel', 'draws the clay up'])
    expect(() => validBrief(out.v2)).not.toThrow()
  })
})

describe('the v2 helpers', () => {
  it('renameTag follows a tag through the logline, elements and beats; savable needs words, an element and a beat', () => {
    const r = renameTag(V2, 'potter', 'ceramist')
    expect(r.logline).toContain('@ceramist')
    expect(r.logline).not.toContain('@potter')
    expect(r.elements.find((e) => e.tag === 'ceramist')?.name).toBe('The potter')
    expect(r.beats.every((b) => b.who === '@ceramist')).toBe(true)
    expect(savable(V2)).toBe(true)
    expect(savable({ ...V2, logline: 'short' })).toBe(false)
    expect(savable({ ...V2, elements: [] })).toBe(false)
    expect(savable({ ...V2, beats: [] })).toBe(false)
  })
})
