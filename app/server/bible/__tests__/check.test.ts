// Wave 3 M1: POST /__lab/bible/check says, free and without a world, everything the save and element routes would refuse for a
// design, so Build the set refuses before the paid plan instead of after the world is written.
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { handleBible } from '../routes.ts'
import { BibleStore } from '../store.ts'

const ctx = () => {
  const pub = mkdtempSync(path.join(tmpdir(), 'bible-check-'))
  return { pub, ctx: { store: new BibleStore(pub) } }
}
const check = async (c: ReturnType<typeof ctx>['ctx'], body: unknown) => (await handleBible(c, 'POST', '/check', new URLSearchParams(), body)).body as { ok: boolean; errors: string[] }

describe('the Bible check (free, before the paid plan)', () => {
  it('a sound design passes and nothing is written', async () => {
    const { pub, ctx: c } = ctx()
    const r = await check(c, {
      prompt: 'A chase. @robin runs while @knights close in.', lighting: 'low sun', materials: 'wool', background: 'riders far off',
      elements: [{ tag: 'robin', kind: 'cast', cardId: 'robin-a1', refs: ['/lab-assets/cast/robin-a1/kept/face-1.png'], line: 'an outlaw' }, { tag: 'knights', kind: 'extras', refs: [], line: 'knights' }],
    })
    expect(r).toEqual({ ok: true, errors: [] })
    expect(existsSync(path.join(pub, 'lab-assets'))).toBe(false)
  })

  it('names every refusal: a cast tile with no card, a tag twice, a prompt tag with no tile, a line over its limit', async () => {
    const { ctx: c } = ctx()
    const r = await check(c, {
      prompt: 'A chase. @robin runs from @guy.', background: 'x'.repeat(301),
      elements: [{ tag: 'robin', kind: 'cast', refs: [], line: 'an outlaw' }, { tag: 'robin', kind: 'prop', refs: [], line: 'a bow' }],
    })
    expect(r.ok).toBe(false)
    expect(r.errors).toEqual(expect.arrayContaining([
      'background is longer than 300 characters', '@robin: cast elements need the Cast card id', 'the brief names @guy, which has no tile on the board',
    ]))
  })
})
