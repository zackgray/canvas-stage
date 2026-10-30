import { describe, expect, it } from 'vitest'
import { addVersion, ingredient, invariantErrors, latestVersion, resolveUses, upsertShot } from '../model.ts'
import { parseAddVersion, parseProject, ProjectShapeError } from '../parse.ts'
import { LOOK, project, T } from './fixture.ts'

describe('project model', () => {
  it('appends versions 1, 2, 3 … and never rewrites an earlier one', () => {
    let p = project()
    const before = structuredClone(ingredient(p, 'look', 'loc-1')!.versions[0])
    p = addVersion(p, 'look', 'loc-1', { ...LOOK, mood: 'dry' }, T)
    p = addVersion(p, 'look', 'loc-1', { ...LOOK, mood: 'warm' }, T)
    const look = ingredient(p, 'look', 'loc-1')!
    expect(look.versions.map((v) => v.version)).toEqual([1, 2, 3])
    expect(look.versions[0]).toEqual(before)
    expect(latestVersion(look)).toBe(3)
    expect(invariantErrors(p)).toEqual([])
  })

  it('creates a new ingredient at v1 and keeps the input project untouched', () => {
    const p = project()
    const q = addVersion(p, 'prop', 'car', { name: 'Car', description: 'a red coupe', references: [], sheets: [] }, T, 'Red coupe')
    expect(ingredient(q, 'prop', 'car')).toMatchObject({ name: 'Red coupe', versions: [{ version: 1 }] })
    expect(p.ingredients.props).toEqual([])
  })

  it('resolves "latest" to the newest version and leaves pins alone', () => {
    const p = addVersion(project(), 'look', 'loc-1', LOOK, T)
    expect(resolveUses(p, p.shots[0].uses).look).toEqual({ id: 'loc-1', version: 2 })
    expect(resolveUses(p, p.shots[1].uses).look).toEqual({ id: 'loc-1', version: 1 })
  })

  it('reports versions out of order, unresolved refs and duplicate ids', () => {
    const p = project()
    p.ingredients.looks[0].versions.push({ version: 3, created: T, payload: LOOK })
    p.shots[0].uses.cast.push({ id: 'nobody', version: 'latest' })
    p.shots[1].uses.look = { id: 'loc-1', version: 7 }
    p.shots[1].id = 'a'
    const errors = invariantErrors(p)
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/look loc-1: versions must run/), expect.stringMatching(/no cast nobody/),
      expect.stringMatching(/has no v7/), expect.stringMatching(/shot a: duplicate id/),
    ]))
  })

  it('upsertShot replaces by id or appends', () => {
    const p = project()
    expect(upsertShot(p, { ...p.shots[0], name: 'renamed' }).shots.map((s) => s.name)).toEqual(['renamed', 'B'])
    expect(upsertShot(p, { ...p.shots[0], id: 'c' }).shots).toHaveLength(3)
  })
})

describe('parseProject', () => {
  it('round-trips a sound project through JSON', () => {
    const p = project()
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('refuses bad shapes, paths outside /lab-assets/ and broken invariants', () => {
    // the document as it arrives over the wire: any JSON at all
    type Wire = { id: unknown; revision: unknown; shots: { still: { path: unknown }; uses: { location: { version: unknown }; look: { id: unknown } } }[]; ingredients: { looks: { versions: { version: unknown }[] }[] } }
    const bad = (change: (p: Wire) => void) => {
      const p = JSON.parse(JSON.stringify(project())) as Wire
      change(p)
      return () => parseProject(p)
    }
    expect(bad((p) => { (p as { shots: unknown }).shots = 'x' })).toThrow(ProjectShapeError)
    expect(bad((p) => { p.id = '../etc' })).toThrow(/project.id/)
    expect(bad((p) => { p.revision = -1 })).toThrow(/revision/)
    expect(bad((p) => { p.shots[0].still.path = '/lab-assets/../../secret' })).toThrow(/lab-assets/)
    expect(bad((p) => { p.shots[0].still.path = 'C:/secret.png' })).toThrow(/lab-assets/)
    expect(bad((p) => { p.shots[0].uses.location.version = 0 })).toThrow(/version/)
    expect(bad((p) => { p.ingredients.looks[0].versions[0].version = 2 })).toThrow(/versions must run/)
    expect(bad((p) => { p.shots[0].uses.look.id = 'ghost' })).toThrow(/no look ghost/)
  })

  it('checks an add-version request per kind', () => {
    expect(parseAddVersion({ kind: 'look', id: 'loc-1', payload: LOOK, revision: 3 })).toMatchObject({ kind: 'look', revision: 3 })
    expect(() => parseAddVersion({ kind: 'mood', id: 'x', payload: {} })).toThrow(/kind/)
    expect(() => parseAddVersion({ kind: 'cast', id: 'mara', payload: { name: 'Mara', description: '', references: ['/etc/passwd'], sheets: [] } })).toThrow(/lab-assets/)
    expect(() => parseAddVersion({ kind: 'location', id: 'a/b', payload: { shot: 'a', prompt: '' } })).toThrow(/id/)
  })
})
