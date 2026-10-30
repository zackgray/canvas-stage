// The still judge (troubleshooting item 2): each staged person at 100 % beside their card, flagged when the still does not have them
// where the clay puts them or nobody could check; the pieces with a board tile and their own colour. Free: nothing submits.
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { faceOval, padBox } from '../idMask.ts'
import { mount } from './rig.ts'
import { ANA, emptyStill, redrawTake, STILL_ID, TRUNK } from './redrawRig.ts'
import type { StillJudge } from '../redrawSpec.ts'

const judge = async (t: ReturnType<typeof redrawTake>) => {
  const rt = t.runtime({ fetchInfo: async () => t.info })
  const r = await mount(t, rt).raw(`/judge?take=${t.take.id}&still=${STILL_ID}`)
  return { status: r.status, body: r.body as StillJudge & { redrawnInto: string | null }, submits: t.jobs.submits }
}

describe('the still judge', () => {
  it('lists the staged people only (hero + tagged extra), each with their own card; tom is missing from the still, so it is flagged', async () => {
    const t = redrawTake()
    const { status, body, submits } = await judge(t)
    expect(status).toBe(200)
    expect(submits).toBe(0)
    expect(body.kit).toBe(true)
    expect(body.people.map((p) => [p.entity, p.name, p.cardId, p.cardUrl])).toEqual([
      ['hero', 'Ana', 'ana', '/lab-assets/cast/ana/face.png'], ['extra:0:0', 'Tom', 'tom', '/lab-assets/cast/tom/face.png']]) // the untagged crowd extra is not judged
    const [ana, tom] = body.people
    expect(ana.status).toBe('ok')
    expect(tom.status).toBe('off')
    expect(ana.match!).toBeGreaterThan(tom.match ?? 0)
    expect(body.flagged).toBe(true)
    // the 100 % crop holds the clay's box (x2 onto the still), padded; the face oval sits in the top of it
    expect(ana.box!.x).toBeLessThanOrEqual(ANA.x0 * 2); expect(ana.box!.x + ana.box!.w).toBeGreaterThanOrEqual(ANA.x1 * 2)
    expect(ana.face!.y).toBeGreaterThanOrEqual(ANA.y0 * 2); expect(ana.face!.y + ana.face!.h).toBeLessThan(ANA.y0 * 2 + (ANA.y1 - ANA.y0) * 2 * 0.2)
    expect(body.prices).toEqual({ face: 3, prop: 3 })
  })

  it('a still with everyone on their mark is not flagged; a still of no one flags the hero too', async () => {
    const good = redrawTake({ withTom: true })
    const g = (await judge(good)).body
    expect(g.people.map((p) => p.status)).toEqual(['ok', 'ok'])
    expect(g.flagged).toBe(false)
    const none = redrawTake()
    writeFileSync(path.join(none.heroDir, `${STILL_ID}.png`), emptyStill())
    expect((await judge(none)).body.people.map((p) => p.status)).toEqual(['off', 'off'])
  })

  it('pieces: the trunk (own colour, board tile) is offered; the lamp, sharing its colour with another piece, is not', async () => {
    const { body } = await judge(redrawTake())
    expect(body.pieces.map((p) => p.tag)).toEqual(['trunk'])
    const trunk = body.pieces[0]
    expect(trunk.tileUrl).toMatch(/\/bible\/elements\/trunk\.png$/)
    expect(trunk.box).toEqual(padBox({ x0: TRUNK.x0 * 2, y0: TRUNK.y0 * 2, x1: TRUNK.x1 * 2 - 1, y1: TRUNK.y1 * 2 - 1 }, 384, 216, 0.1, 64))
  })

  it('no figure map at the still\'s frame: every person is unknown and the still is flagged (nobody checked them)', async () => {
    const t = redrawTake({ idPass: false })
    const { body } = await judge(t)
    expect(body.people.map((p) => p.status)).toEqual(['unknown', 'unknown'])
    expect(body.pieces).toEqual([])
    expect(body.flagged).toBe(true)
  })

  it('refuses a still that is not on disk (404) and a bad id (400)', async () => {
    const t = redrawTake()
    rmSync(path.join(t.heroDir, `${STILL_ID}.png`))
    const rt = t.runtime({ fetchInfo: async () => t.info })
    const m = mount(t, rt)
    expect((await m.raw(`/judge?take=${t.take.id}&still=${STILL_ID}`)).status).toBe(404)
    expect((await m.raw(`/judge?take=${t.take.id}&still=../x`)).status).toBe(400)
  })

  it('faceOval keeps to the lower head band, under any hat', () => {
    const data = new Uint8Array(100 * 200)
    for (let y = 20; y < 200; y++) for (let x = 40; x < 60; x++) data[y * 100 + x] = 1
    const f = faceOval({ width: 100, height: 200, data })!
    expect(f.y).toBeGreaterThan(20 + 180 * 0.13 * 0.15) // the hair / hat top stays the still's
    expect(f.w).toBeLessThan(20)
  })
})
