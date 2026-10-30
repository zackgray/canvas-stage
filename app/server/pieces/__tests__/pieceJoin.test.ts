// A generated piece across the tracks that read it, through each one's real function: the plan item a build makes (place.ts
// pieceItem, pieceTag 'prop:<tag>') is named in the still's draw by its board tile's line (else its own noun, aged); in the ID pass it
// gets its own colour (glbPiece.ts placeGlb tags it, idPass.ts colours it); the judge lists it with its board tile (the prop redraw
// button), and the prop redraw's mask is exactly its own colour's pixels. Fake Cloud, no credits.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import type { BibleRecord } from '../../../src/shared/bibleContract.ts'
import type { PassCandidate } from '../../../src/shared/passContract.ts'
import { withIdMaterials } from '../../../src/labs/projection/clay/idPass.ts'
import { placeGlb } from '../../../src/stage3d/glbPiece.ts'
import { readMaskPng } from '../../hero/idMask.ts'
import { buildDrawPrompt } from '../../hero/kitStillPrompt.ts'
import type { StillJudge } from '../../hero/redrawSpec.ts'
import { mount } from '../../hero/__tests__/rig.ts'
import { idPng, redrawJob, redrawTake, STILL_ID } from '../../hero/__tests__/redrawRig.ts'
import { JSON_LOCAL } from '../../project/__tests__/rig.ts'
import { resetRegistry } from '../../passes/registry.ts'
import { pieceItem } from '../place.ts'

beforeEach(() => resetRegistry())

const item = pieceItem('a wooden crate', 'crate', '/lab-assets/pieces/crate/crate.glb', null, 1)
const LINE = 'A split wooden crate, grey with age.'
/** the crate on the clay's 192x108 ID frame, clear of the rig's people and pieces */
const CRATE = { x0: 140, x1: 158, y0: 75, y1: 100 }
const tagged = (tag: string) => { const g = new Group(); g.userData.entity = tag; g.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())); return g }

describe('a generated piece across the still prompt, the ID pass and the judge', () => {
  it('is named by its board line (else its noun), wears its own ID colour, is judged with its tile, and its redraw mask is that colour only', async () => {
    expect(item.pieceTag).toBe('prop:crate')
    const parts = (bible: BibleRecord | null) => ({ bible, plan: { sentence: 'A muddy yard.', kit: [item] }, cast: { name: 'Ana', description: 'a woman' },
      view: { kinds: [item.kind], camera: '', pieces: [item] } })
    const el = { tag: 'crate', kind: 'prop' as const, refs: ['/lab-assets/x.png'], line: LINE }
    const withTile = { worldId: 'w', version: 1, prompt: '', master: null, candidates: [], lighting: '', materials: '', extrasSheet: null, grade: null, createdAt: 't', updatedAt: 't', elements: [el] } as BibleRecord
    expect(buildDrawPrompt(parts(withTile))).toMatch(/a split wooden crate, grey with age/)
    expect(buildDrawPrompt(parts({ ...withTile, elements: [] }))).toMatch(/wooden crate/)

    // the ID pass of a set holding the piece and the rig's other pieces: the piece's own colour
    const scene = new Scene()
    scene.add(placeGlb(item, new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()), null, () => 0), tagged('prop:trunk'), tagged('prop:lamp'))
    const table = withIdMaterials(scene, () => {})
    const own = table['prop:crate']
    expect(own).toBeTruthy()
    expect([table['prop:trunk'], table['prop:lamp']].map((c) => c.join())).not.toContain(own.join())

    // the take's clay carries that ID frame; the Bible has the piece's board tile
    const t = redrawTake()
    const id = PNG.sync.read(idPng())
    for (let y = CRATE.y0; y < CRATE.y1; y++) for (let x = CRATE.x0; x < CRATE.x1; x++) { const i = (y * id.width + x) * 4; id.data[i] = own[0]; id.data[i + 1] = own[1]; id.data[i + 2] = own[2] }
    writeFileSync(path.join(t.clayDir, 'id_000.png'), PNG.sync.write(id))
    const clay = JSON.parse(readFileSync(path.join(t.clayDir, 'clay.json'), 'utf8'))
    writeFileSync(path.join(t.clayDir, 'clay.json'), JSON.stringify({ ...clay, idPass: { ...clay.idPass, colors: { ...clay.idPass.colors, 'prop:crate': own } } }))
    const tile = `/lab-assets/locations/${t.kit.id}/bible/elements/crate.png`
    mkdirSync(path.dirname(path.join(t.pub, tile)), { recursive: true }); writeFileSync(path.join(t.pub, tile), 'img')
    const bf = path.join(t.pub, 'lab-assets', 'locations', t.kit.id, 'bible', 'bible.json'), bible = JSON.parse(readFileSync(bf, 'utf8'))
    writeFileSync(bf, JSON.stringify({ ...bible, elements: [...bible.elements, { ...el, refs: [tile] }] }))

    t.queue.push(redrawJob('dddddddd-0000-4000-8000-000000000001'))
    const hero = mount(t, t.runtime({ fetchInfo: async () => t.info }))
    const judged = (await hero.raw(`/judge?take=${t.take.id}&still=${STILL_ID}`)).body as StillJudge
    const piece = judged.pieces.find((p) => p.tag === 'crate')
    expect(piece).toMatchObject({ line: LINE, tileUrl: tile })
    const r = await hero.raw('/redraw', { method: 'POST', headers: JSON_LOCAL, body: JSON.stringify({ takeId: t.take.id, stillId: STILL_ID, pass: 'prop', subject: 'crate' }) })
    expect(r.status).toBe(200)
    const c = (r.body as { candidate: PassCandidate }).candidate
    const mask = readMaskPng(path.join(t.heroDir, 'redraw', `${c.id}-mask.png`))
    // the still is the ID frame x2: the mask is the crate's own pixels, nothing else
    let inside = 0, outside = 0
    for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
      if (!mask.data[y * mask.width + x]) continue
      const gx = x / 2, gy = y / 2
      if (gx >= CRATE.x0 && gx < CRATE.x1 && gy >= CRATE.y0 && gy < CRATE.y1) inside++; else outside++
    }
    expect(outside).toBe(0)
    expect(inside).toBe((CRATE.x1 - CRATE.x0) * (CRATE.y1 - CRATE.y0) * 4)
  })
})
