// Fixtures for the set-piece tests: a kit world built in a library scene whose draft board has approved prop tiles (and a person
// and a draft prop that are not buildable), the job runner's fake Cloud (server/jobs/__tests__/rig.ts) answering with the tiny
// fixture GLB, an object_info whose loaders do NOT list the TRELLIS.2 weights (as Cloud's does not, E136), and a fake massing run.
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Job } from '@comfyorg/sdk'
import type { ObjectInfo } from '../../comfy/index.ts'
import { fakeJob, permissiveInfo, rig, type FakeJobOpts } from '../../jobs/__tests__/rig.ts'
import type { JobRuntime } from '../../jobs/index.ts'
import { DraftStore } from '../../scene/draft.ts'
import { SceneLibrary } from '../../scene/library.ts'
import { KitStore } from '../../stage3d/store.ts'
import type { KitItem, ScenePlan } from '../../../src/stage3d/contract.ts'
import { PLANS } from '../../../src/stage3d/presets.ts'
import { buildPieceGraph } from '../graph.ts'
import type { PiecesCtx } from '../run.ts'

export const FIXTURE_GLB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'src', 'stage3d', '__tests__', 'fixtures', 'piece-box.glb')

/** object_info for the piece graph whose model loaders list other files only: the weights must come through allowModels */
export function pieceInfo(): ObjectInfo {
  const info = permissiveInfo(buildPieceGraph('t')) as unknown as Record<string, { input: { required: Record<string, unknown> } }>
  info.UNETLoader.input.required.unet_name = [['flux.safetensors']]
  info.VAELoader.input.required.vae_name = [['ae.safetensors']]
  info.CLIPVisionLoader.input.required.clip_name = [['clip_vision_g.safetensors']]
  return info as unknown as ObjectInfo
}

/** a finished Cloud job whose SaveGLB output is the fixture */
export const glbJob = (o: FakeJobOpts = {}): Job => ({
  ...fakeJob(o),
  getOutputs: () => Array.from({ length: o.outputs ?? 1 }, () => ({ name: 'canvas-stage/piece-engine-trellis2_00001_.glb', toFile: async (p: string) => copyFileSync(FIXTURE_GLB, p) })),
}) as unknown as Job

export const TILE = (scene: string, tag: string) => `/lab-assets/scene/${scene}/draft/refs/${tag}.png`

export interface PiecesRig {
  pub: string; world: string; scene: string; ctx: PiecesCtx; rt: JobRuntime; kits: KitStore
  submits: () => number; massingRuns: string[][]; ledger: () => string
  /** a runtime over the same disk (a restarted dev server) with other fake Cloud answers */
  restart: (over?: Parameters<ReturnType<typeof rig>['restart']>[0]) => JobRuntime
}

export async function piecesRig(o: { jobs?: Job[]; kit?: KitItem[]; massing?: 'ok' | 'fail'; getJob?: (id: string) => Promise<Job> } = {}): Promise<PiecesRig> {
  const pub = mkdtempSync(path.join(tmpdir(), 'pieces-'))
  const kits = new KitStore(pub)
  const plan: ScenePlan = { ...(JSON.parse(JSON.stringify(PLANS['open-field-day'])) as ScenePlan), kit: o.kit ?? [{ kind: 'crates', at: [7, -12], yawDeg: 20 }] }
  const world = kits.create({ plan, description: 'a railway halt' }).id
  const library = new SceneLibrary(pub)
  const scene = (await library.create('Railway')).id
  await library.attachWorld(scene, world)
  for (const tag of ['engine', 'crate', 'robin', 'drafty']) {
    const f = path.join(pub, ...TILE(scene, tag).slice(1).split('/'))
    mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  const tile = (tag: string, name: string, type: string, state: string) => ({ id: `p-${tag}`, tag, name, type, state, looks: [TILE(scene, tag)], look: 0, line: '', onBoard: true })
  await new DraftStore(pub).save(scene, { pieces: [tile('engine', 'Steam Locomotive', 'prop', 'approved'), tile('crate', 'Wooden crate', 'prop', 'yours'), tile('robin', 'Robin', 'person', 'approved'), tile('drafty', 'Lamp', 'prop', 'draft')] }, 0)
  const j = rig({ jobs: o.jobs ?? [glbJob()], getJob: o.getJob })
  const info = pieceInfo()
  const rt = j.restart({ fetchInfo: async () => info })
  const massingRuns: string[][] = []
  const ctx: PiecesCtx = {
    publicDir: pub, runtime: () => rt, configured: () => true, now: () => new Date('2026-10-24T20:00:00Z'), rand: () => 'abcd',
    massing: {
      appDir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'), python: () => 'python',
      run: async (_py, args) => {
        massingRuns.push(args)
        if (o.massing === 'fail') throw new Error('No module named trimesh')
        copyFileSync(args[args.indexOf('--in') + 1], args[args.indexOf('--out') + 1])
      },
    },
  }
  return { pub, world, scene, ctx, rt, kits, submits: () => j.submits, massingRuns, ledger: j.ledger, restart: (over) => j.restart({ fetchInfo: async () => info, ...over }) }
}
