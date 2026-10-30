/**
 * One "Build in 3D" press, with the hero still's money discipline (server/hero/run.ts): every check is free and first (a kit
 * world built in a scene, an approved prop tile with its look on disk, no build of that tile in the air or paid-and-unrecovered),
 * then the press's intent is written, then ONE runJob (TRELLIS.2, allowModels for the weights object_info does not list). A free
 * refusal removes the intent; a billed failure keeps it and its job id, and GET shows Recover (POST /__lab/jobs/recover, free),
 * after which completePiece places the recovered mesh. Nothing here ever resubmits. One piece build at a time (409), and none
 * while a hero still, a render, a master or a concept draw runs (they would queue silently behind the runner's lock).
 */
import { readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { exclusive, isFreeRefusal, JobError, runJob, type JobRuntime } from '../jobs/index.ts'
import { isMasterLabel, MASTER_KEY } from '../bible/masterDraw.ts'
import { HERO_KEY, isHeroLabel } from '../hero/spec.ts'
import { isL2RLabel, L2R_KEY } from '../l2r/spec.ts'
import { CONCEPT_KEY, isConceptLabel } from '../scene/concepts.ts'
import type { KitItem } from '../../src/stage3d/contract.ts'
import { KitStore } from '../stage3d/store.ts'
import { placeInBuilt } from '../stage3d/builtPlan.ts'
import { buildPieceGraph } from './graph.ts'
import { buildMassing, type MassingDeps } from './massing.ts'
import { glbExtent, pieceItem, placeInCopy, placePiece } from './place.ts'
import { FILES, isPieceLabel, NODES, PIECE_CR, PIECE_MODELS, PIECES_KEY, pieceLabel, runUrl, TAG_RE, type PieceIntent, type PieceRecord } from './spec.ts'
import { PieceError, PieceStore } from './store.ts'

export interface PiecesCtx {
  publicDir: string; runtime: () => JobRuntime; configured: () => boolean; massing: MassingDeps
  now?: () => Date; rand?: () => string
}

export const PIECE_OTHERS = [
  { key: HERO_KEY, match: isHeroLabel }, { key: L2R_KEY, match: isL2RLabel }, { key: MASTER_KEY, match: isMasterLabel }, { key: CONCEPT_KEY, match: isConceptLabel },
]

/** the tile and run being built per world, process-wide (a Vite restart re-bundles this module mid-job) */
const BUILDING_KEY = Symbol.for('canvas-stage.pieces.building')
const building = (): Map<string, string> => ((globalThis as Record<symbol, Map<string, string> | undefined>)[BUILDING_KEY] ??= new Map())
export const buildingOf = (world: string): string | null => building().get(world) ?? null

const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {})

