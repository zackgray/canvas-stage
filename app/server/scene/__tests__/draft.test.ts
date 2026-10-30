// Scene's draft design: saved and read back per project, uploads as real files with type and size limits, and the move into the
// world's Bible at Build the set (files copied into bible/elements/, the design's URLs rewritten, the draft left as it was until
// New scene clears it).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DRAFT_LIMIT, UPLOAD_LIMIT, type DraftMigrateResponse, type DraftResponse, type UploadResponse } from '../../../src/shared/sceneContract.ts'
import { sniff } from '../draft.ts'
import { handleScene, sceneCtx } from '../plugin.ts'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')])
const WORLD = 'loc-2026-10-24T10-00-00-000'

function setup() {
  const pub = path.join(mkdtempSync(path.join(tmpdir(), 'draft-')), 'public')
  const ctx = sceneCtx({}, { publicDir: pub, now: () => new Date('2026-10-24T10:00:00Z'), configured: () => false })
  const call = (method: string, sub: string, body: unknown = null, q: Record<string, string> = {}, raw?: Buffer) => handleScene(ctx, method, sub, new URLSearchParams(q), body, raw)
  return { pub, call }
}

describe('the draft design', () => {
  it('saves, reads back and replaces; refuses a bad project and an oversized design', async () => {
    const s = setup()
    expect(((await s.call('GET', '/draft', null, { project: 'default' })).body as DraftResponse).draft).toBeNull()
    expect((await s.call('POST', '/draft', { project: 'default', design: { idea: 'a hamlet', pieces: [] }, revision: 0 })).status).toBe(200)
    await s.call('POST', '/draft', { project: 'default', design: { idea: 'a hamlet at dusk' }, revision: 1 })
    const got = (await s.call('GET', '/draft', null, { project: 'default' })).body as DraftResponse
    expect(got.draft).toMatchObject({ project: 'default', design: { idea: 'a hamlet at dusk' }, updatedAt: '2026-10-24T10:00:00.000Z', revision: 2 })
    expect((await s.call('POST', '/draft', { project: '../up', design: {}, revision: 0 })).status).toBe(400)
    expect((await s.call('POST', '/draft', { project: 'default', design: [1], revision: 2 })).status).toBe(400)
    expect((await s.call('POST', '/draft', { project: 'default', design: {} })).status).toBe(400) // no revision: never a blind overwrite
    expect((await s.call('POST', '/draft', { project: 'default', design: { idea: 'x'.repeat(DRAFT_LIMIT) }, revision: 2 })).status).toBe(413)
    // three saves in flight from one read (m5, m7): one lands, the other two are refused as stale and write nothing
    const all = await Promise.all([1, 2, 3].map((n) => s.call('POST', '/draft', { project: 'default', design: { idea: `v${n}` }, revision: 2 })))
    expect(all.map((r) => r.status).sort()).toEqual([200, 409, 409])
    expect(all.filter((r) => r.status === 409).every((r) => (r.body as { revision: number }).revision === 3)).toBe(true)
  })
  it('uploads: png, jpeg and webp by their bytes become files under the draft; anything else, empty or too large is refused', async () => {
    expect([sniff(PNG), sniff(JPG), sniff(WEBP), sniff(Buffer.from('GIF89a'))]).toEqual(['png', 'jpg', 'webp', null])
    const s = setup()
    const up = await s.call('POST', '/upload', null, { project: 'default' }, PNG)
    expect(up.status).toBe(200)
    const u = up.body as UploadResponse
    expect(u).toMatchObject({ url: expect.stringMatching(/^\/lab-assets\/scene\/default\/draft\/refs\/u-20261024100000-\w{6}\.png$/), bytes: PNG.length, type: 'image/png' })
    expect(readFileSync(path.join(s.pub, ...u.url.slice(1).split('/')))).toEqual(PNG)
    expect(((await s.call('POST', '/upload', null, { project: 'default' }, JPG)).body as UploadResponse).url).toMatch(/\.jpg$/)
    expect((await s.call('POST', '/upload', null, { project: 'default' }, Buffer.from('GIF89a...'))).status).toBe(415)
    expect((await s.call('POST', '/upload', null, { project: 'default' }, Buffer.alloc(0))).status).toBe(400)
    expect((await s.call('POST', '/upload', null, { project: 'default' }, Buffer.concat([PNG, Buffer.alloc(UPLOAD_LIMIT)]))).status).toBe(413)
    expect((await s.call('POST', '/upload', null, { project: 'a/b' }, PNG)).status).toBe(400)
  })
  it('migrate: the files the design points at are copied into the Bible, its URLs rewritten, the draft left intact (wave 3 M1)', async () => {
    const s = setup()
    const up = (await s.call('POST', '/upload', null, { project: 'default' }, JPG)).body as UploadResponse
    const concept = '/lab-assets/scene/default/concepts/c-20261024100000-ab12/c-1.png'
    mkdirSync(path.join(s.pub, 'lab-assets/scene/default/concepts/c-20261024100000-ab12'), { recursive: true })
    writeFileSync(path.join(s.pub, ...concept.slice(1).split('/')), 'png')
    await s.call('POST', '/draft', { project: 'default', design: { pieces: [{ tag: 'mood', looks: [concept, up.url] }, { tag: 'web', looks: ['https://x/y.png'] }] }, revision: 0 })
    expect((await s.call('POST', '/draft/migrate', { project: 'default', worldId: WORLD })).status).toBe(404)
    mkdirSync(path.join(s.pub, 'lab-assets', 'locations', WORLD), { recursive: true })
    expect((await s.call('POST', '/draft/migrate', { project: 'default', worldId: 'nope' })).status).toBe(400)
    const r = (await s.call('POST', '/draft/migrate', { project: 'default', worldId: WORLD })).body as DraftMigrateResponse
    const el = `/lab-assets/locations/${WORLD}/bible/elements`
    expect(r.moved).toEqual({ [concept]: `${el}/c-20261024100000-ab12-c-1.png`, [up.url]: `${el}/${up.url.split('/').pop()}` })
    expect(r.design).toEqual({ pieces: [{ tag: 'mood', looks: [`${el}/c-20261024100000-ab12-c-1.png`, `${el}/${up.url.split('/').pop()}`] }, { tag: 'web', looks: ['https://x/y.png'] }] })
    for (const to of Object.values(r.moved)) expect(existsSync(path.join(s.pub, ...to.slice(1).split('/')))).toBe(true)
    expect(JSON.parse(readFileSync(path.join(s.pub, 'lab-assets', 'locations', WORLD, 'bible', 'design.json'), 'utf8'))).toMatchObject({ project: 'default', design: r.design })
    // nothing removed: a Bible write refused after this still finds the draft, its upload and its concept where they were
    expect(((await s.call('GET', '/draft', null, { project: 'default' })).body as DraftResponse).draft?.design).toMatchObject({ pieces: [{ looks: [concept, up.url] }, {}] })
    expect(existsSync(path.join(s.pub, ...up.url.slice(1).split('/')))).toBe(true)
    expect(existsSync(path.join(s.pub, ...concept.slice(1).split('/')))).toBe(true)
  })
})
