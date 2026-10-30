// The still's action at its own frame (tidy wave, 2026-10-25): a mid or end still used to say no action at all. The performance is
// compiled as the 3D set plays it (the clip library from disk) and the segment at the frame's performance time names the action.
// Fake Cloud, free preview only: no network, no credits.
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { StillPreviewResponse } from '../../../src/shared/stillPressContract.ts'
import type { PerformancePlan } from '../../../src/stage3d/contract.ts'
import { diskLibrary, KNEEL_END, L_PATH, STRAIGHT } from '../../../src/stage3d/__tests__/motion.fixture.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { KitStore } from '../../stage3d/store.ts'
import { actionAt, stillAction } from '../stillAction.ts'
import { kitInfo, kitTake } from './kitRig.ts'
import { mount, TAKE } from './rig.ts'

const PUBLIC = fileURLToPath(new URL('../../../public', import.meta.url))
/** a camera at the origin looking down -z (identity), 50 mm */
const CAM = { position: [0, 1.6, 6], quaternion: [0, 0, 0, 1], focal: 50 }

describe('the hero\'s action at a time', () => {
  it('walking away down a straight path, kneeling at the end of a kneel path, standing and looking round mid-L', async () => {
    const lib = await diskLibrary()
    expect(actionAt(STRAIGHT, 3, CAM, lib)).toBe('walking away from us')
    expect(actionAt({ ...STRAIGHT, gait: 'run' }, 1.5, CAM, lib)).toBe('running away from us')
    expect(actionAt({ path: [[0, -10], [0, 0]] }, 3, CAM, lib)).toBe('walking towards us')
    expect(actionAt(KNEEL_END, 60, CAM, lib)).toBe('kneeling') // past the end the last pose holds: on one knee
    expect(actionAt(KNEEL_END, 0.5, CAM, lib)).toMatch(/^walking/) // the same take's opening is still on the way there
    const tl = (await import('../../../src/stage3d/motion/compile.ts')).compile(L_PATH, lib)
    const look = tl.segs.find((s) => s.kind === 'look')!
    expect(actionAt(L_PATH, (look.t0 + look.t1) / 2, CAM, lib)).toBe('standing, looking round')
  })
  it('no clip library on disk: the opening keeps its plan reading, a later frame says nothing (as before)', async () => {
    const empty = mkdtempSync(path.join(os.tmpdir(), 'no-mocap-'))
    expect(await stillAction(empty, STRAIGHT, 0, 0, CAM)).toBe('walking away from us')
    expect(await stillAction(empty, STRAIGHT, 24, 1, CAM)).toBe('')
  })
})

describe('a mid or end still names the action at its own frame (the press preview composes what the press sends)', () => {
  it('the end still of a walk-then-kneel take says kneeling; its opening says walking', async () => {
    const t = kitTake()
    cpSync(path.join(PUBLIC, 'mocap'), path.join(t.pub, 'mocap'), { recursive: true }) // the same clips the browser plays
    const perf: PerformancePlan & { castId: string } = { path: [[0.6, -12.5], [0.6, -10.5]], actions: [{ kind: 'kneel', at: 2, seconds: 30 }], castId: 'ana' }
    new KitStore(t.pub).savePerformance(t.kit.id, perf)
    // the clay's cameras carry each frame's performance time: the end frame (24) is 12 s in, long after he knelt
    const cam = { position: [0, 1.6, -10], quaternion: [0, 0, 0, 1], focal: 50, vfovDeg: 30 }
    writeFileSync(path.join(t.clayDir, 'cameras.json'), JSON.stringify({ frames: [{ i: 0, t: 0, ...cam }, { i: 24, t: 12, ...cam }] }))
    const h = mount(t, t.runtime({ fetchInfo: async () => kitInfo() }))
    const pv = async (role: string) => (await h.raw('/preview', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: TAKE, role }) })).body as unknown as StillPreviewResponse
    const end = await pv('end')
    expect(end.frame).toBe(24)
    expect(end.prompt).toMatch(/^A [^.]* kneeling, /)
    expect((await pv('opening')).prompt).toMatch(/^A [^.]* walking towards us, /)
    expect(t.jobs.submits).toBe(0)
  })
})