/** Build one tile's piece. Resolves to the placed piece; throws PieceError / JobError (status = the HTTP code, jobId when billed). */
export async function buildPiece(ctx: PiecesCtx, body: unknown): Promise<PieceRecord> {
  const store = new PieceStore(ctx.publicDir), kits = new KitStore(ctx.publicDir)
  const b = obj(body), world = store.world(b.world), tag = String(b.tag ?? '')
  if (!TAG_RE.test(tag)) throw new PieceError(400, 'tag must be a board tag')
  kits.read(world) // 404 / 409 when it is not a readable kit world
  const { scene, tiles } = store.tiles(world)
  if (!scene) throw new PieceError(409, 'this set was not built in a scene, so it has no board to build pieces from')
  const t = tiles.find((x) => x.tag === tag)
  if (!t) throw new PieceError(404, `@${tag} is not an approved prop tile with a drawing on this scene's board`)
  const rt = ctx.runtime()
  const st = store.state(world, t, rt.store.list(), buildingOf(world))
  if (st.status === 'building') throw new PieceError(409, `@${tag} is already being built`)
  if (st.recover) throw new PieceError(409, `@${tag}'s last build was paid and never came back: Recover it (free) before building again`)
  if (st.status === 'landed') throw new PieceError(409, `@${tag}'s mesh is here but not placed yet: place it (free) before building again`)
  if (!ctx.configured()) throw new PieceError(503, 'No Comfy target is configured (COMFY_API_KEY or COMFY_BASE_URL), so nothing can be built.')
  const now = (ctx.now ?? (() => new Date()))()
  const rand = (ctx.rand ?? (() => Math.random().toString(36).slice(2, 6).padEnd(4, '0')))()
  const run = `p-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${rand}`
  const intent: PieceIntent = { world, scene, tag, run, kind: t.kind, name: t.name, look: t.look, estimate: PIECE_CR, createdAt: now.toISOString() }
  return exclusive(PIECES_KEY, `a 3D piece of @${tag}`, rt.store, isPieceLabel, async () => {
    building().set(world, `${tag} ${run}`)
    const dir = store.dir(world, tag, run)
    try {
      await store.writeIntent(intent) // before the spend: a job recovered by id can always be put back
      const r = await runJob(rt, {
        graph: buildPieceGraph(`canvas-stage/piece-${tag}`), label: pieceLabel(world, tag, run), estimateCredits: PIECE_CR,
        outputs: { [NODES.glb]: { dir, name: 'mesh' } }, binds: [[NODES.image, 'image', t.file]], allowModels: PIECE_MODELS,
        note: `set piece @${tag} (${t.kind}) TRELLIS.2 shape only 1024 (${PIECE_CR} cr estimated)`, timeoutMs: 15 * 60_000,
      }).catch(async (e: unknown) => {
        if (isFreeRefusal(e) || (e instanceof JobError && !e.jobId && e.code === 'submit')) await rm(dir, { recursive: true, force: true })
        throw e
      })
      if (!store.hasMesh(world, tag, run)) throw new JobError('failed', `job ${r.jobId} succeeded but its mesh did not land; recover it by id, do not build again`, 422, r.jobId)
      return await completePiece(ctx, { world, tag, run }, { jobId: r.jobId, credits: r.costCredits })
    } finally { building().delete(world) }
  }, PIECE_OTHERS)
}

/**
 * Free: a run whose mesh is on disk (just built, or recovered by id) gets its massing clay and goes into the plan; piece.json is
 * written last. Idempotent: a run already placed answers its record.
 */
export async function completePiece(ctx: PiecesCtx, body: unknown, paid?: { jobId: string | null; credits: number | null }): Promise<PieceRecord> {
  const store = new PieceStore(ctx.publicDir), kits = new KitStore(ctx.publicDir)
  const b = obj(body), world = store.world(b.world), tag = String(b.tag ?? ''), run = String(b.run ?? '')
  const done = store.record(world, tag, run)
  if (done) return done
  const intent = store.intent(world, tag, run)
  if (!intent) throw new PieceError(404, 'no such build')
  if (!store.hasMesh(world, tag, run)) throw new PieceError(409, 'its mesh has not landed: recover the job by id first')
  const dir = store.dir(world, tag, run), mesh = path.join(dir, FILES.mesh), massing = path.join(dir, FILES.massing)
  const why = await buildMassing(ctx.massing, intent.kind, mesh, massing)
  const url = runUrl(world, tag, run, FILES.mesh), massingUrl = why ? null : runUrl(world, tag, run, FILES.massing)
  const item = pieceItem(intent.kind, tag, url, massingUrl, glbExtent(readFileSync(mesh)))
  let placed: PieceRecord['placed'] = 'free'
  const now = (ctx.now ?? (() => new Date()))()
  /** the mesh as placed over its own stand-in (a Stage-added prop's), for the built copy */
  let stood: KitItem | null = null
  kits.changeKit(world, (plan) => {
    const stand = plan.kit.some((it) => !it.glb && it.pieceTag === item.pieceTag)
    const p = placePiece(plan, item); placed = p.placed
    stood = stand ? p.kit.find((it) => it.glb?.url === url) ?? null : null
    return p.kit
  }, now)
  placeInBuilt(kits, world, (plan) => placeInCopy(plan, item, stood)) // Reset the set keeps the built mesh
  const rec = paid ?? (() => {
    const r = ctx.runtime().store.list().filter((x) => x.label === pieceLabel(world, tag, run)).at(-1)
    return { jobId: r?.jobId ?? null, credits: r?.costCredits ?? null }
  })()
  const out: PieceRecord = { world, tag, run, kind: intent.kind, url, massingUrl, jobId: rec.jobId, credits: rec.credits, placed, ...(why ? { massingNote: why } : {}), placedAt: now.toISOString() }
  await store.writeRecord(out) // LAST: its existence is what makes the piece placed
  return out
}
