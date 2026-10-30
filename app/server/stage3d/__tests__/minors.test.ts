// Review minors m2, m3, m6, m7 of docs/stage3d-overnight-review.md (temp dirs only).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BATTLEFIELD } from '../../../src/stage3d/presets.ts'
import { GRAIN } from '../../hero/stillHelpers.ts'
import { BANNED, GRAIN as SHARED_GRAIN } from '../../prompt/banned.ts'
import { png } from '../../__tests__/png.ts'
import { KIT_STILL_H, KIT_STILL_W } from '../master.ts'
import { readBinary } from '../plugin.ts'
import { KitError, KitStore, ORPHAN_MS } from '../store.ts'

let pub = ''
beforeAll(() => { pub = mkdtempSync(path.join(tmpdir(), 'stage3d-minors-')) })
afterAll(() => rmSync(pub, { recursive: true, force: true }))
const T0 = new Date('2026-10-23T03:00:00.000Z'), after = (ms: number) => new Date(T0.getTime() + ms)
const still = () => png(KIT_STILL_W, KIT_STILL_H, () => [120, 120, 120])

describe('m2: stillless worlds from failed renders do not pile up', () => {
  it('creating a world clears older stillless ones, and never one with a still or a fresh one', async () => {
    const store = new KitStore(pub)
    const orphan = store.create({ plan: BATTLEFIELD }, T0), kept = store.create({ plan: BATTLEFIELD }, after(1000))
    await store.writeStill(kept.id, still(), after(2000))
    const fresh = store.create({ plan: BATTLEFIELD }, after(5 * 60_000)) // too soon to be an orphan
    expect(existsSync(store.dir(orphan.id))).toBe(true)
    store.create({ plan: BATTLEFIELD }, after(5 * 60_000 + ORPHAN_MS + 60_000))
    expect(existsSync(store.dir(orphan.id))).toBe(false)
    expect(existsSync(store.dir(kept.id))).toBe(true) // has its still
    expect(existsSync(store.dir(fresh.id))).toBe(false) // stillless and now old enough
  })
  it('a stillless world a library scene lists is never swept: it is the set of that scene, Bible and all', () => {
    const store = new KitStore(pub)
    const listed = store.create({ plan: BATTLEFIELD }, after(20_000)), loose = store.create({ plan: BATTLEFIELD }, after(21_000))
    store.create({ plan: BATTLEFIELD }, after(30_000 + ORPHAN_MS), (id) => id === listed.id)
    expect(existsSync(store.dir(listed.id))).toBe(true)
    expect(existsSync(store.dir(loose.id))).toBe(false)
  })
})

describe('m6: a world is stamped built only after it is listed', () => {
  it('a manifest failure leaves it unbuilt; uploading again completes it', async () => {
    const store = new KitStore(pub), w = store.create({ plan: BATTLEFIELD }, after(10_000))
    const real = store.files.appendManifest.bind(store.files)
    store.files.appendManifest = async () => { throw new Error('disk full') }
    await expect(store.writeStill(w.id, still(), after(11_000))).rejects.toThrow('disk full')
    const meta = () => JSON.parse(readFileSync(path.join(store.dir(w.id), 'meta.json'), 'utf8')) as { world: { builtAt: string | null } }
    expect(meta().world.builtAt).toBeNull()
    store.files.appendManifest = real
    await store.writeStill(w.id, still(), after(12_000))
    expect(meta().world.builtAt).toBe(after(12_000).toISOString())
  })
})

describe('m3: one grain list', () => {
  it('the kit prompt scrubs exactly the shared grain words', () => {
    expect(GRAIN).toBe(SHARED_GRAIN)
    for (const w of ['grain', 'grainy', 'Kodak', 'vision3', '500T', 'film stock', '35mm film', 'noisy']) { expect(GRAIN.test(w)).toBe(true); expect(BANNED.test(w)).toBe(true) }
    expect(GRAIN.test('torch')).toBe(false)
  })
})

describe('m7: a too-large body gets its 413', () => {
  let url = '', close = () => {}
  beforeAll(async () => {
    const server = createServer((req, res) => {
      readBinary(req, 1024).then(() => { res.statusCode = 200; res.end('ok') }, (e) => { res.statusCode = e instanceof KitError ? e.status : 500; res.end(String((e as Error).message)) })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    close = () => server.close()
  })
  afterAll(() => close())
  it('answers 413 (not a dropped socket) and still takes a small body', async () => {
    const big = await fetch(url, { method: 'POST', body: Buffer.alloc(2_000_000) })
    expect(big.status).toBe(413)
    expect((await fetch(url, { method: 'POST', body: Buffer.alloc(100) })).status).toBe(200)
  })
})
