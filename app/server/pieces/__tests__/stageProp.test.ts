// A prop made on the Stage after the set was built (Fable F2): its approved tile joins the scene's draft and its labelled stand-in
// (pieceTag prop:<tag>) goes in through the piece add route. The pieces route then lists it, the build replaces the stand-in at
// its place (not beside it), and Reset the set's built copy gets the mesh where the live plan has it, never over a planner piece
// of the same noun.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DraftStore } from '../../scene/draft.ts'
import { BUILT_FILE } from '../../stage3d/builtPlan.ts'
import type { ScenePlan } from '../../../src/stage3d/contract.ts'
import { piecesStatus } from '../plugin.ts'
import { buildPiece } from '../run.ts'
import { piecesRig, TILE } from './rig.ts'

async function withStageProp() {
  const r = await piecesRig() // the planner's crates stand at [7, -12]
  const look = TILE(r.scene, 'spare')
  const f = path.join(r.pub, ...look.slice(1).split('/'))
  mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const drafts = new DraftStore(r.pub)
  const d = drafts.get(r.scene)!
  const pieces = [...(d.design.pieces as unknown[]), { id: 'p-spare', tag: 'spare', name: 'Spare crate', type: 'prop', state: 'approved', looks: [look], look: 0, line: 'a spare crate', onBoard: true }]
  await drafts.save(r.scene, { ...d.design, pieces }, d.revision)
  r.kits.movePiece(r.world, { add: { kind: 'crates', at: [3, -8], yawDeg: 40, label: 'Spare crate', pieceTag: 'prop:spare' } })
  return r
}

describe('a prop added on the Stage', () => {
  it('is a tile of the pieces route', async () => {
    const r = await withStageProp()
    expect(piecesStatus(r.ctx, r.world).tiles.map((t) => [t.tag, t.status])).toContainEqual(['spare', 'none'])
  })

  it('builds over its own stand-in, at its place and turn; the planner piece of the same noun stays', async () => {
    const r = await withStageProp()
    const before = r.kits.read(r.world).plan.kit.length
    const rec = await buildPiece(r.ctx, { world: r.world, tag: 'spare' })
    expect(rec.placed).toBe('replaced')
    const kit = r.kits.read(r.world).plan.kit
    expect(kit).toHaveLength(before)
    expect(kit.find((k) => k.pieceTag === 'prop:spare')).toMatchObject({ kind: 'spare crate', at: [3, -8], yawDeg: 40, glb: { url: rec.url } })
    expect(kit.find((k) => k.kind === 'crates')).toMatchObject({ at: [7, -12] })
  })

  it('the mesh keeps the stand-in label and tag, so the draw and the render name it as the user did (live plan and built copy)', async () => {
    const r = await withStageProp()
    await buildPiece(r.ctx, { world: r.world, tag: 'spare' })
    expect(r.kits.read(r.world).plan.kit.find((k) => k.glb)).toMatchObject({ label: 'Spare crate', pieceTag: 'prop:spare' })
    const built = JSON.parse(readFileSync(path.join(r.kits.dir(r.world), BUILT_FILE), 'utf8')) as ScenePlan
    expect(built.kit.find((k) => k.pieceTag === 'prop:spare')).toMatchObject({ label: 'Spare crate' })
    // built again: the label stays
    await buildPiece(r.ctx, { world: r.world, tag: 'spare' })
    expect(r.kits.read(r.world).plan.kit.filter((k) => k.pieceTag === 'prop:spare')).toEqual([expect.objectContaining({ label: 'Spare crate' })])
  })

  it('Reset the set keeps the mesh where it was placed, beside the planner pieces (it never takes one of theirs)', async () => {
    const r = await withStageProp()
    const rec = await buildPiece(r.ctx, { world: r.world, tag: 'spare' })
    const built = JSON.parse(readFileSync(path.join(r.kits.dir(r.world), BUILT_FILE), 'utf8')) as ScenePlan
    expect(built.kit.find((k) => k.kind === 'crates')).toMatchObject({ at: [7, -12] }) // the planner's own crates are still there
    expect(built.kit.find((k) => k.pieceTag === 'prop:spare')).toMatchObject({ at: [3, -8], glb: { url: rec.url } })
  })
})
