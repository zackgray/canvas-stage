// The project endpoint through the real plugin over a temp public dir: refusals, revisions, the ingredient route.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { project } from '../../../src/project/__tests__/fixture.ts'
import { PROJECT_LIMIT } from '../plugin.ts'
import { call, JSON_LOCAL, mount, post } from './rig.ts'

const LOOK2 = { mood: 'dry, golden', timeOfDay: 'golden', atmosphere: 'none', references: [] }

async function created() {
  const m = mount()
  const r = await post(m.h, '/test', { ...project(), revision: 0 })
  expect(r).toMatchObject({ status: 200, body: { id: 'test', revision: 1 } })
  return m
}

describe('project middleware', () => {
  it('is dev-only and keeps project files out of the file watcher', () => {
    const { plugin } = mount()
    expect(plugin.apply).toBe('serve')
    expect((plugin.config as () => unknown)()).toEqual({ server: { watch: { ignored: ['**/public/lab-assets/projects/**'] } } })
  })

  it('saves a new project, lists it and reads it back, stored under projects/<id>/project.json', async () => {
    const { h, publicDir } = await created()
    expect(await call(h, '/')).toMatchObject({ status: 200, body: [{ id: 'test', name: 'Test', revision: 1, shots: 2 }] })
    const got = await call(h, '/test')
    expect(got.body).toEqual({ ...project(), revision: 1 })
    const dir = path.join(publicDir, 'lab-assets', 'projects', 'test')
    expect(readdirSync(dir)).toEqual(['project.json']) // no temp file left behind
    expect(JSON.parse(readFileSync(path.join(dir, 'project.json'), 'utf8'))).toEqual(got.body)
    expect(await call(h, '/nope')).toMatchObject({ status: 404 })
  })

  it('refuses a save carrying a stale revision with 409 and the current one, and keeps the stored copy', async () => {
    const { h } = await created()
    const r1 = await post(h, '/test', { ...project(), revision: 1, name: 'one' })
    expect(r1).toMatchObject({ status: 200, body: { revision: 2, name: 'one' } })
    const stale = await post(h, '/test', { ...project(), revision: 1, name: 'lost' })
    expect(stale).toMatchObject({ status: 409, body: { revision: 2, error: expect.stringMatching(/stale revision/) } })
    expect((await call(h, '/test')).body).toMatchObject({ revision: 2, name: 'one' })
    // a brand-new project must arrive at revision 0
    expect(await post(h, '/other', { ...project(), id: 'other', revision: 4 })).toMatchObject({ status: 409, body: { revision: 0 } })
  })

  it('two saves racing on the same revision: exactly one wins', async () => {
    const { h } = await created()
    const rs = await Promise.all(['x', 'y'].map((name) => post(h, '/test', { ...project(), revision: 1, name })))
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409])
  })

  it('adds an ingredient version, bumping the revision, and the following shot turns stale', async () => {
    const { h } = await created()
    const r = await post(h, '/test/ingredient', { kind: 'look', id: 'loc-1', payload: LOOK2 })
    expect(r).toMatchObject({ status: 200, body: { revision: 2 } })
    expect(r.body.ingredients.looks[0].versions.map((v: { version: number }) => v.version)).toEqual([1, 2])
    expect(r.body.ingredients.looks[0].versions[1]).toEqual({ version: 2, created: '2026-10-18T12:00:00.000Z', payload: LOOK2 })
    expect(await post(h, '/test/ingredient', { kind: 'look', id: 'loc-1', payload: LOOK2, revision: 1 })).toMatchObject({ status: 409, body: { revision: 2 } })
    expect(await post(h, '/test/ingredient', { kind: 'look', id: 'loc-1', payload: { mood: 1 } })).toMatchObject({ status: 400 })
    expect(await post(h, '/ghost/ingredient', { kind: 'look', id: 'loc-1', payload: LOOK2 })).toMatchObject({ status: 404 })
  })

  it('refuses foreign pages (403) and non-JSON posts (415) before reading anything', async () => {
    const { h, publicDir } = mount()
    const body = { ...project(), revision: 0 }
    expect(await post(h, '/test', body, { 'content-type': 'application/json', origin: 'https://evil.example' })).toMatchObject({ status: 403 })
    expect(await post(h, '/test', body, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' })).toMatchObject({ status: 403 })
    expect(await post(h, '/test', body, { 'content-type': 'text/plain', origin: 'http://localhost:5173' })).toMatchObject({ status: 415 })
    expect(await post(h, '/bootstrap', '{}', { 'content-type': 'text/plain' })).toMatchObject({ status: 415 })
    expect(existsSync(path.join(publicDir, 'lab-assets', 'projects'))).toBe(false)
  })

  it('refuses a body past the cap with 413', async () => {
    const { h } = mount()
    const huge = JSON.stringify({ ...project(), revision: 0, name: 'x'.repeat(PROJECT_LIMIT) })
    expect(await post(h, '/test', huge)).toMatchObject({ status: 413 })
    expect(await post(h, '/test', huge, { ...JSON_LOCAL, 'content-length': String(huge.length) })).toMatchObject({ status: 413 })
  })

  it('refuses path traversal and malformed ids with 400', async () => {
    const { h } = mount()
    for (const url of ['/..', '/../../etc', '/..%2F..%2Fetc', '/%2e%2e', '/a%2Fb', '/%E0%A4%A', '//x', '/.hidden']) {
      expect(await call(h, url), url).toMatchObject({ status: 400 })
      expect(await post(h, url, { ...project(), revision: 0 }), url).toMatchObject({ status: 400 })
    }
    expect(await post(h, '/other', { ...project(), revision: 0 })).toMatchObject({ status: 400, body: { error: /does not match/ } })
    expect(await post(h, '/test', '{not json')).toMatchObject({ status: 400 })
    expect(await post(h, '/test', { ...project(), revision: 0, shots: [{ id: 'a' }] })).toMatchObject({ status: 400 })
  })

  it('answers wrong methods and unknown routes', async () => {
    const { h } = mount()
    expect(await post(h, '/', {})).toMatchObject({ status: 405 })
    expect(await call(h, '/test/ingredient')).toMatchObject({ status: 405 })
    expect(await call(h, '/test/other')).toMatchObject({ status: 404 })
    expect(await call(h, '/test', { method: 'DELETE' })).toMatchObject({ status: 405 })
  })
})
