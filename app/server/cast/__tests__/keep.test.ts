// Wave 3 M3 and M1 on the Cast endpoint: a second front draw never removes the first one's paid files, and a Scene tile's face is
// copied as the card's own file (free), never overwriting one already kept.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESC, post, setup } from './cast-rig.ts'

describe('Cast: paid files are never removed (wave 3 M3)', () => {
  it('a second candidates draw for the same card moves the first pair to earlier/ instead of deleting it', async () => {
    const { cast, dir, pub } = setup()
    await post(cast, 'candidates', { cardId: 'robin', description: DESC, count: 2 })
    const first = readFileSync(path.join(dir('robin', 'draft'), 'cand-1.png'))
    const r = await post(cast, 'candidates', { cardId: 'robin', description: DESC, count: 2 })
    expect(r.status).toBe(200)
    expect((r.body as { candidates: string[] }).candidates).toEqual(['/lab-assets/cast/robin/draft/cand-1.png', '/lab-assets/cast/robin/draft/cand-2.png'])
    const earlier = readdirSync(path.join(pub, 'lab-assets', 'cast', 'robin', 'earlier')).sort()
    expect(earlier).toHaveLength(2)
    expect(earlier.every((f) => /^\d{17}-cand-[12]\.png$/.test(f))).toBe(true)
    expect(readFileSync(path.join(pub, 'lab-assets', 'cast', 'robin', 'earlier', earlier.find((f) => f.endsWith('cand-1.png'))!))).toEqual(first)
  })
})

describe('Cast: keep a face for a card saved from Scene (wave 3 M1)', () => {
  it('copies an image under /lab-assets/ into kept/face-N, numbered, never overwritten; free', async () => {
    const { cast, pub, t } = setup()
    const refs = path.join(pub, 'lab-assets', 'scene', 'default', 'draft', 'refs')
    mkdirSync(refs, { recursive: true })
    writeFileSync(path.join(refs, 'u-1.jpg'), 'jpeg bytes')
    const a = await post(cast, 'keep', { cardId: 'robin-a1', from: '/lab-assets/scene/default/draft/refs/u-1.jpg?t=9' })
    expect(a).toEqual({ status: 200, body: { url: '/lab-assets/cast/robin-a1/kept/face-1.jpg' } })
    const b = await post(cast, 'keep', { cardId: 'robin-a1', from: '/lab-assets/scene/default/draft/refs/u-1.jpg' })
    expect((b.body as { url: string }).url).toBe('/lab-assets/cast/robin-a1/kept/face-2.jpg')
    expect(existsSync(path.join(pub, 'lab-assets', 'cast', 'robin-a1', 'kept', 'face-1.jpg'))).toBe(true)
    expect(t.submits).toBe(0)
  })

  it('refuses anything outside /lab-assets/, a non-image, a missing file or a bad card id', async () => {
    const { cast } = setup()
    expect((await post(cast, 'keep', { cardId: 'r', from: '/etc/passwd.png' })).status).toBe(400)
    expect((await post(cast, 'keep', { cardId: 'r', from: '/lab-assets/../secret.png' })).status).toBe(400)
    expect((await post(cast, 'keep', { cardId: 'r', from: '/lab-assets/x/a.json' })).status).toBe(400)
    expect((await post(cast, 'keep', { cardId: 'r', from: '/lab-assets/x/none.png' })).status).toBe(404)
    expect((await post(cast, 'keep', { cardId: 'Bad Id', from: '/lab-assets/x/none.png' })).status).toBe(400)
  })
})
