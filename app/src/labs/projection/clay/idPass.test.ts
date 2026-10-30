// The ID pass's material swap: class colours, entity inheritance, and the guard that matters most: the kit's shared materials are
// untouched afterwards (also when the draw throws).
import { BoxGeometry, Fog, Group, Mesh, MeshStandardMaterial, type MeshBasicMaterial, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { entityOf, idColorOf, ID_COLORS, PROP_COLORS, withIdMaterials, type Rgb } from './idPass'

const shared = new MeshStandardMaterial({ color: 0x808080 })
const geo = new BoxGeometry()
function tagged(entity: string | null, name: string) {
  const g = new Group()
  if (entity) g.userData.entity = entity
  const m = new Mesh(geo, shared); m.name = name
  const inner = new Group(); inner.add(m); g.add(inner)
  return { g, m }
}
function scene() {
  const s = new Scene()
  s.fog = new Fog(0xffffff, 1, 50)
  const parts = { world: tagged(null, 'w'), hero: tagged('hero', 'h'), lead: tagged('extra:0:2', 'l'), green: tagged('extra:3:1', 'g'), dragon: tagged('creature:dragon', 'd'), crate: tagged('prop:crate', 'p') }
  for (const p of Object.values(parts)) s.add(p.g)
  return { s, parts }
}
const colourOf = (m: Mesh) => (m.material as MeshBasicMaterial).color.getHexString()
const hex = (tag: string) => idColorOf(tag)!.map((v) => v.toString(16).padStart(2, '0')).join('')

describe('ID pass colours', () => {
  it('draws hero red, second lead blue, extras green, creature magenta, a prop its own colour, the world black', () => {
    const { s, parts } = scene()
    const seen: Record<string, string> = {}
    const table = withIdMaterials(s, () => { for (const [k, p] of Object.entries(parts)) seen[k] = colourOf(p.m) })
    expect(seen).toEqual({ world: '000000', hero: 'ff0000', lead: '0000ff', green: hex('extra:3:1'), dragon: 'ff00ff', crate: hex('prop:crate') })
    expect(table).toEqual({ hero: [255, 0, 0], 'extra:0:2': [0, 0, 255], 'extra:3:1': idColorOf('extra:3:1'), 'creature:dragon': [255, 0, 255], 'prop:crate': idColorOf('prop:crate') })
    expect(idColorOf('extra:1:0')).not.toEqual(idColorOf('extra:1:1')) // one green per variant
    expect(idColorOf('nonsense')).toBeNull()
    expect(ID_COLORS.world).toEqual([0, 0, 0])
  })
  it('a scene without entities is all world black and gives an empty table', () => {
    const s = new Scene(); const a = tagged(null, 'a'); s.add(a.g)
    let c = ''
    expect(withIdMaterials(s, () => { c = colourOf(a.m) })).toEqual({})
    expect(c).toBe('000000')
  })
  it('finds the nearest entity up the parent chain', () => {
    const { parts } = scene()
    expect(entityOf(parts.hero.m)).toBe('hero')
    expect(entityOf(parts.world.m)).toBeNull()
  })
})

describe('ID pass: one colour per piece (recipe wave)', () => {
  const FIGURES: Rgb[] = [[255, 0, 0], [0, 0, 255], [255, 0, 255], [0, 255, 0], [0, 200, 60], [120, 255, 0], [0, 255, 150], [60, 160, 0], [170, 255, 90], [0, 0, 0]]
  it('every prop colour is distinct and never a figure colour or the world black', () => {
    const keys = PROP_COLORS.map((c) => c.join(','))
    expect(new Set(keys).size).toBe(PROP_COLORS.length)
    for (const f of FIGURES) expect(keys).not.toContain(f.join(','))
  })
  it('each pieceTag gets its own colour in one draw, also two tags that hash to one slot', () => {
    // find two tags sharing a palette slot, so the step-past rule is exercised
    const tags = Array.from({ length: 200 }, (_, i) => `prop:p${i}`)
    const a = tags[0], b = tags.find((t) => t !== a && idColorOf(t)!.join() === idColorOf(a)!.join())!
    expect(b).toBeTruthy()
    const s = new Scene(), parts = [a, b, 'prop:engine', 'prop:lamp'].map((t) => tagged(t, t))
    for (const p of parts) s.add(p.g)
    const seen: string[] = []
    const table = withIdMaterials(s, () => { for (const p of parts) seen.push(colourOf(p.m)) })
    expect(new Set(seen).size).toBe(4)
    expect(Object.keys(table).sort()).toEqual([a, b, 'prop:engine', 'prop:lamp'].sort())
    expect(new Set(Object.values(table).map((c) => c.join())).size).toBe(4)
    // the same scene drawn again (the next keyframe) gives the same table
    expect(withIdMaterials(s, () => {})).toEqual(table)
  })
})

describe('ID pass restore', () => {
  it('leaves the shared material objects, the fog and the background as they were', () => {
    const { s, parts } = scene()
    const fog = s.fog
    const before = { color: shared.color.getHex(), roughness: shared.roughness, version: shared.version }
    withIdMaterials(s, () => { /* draw */ })
    for (const p of Object.values(parts)) expect(p.m.material).toBe(shared)
    expect(s.fog).toBe(fog)
    expect({ color: shared.color.getHex(), roughness: shared.roughness, version: shared.version }).toEqual(before)
  })
  it('restores when the draw throws', () => {
    const { s, parts } = scene()
    expect(() => withIdMaterials(s, () => { throw new Error('gl lost') })).toThrow('gl lost')
    for (const p of Object.values(parts)) expect(p.m.material).toBe(shared)
    expect(s.fog).not.toBeNull()
  })
})
