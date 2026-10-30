// "Build in 3D" money path (recipe wave): free checks first, the intent before the one job, the TRELLIS.2 weights through
// allowModels (Cloud's object_info lists none of them), the mesh -> massing -> plan -> piece.json order, free refusals leave
// nothing, a billed job that never landed shows Recover and is never resubmitted, and Recover places the mesh it fetched.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Job } from '@comfyorg/sdk'
import { fakeJob } from '../../jobs/__tests__/rig.ts'
import { JobError } from '../../jobs/index.ts'
import { recoverJob } from '../../jobs/recover.ts'
import { piecesStatus } from '../plugin.ts'
import { buildPiece, completePiece } from '../run.ts'
import { FILES, PIECE_CR, PIECE_MODELS, runDir } from '../spec.ts'
import { glbJob, piecesRig } from './rig.ts'

const RUN = 'p-20261024200000-abcd'

describe('Build in 3D', () => {
  it('lists the approved prop tiles only, each with the price', async () => {
    const r = await piecesRig()
    const s = piecesStatus(r.ctx, r.world)
    expect(s.price).toBe(PIECE_CR)
    expect(s.tiles.map((t) => [t.tag, t.name, t.status])).toEqual([['engine', 'Steam Locomotive', 'none'], ['crate', 'Wooden crate', 'none']])
    expect(s.setChangedAt).toBeNull()
  })

  it('one job: intent first, the tile bound, the weights allowed; the piece lands in the plan with its glb, tag, yaw offset and size', async () => {
    const r = await piecesRig()
    const rec = await buildPiece(r.ctx, { world: r.world, tag: 'engine' })
    expect(r.submits()).toBe(1)
    const dir = runDir(r.pub, r.world, 'engine', RUN)
    for (const f of [FILES.intent, FILES.mesh, FILES.massing, FILES.piece]) expect(existsSync(path.join(dir, f))).toBe(true)
    expect(JSON.parse(readFileSync(path.join(dir, FILES.intent), 'utf8'))).toMatchObject({ kind: 'steam locomotive', estimate: PIECE_CR, tag: 'engine' })
    expect(rec).toMatchObject({ kind: 'steam locomotive', placed: 'free', url: `/lab-assets/locations/${r.world}/pieces/engine/${RUN}/mesh.glb`, massingUrl: `/lab-assets/locations/${r.world}/pieces/engine/${RUN}/massing.glb` })
    // massing ran on the mesh with the kind's pitch at its real size
    expect(r.massingRuns[0]).toEqual(expect.arrayContaining(['--size', '10', '--pitch', '0.12']))
    const plan = r.kits.read(r.world).plan
    const item = plan.kit.find((k) => k.pieceTag === 'prop:engine')!
    expect(item.glb).toEqual({ url: rec.url, massingUrl: rec.massingUrl, yawOffsetDeg: 90, unitScale: 5 }) // 10 m over the fixture's 2-unit side
    expect(Math.abs(item.at[0])).toBeGreaterThan(4) // out of the walk corridor
    expect(r.kits.setChangedAt(r.world)).toBe('2026-10-24T20:00:00.000Z')
    expect(piecesStatus(r.ctx, r.world).tiles[0]).toMatchObject({ tag: 'engine', status: 'placed', piece: { placed: 'free' } })
    expect(r.ledger()).toMatch(/piece-build/)
  })

  it('a noun the planner already placed takes that item\'s place and turn (the crates become the generated crate)', async () => {
    const r = await piecesRig({ kit: [{ kind: 'crates', at: [7, -12], yawDeg: 20 }] })
    const rec = await buildPiece(r.ctx, { world: r.world, tag: 'crate' })
    expect(rec.placed).toBe('replaced')
    const kit = r.kits.read(r.world).plan.kit
    expect(kit).toHaveLength(1)
    expect(kit[0]).toMatchObject({ kind: 'wooden crate', at: [7, -12], yawDeg: 20, pieceTag: 'prop:crate' })
  })

  it('without allowModels the graph is refused against object_info (the guard the weights need)', async () => {
    const r = await piecesRig()
    const { runJob } = await import('../../jobs/index.ts')
    const { buildPieceGraph } = await import('../graph.ts')
    const spec = { graph: buildPieceGraph('t'), label: 'piece-build x', estimateCredits: 6, outputs: { glb: { dir: r.pub, name: 'm' } } }
    await expect(runJob(r.rt, spec)).rejects.toThrow(/trellis_2_int8_convrot/)
    await expect(runJob(r.rt, { ...spec, allowModels: [] })).rejects.toThrow(JobError)
    expect(r.submits()).toBe(0)
    expect(PIECE_MODELS).toContain('trellis_2_int8_convrot.safetensors')
  })

  it('free refusals spend nothing and leave nothing: a draft tile, a person, no Comfy target, a budget refusal', async () => {
    const r = await piecesRig()
    await expect(buildPiece(r.ctx, { world: r.world, tag: 'drafty' })).rejects.toMatchObject({ status: 404 })
    await expect(buildPiece(r.ctx, { world: r.world, tag: 'robin' })).rejects.toMatchObject({ status: 404 })
    await expect(buildPiece({ ...r.ctx, configured: () => false }, { world: r.world, tag: 'engine' })).rejects.toMatchObject({ status: 503 })
    const broke = r.restart()
    // a day budget too small: the runner refuses before any submit, and the intent goes
    const { createRuntime } = await import('../../jobs/runtime.ts')
    const tight = createRuntime({ deps: broke.deps, dir: path.join(r.pub, 'jobs2'), logPath: path.join(r.pub, 'log.md'), infoFile: path.join(r.pub, 'info2.json'), cap: () => 1 })
    await expect(buildPiece({ ...r.ctx, runtime: () => tight }, { world: r.world, tag: 'engine' })).rejects.toMatchObject({ code: 'budget' })
    expect(existsSync(runDir(r.pub, r.world, 'engine', RUN))).toBe(false)
    expect(r.submits()).toBe(0)
    expect(piecesStatus(r.ctx, r.world).tiles[0].status).toBe('none')
  })

  it('a billed job whose mesh never lands shows Recover, refuses a second press, and Recover places it without a submit', async () => {
    const r = await piecesRig({ jobs: [{ ...glbJob(), getOutputs: () => [{ name: 'piece.glb', toFile: async () => { throw new Error('download failed') } }] } as unknown as Job], getJob: async () => glbJob() })
    await expect(buildPiece(r.ctx, { world: r.world, tag: 'engine' })).rejects.toMatchObject({ jobId: expect.any(String) })
    const st = piecesStatus(r.ctx, r.world).tiles[0]
    expect(st).toMatchObject({ status: 'failed', run: RUN, recover: { jobId: expect.any(String) } })
    expect(existsSync(path.join(runDir(r.pub, r.world, 'engine', RUN), FILES.intent))).toBe(true) // kept: the job can be put back
    await expect(buildPiece(r.ctx, { world: r.world, tag: 'engine' })).rejects.toMatchObject({ status: 409 })
    expect(r.submits()).toBe(1)
    await recoverJob(r.rt, st.recover!.jobId)
    expect(piecesStatus(r.ctx, r.world).tiles[0].status).toBe('landed')
    const rec = await completePiece(r.ctx, { world: r.world, tag: 'engine', run: RUN })
    expect(rec.placed).toBe('free')
    expect(rec.jobId).toBe(st.recover!.jobId)
    expect(r.submits()).toBe(1) // never resubmitted
    expect(piecesStatus(r.ctx, r.world).tiles[0].status).toBe('placed')
    expect(await completePiece(r.ctx, { world: r.world, tag: 'engine', run: RUN })).toEqual(rec) // idempotent
  })

  it('a massing that cannot run places the piece without one and says why', async () => {
    const r = await piecesRig({ massing: 'fail' })
    const rec = await buildPiece(r.ctx, { world: r.world, tag: 'engine' })
    expect(rec.massingUrl).toBeNull()
    expect(rec.massingNote).toMatch(/trimesh/)
    expect(r.kits.read(r.world).plan.kit.find((k) => k.pieceTag === 'prop:engine')!.glb!.massingUrl).toBeUndefined()
  })

  it('building again replaces the mesh and keeps where the piece was moved to', async () => {
    const r = await piecesRig({ jobs: [glbJob(), glbJob({ id: 'aaaaaaaa-0000-4000-8000-000000000002' })] })
    await buildPiece(r.ctx, { world: r.world, tag: 'engine' })
    const i = r.kits.read(r.world).plan.kit.findIndex((k) => k.pieceTag === 'prop:engine')
    r.kits.movePiece(r.world, { index: i, kind: 'steam locomotive', at: [-9, -20], yawDeg: 45 })
    const again = await buildPiece({ ...r.ctx, rand: () => 'efgh' }, { world: r.world, tag: 'engine' })
    expect(again.placed).toBe('rebuilt')
    const kit = r.kits.read(r.world).plan.kit.filter((k) => k.pieceTag === 'prop:engine')
    expect(kit).toHaveLength(1)
    expect(kit[0]).toMatchObject({ at: [-9, -20], yawDeg: 45, glb: { url: again.url } })
    expect(r.submits()).toBe(2)
  })

  it('a Cloud job that failed outright shows the failure and allows a new press', async () => {
    const r = await piecesRig({ jobs: [fakeJob({ status: 'failed', error: 'OOM' }), glbJob()] })
    await expect(buildPiece(r.ctx, { world: r.world, tag: 'engine' })).rejects.toBeTruthy()
    const st = piecesStatus(r.ctx, r.world).tiles[0]
    expect(st.status).toBe('failed')
    expect(st.recover).toBeUndefined()
  })
})
