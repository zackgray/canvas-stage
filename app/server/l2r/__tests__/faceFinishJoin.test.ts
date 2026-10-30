// FACE-PASS x the free finish, through the real routes (the passes plugin's Keep, the L2R plugin's Finish): a kept face pass, then
// Grade switched on and Finish again, regrades the FACE-PASSED picture (the grade's input is the pass's pasted raw, never the raw
// underneath), and the finished cut it writes is the render's. Fake Cloud and scripts, no credits.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { biblePaths, type BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { PassCandidate } from '../../../src/shared/passContract.ts'
import { resetClaims } from '../../jobs/inflight.ts'
import { call, JSON_LOCAL, post } from '../../project/__tests__/rig.ts'
import { labPasses } from '../../passes/plugin.ts'
import { resetRegistry } from '../../passes/registry.ts'
import { resetFinishing } from '../finish.ts'
import { bothInfo, faceJob, faceWorld, finishedRender, mountFace } from './faceRig.ts'
import { stampStills, TAKE, until, WORLD } from './rig.ts'

afterEach(() => { resetClaims(); resetFinishing(); resetRegistry() })
type H = Parameters<typeof call>[0]

describe('a kept face pass, then Grade on and Finish again', () => {
  it('grades the face-passed picture and makes it the finished cut', async () => {
    const w = faceWorld()
    // a Bible with a master, drawn against before the render (so the still is not stale): what Grade matches to
    const b: BibleRecord = { worldId: WORLD, version: 2, prompt: '', master: { id: 'm1', png: '/lab-assets/locations/m.png', madeBy: 'qwen', seed: 1, depthStrength: 1, jobId: null, credits: 0, createdAt: 't' },
      candidates: [], lighting: '', materials: '', elements: [], extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't' }
    const bf = path.join(w.pub, ...biblePaths(WORLD).file.split('/'))
    mkdirSync(path.dirname(bf), { recursive: true }); writeFileSync(bf, JSON.stringify(b))
    writeFileSync(path.join(w.pub, 'lab-assets', 'locations', 'm.png'), 'png')
    stampStills(w, b.version)

    const m = mountFace(w, w.runtime({ fetchInfo: async () => bothInfo() }))
    const id = await finishedRender(w, m)
    expect((await m.finish(id, { grade: false })).status).toBe(200) // the owner had the grade off
    w.queue.push(faceJob('cccccccc-0000-4000-8000-0000000000a1'))
    const started = (await m.fix(id)).body.candidate as PassCandidate
    const cand = path.join(w.pub, 'lab-assets', 'shots', TAKE, 'passes', `${started.id}.json`)
    await until(() => JSON.parse(readFileSync(cand, 'utf8')).state === 'candidate')

    const routes: Record<string, H> = {}
    ;(labPasses().configureServer as (s: unknown) => void)({ config: { root: path.dirname(w.pub), publicDir: w.pub }, middlewares: { use: (p: string, h: H) => { routes[p] = h } } })
    expect((await post(routes['/__lab/passes'], '/keep', { id: started.id }, JSON_LOCAL)).status).toBe(200)

    w.py.calls.length = 0
    const f = await m.finish(id, { grade: true })
    expect(f.status).toBe(200)
    const first = w.py.calls[0].slice(1).map((a) => path.basename(a))
    expect(first[0]).toBe('colormatch.py')
    expect(first).toContain('after-raw.mp4') // the face-passed picture is what is graded
    expect(first).not.toContain(`${id}-raw.mp4`)
    expect(f.body.render).toMatchObject({ finished: `/lab-assets/shots/${TAKE}/l2r/${id}-finished.mp4`, grade: { target: b.master!.png } })
  })
})
