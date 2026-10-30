// The default project from a fixture tree shaped like today's lab-assets: built read-only, idempotent, nothing stale.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { invariantErrors } from '../../../src/project/model.ts'
import { staleness } from '../../../src/project/stale.ts'
import { buildDefaultProject } from '../bootstrap.ts'
import { mount, post } from './rig.ts'

const R = '/lab-assets/renders'
const NOW = '2026-10-18T12:00:00.000Z'

function put(root: string, rel: string, content: unknown) {
  const f = path.join(root, rel)
  mkdirSync(path.dirname(f), { recursive: true })
  writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content))
}

function fixtureTree(): string {
  const pub = path.join(mkdtempSync(path.join(tmpdir(), 'project-boot-')), 'public')
  const a = path.join(pub, 'lab-assets')
  put(a, 'locations/manifest.json', { note: 'x', shots: [
    { id: 'loc-a', prompt: 'Photo of a narrow back alley at night.', description: 'A dark alley way at night that is lit by neon signs of various colours' },
    { id: 'loc-b', prompt: 'Photo of a fish market.', description: 'a fish market' },
    { id: '../evil', prompt: '', description: '' },
  ] })
  put(a, 'looks/loc-a/look.json', { mood: 'wet, quiet, late', timeOfDay: 'night', atmosphere: 'fog', updatedAt: '2026-10-18T16:04:14.500Z' })
  put(a, 'looks/loc-a/ref-1.jpg', 'jpg')
  put(a, 'looks/e2@wide/look.json', { mood: '', timeOfDay: null, atmosphere: 'none' })
  // view-1: two stills; a clip started from a finish of the first; a finish of that clip
  put(a, 'renders/view-1/meta.json', { source: 'loc-a#moge-2-vitl' })
  put(a, 'renders/view-1/stills/render-1.json', { id: 'render-1', output: `${R}/view-1/stills/render-1.png`, createdAt: '2026-10-18T15:00:00Z' })
  put(a, 'renders/view-1/stills/render-2.json', { id: 'render-2', output: `${R}/view-1/stills/render-2.png`, createdAt: '2026-10-18T15:10:00Z' })
  put(a, 'renders/video-1/clip-1.json', { id: 'clip-1', folder: 'video-1', first: 'view-1/looks/finish-render-1-film.png',
    firstUrl: `${R}/view-1/looks/finish-render-1-film.png`, output: `${R}/video-1/clip-1.mp4`, createdAt: '2026-10-18T18:00:00Z' })
  put(a, 'renders/video-1/finish-clip-1-subtle.json', { clip: 'clip-1', output: `${R}/video-1/finish-clip-1-subtle.mp4`, createdAt: '2026-10-18T18:10:00Z' })
  put(a, 'renders/video-1/finish-clip-1-film.json', { clip: 'clip-1', output: `${R}/video-1/finish-clip-1-film.mp4`, createdAt: '2026-10-18T18:20:00Z' })
  // view-2: one still in loc-b · view-3: a bank shot (not a location) · view-4: no stills · video-2: a take, no clip
  put(a, 'renders/view-2/meta.json', { source: 'loc-b#moge-2-vitl' })
  put(a, 'renders/view-2/stills/render-3.json', { id: 'render-3', output: `${R}/view-2/stills/render-3.png`, createdAt: '2026-10-18T14:00:00Z' })
  put(a, 'renders/view-3/meta.json', { source: 'e2/wide#moge-2-vitl' })
  put(a, 'renders/view-3/stills/render-4.json', { id: 'render-4', output: `${R}/view-3/stills/render-4.png`, createdAt: '2026-10-18T14:00:00Z' })
  put(a, 'renders/view-4/meta.json', { source: 'loc-a#moge-2-vitl' })
  put(a, 'renders/video-2/meta.json', { source: 'loc-a#moge-2-vitl' })
  return pub
}

/** Every file under `dir` with its bytes and mtime. */
function snapshot(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) snapshot(f, out)
    else out[f] = `${statSync(f).mtimeMs}:${readFileSync(f, 'base64')}`
  }
  return out
}

describe('bootstrap', () => {
  it('turns locations, looks, stills and clips into ingredients v1 and shots made from v1', async () => {
    const p = await buildDefaultProject(fixtureTree(), NOW)
    expect(p.ingredients.locations.map((l) => [l.id, l.versions[0].payload.shot])).toEqual([['loc-a', 'loc-a'], ['loc-b', 'loc-b']])
    expect(p.ingredients.locations[0].name).toMatch(/^A dark alley way at night that is lit by neon s.*…$/)
    expect(p.ingredients.looks.map((l) => l.id)).toEqual(['e2@wide', 'loc-a'])
    expect(p.ingredients.looks[1].versions).toEqual([{ version: 1, created: '2026-10-18T16:04:14.500Z',
      payload: { mood: 'wet, quiet, late', timeOfDay: 'night', atmosphere: 'fog', references: ['ref-1.jpg'] } }])
    expect(p.shots.map((s) => s.id)).toEqual(['view-1', 'view-2'])

    const [one, two] = p.shots
    expect(one.uses).toEqual({ location: { id: 'loc-a', version: 'latest' }, look: { id: 'loc-a', version: 'latest' }, cast: [], props: [] })
    expect(one.still?.path).toBe(`${R}/view-1/looks/finish-render-1-film.png`) // the frame the clip was made from
    expect(one.take).toEqual({ path: `${R}/video-1` })
    expect(one.clip).toMatchObject({ path: `${R}/video-1/clip-1.mp4`, from: one.still?.path })
    expect(one.finish).toMatchObject({ path: `${R}/video-1/finish-clip-1-film.mp4`, from: one.clip?.path })
    expect(one.clip?.madeFrom).toEqual({ location: { id: 'loc-a', version: 1 }, look: { id: 'loc-a', version: 1 }, cast: [], props: [] })
    expect(two).toMatchObject({ name: 'a fish market · 1', uses: { location: { id: 'loc-b' } }, still: { path: `${R}/view-2/stills/render-3.png` } })
    expect(two.uses.look).toBeUndefined()
    expect(two.clip).toBeUndefined()

    expect(invariantErrors(p)).toEqual([])
    expect(Object.values(staleness(p)).every((s) => !s.stale)).toBe(true)
  })

  it('an empty public dir gives an empty project', async () => {
    const p = await buildDefaultProject(path.join(mkdtempSync(path.join(tmpdir(), 'project-empty-')), 'public'), NOW)
    expect(p).toMatchObject({ id: 'default', shots: [], ingredients: { locations: [], looks: [] } })
  })

  it('POST /bootstrap is idempotent and touches no existing file', async () => {
    const pub = fixtureTree()
    const before = snapshot(path.join(pub, 'lab-assets'))
    const { h } = mount(pub)
    const first = await post(h, '/bootstrap', {})
    expect(first).toMatchObject({ status: 200, body: { created: true, project: { id: 'default', revision: 1 } } })
    const second = await post(h, '/bootstrap', '')
    expect(second).toMatchObject({ status: 200, body: { created: false } })
    expect(second.body.project).toEqual(first.body.project)

    const after = snapshot(path.join(pub, 'lab-assets'))
    const projectFile = path.join(pub, 'lab-assets', 'projects', 'default', 'project.json')
    expect(Object.keys(after).sort()).toEqual([...Object.keys(before), projectFile].sort())
    for (const [f, v] of Object.entries(before)) expect(after[f], f).toBe(v)
  })
})
