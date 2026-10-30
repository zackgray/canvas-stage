/**
 * One "Render this frame" press: 1..4 hero stills of a locked take in ONE Cloud job, through the shared runner (server/jobs).
 * Order, all free refusals first: the take is on disk, its opening frame was uploaded for this start, the cast face card
 * resolves, the prompt is built - then an INTENT per still is written - then ONE runJob. The pngs land first, each .json
 * last. One hero job at a time: a press the scene's job store sent waits its turn behind any other paid job (its record says
 * "waiting"; server/jobs/context.ts); a call without one (scripts, tests) is refused instead: 409 busy while any record of a hero
 * job is in flight, also one a restarted dev server started, and 409 "another paid job is running" while a Layout-To-Render pass or
 * a master draw runs. A failed job is recovered by id (POST /__lab/jobs/recover), never resubmitted.
 */
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { HeroRenderRequest, HeroStill } from '../../src/shared/shotContract.ts'
import { exclusive, isFreeRefusal, runJob, type JobRuntime } from '../jobs/index.ts'
import { resolveWho } from './face.ts'
import { buildHeroGraph } from './graph.ts'
import { clayDepthAt, parseKitFields } from './kitInputs.ts'
import { renderKitStill } from './kitRun.ts'
import { kitNobody } from './nobody.ts'
import { frameFor, type KitRenderFields } from './kitSpec.ts'
import type { RunPython } from './colorMatch.ts'
import { buildHeroPrompt } from './prompt.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { setRefusalFor } from '../bible/setGate.ts'
import { isL2RLabel, L2R_KEY } from '../l2r/spec.ts'
import { isMasterLabel, MASTER_KEY } from '../bible/masterDraw.ts'
import { HERO_KEY, heroCredits, heroLabel, isHeroLabel, MAX_PROMPT, MAX_SEEDS, NODES, saveNode } from './spec.ts'
import { heroDirOf, HeroHttpError, intentFile, openingFile, openingInfo, readTake, stillFile, stillIdOf, takeIdOf, writeJson, heroUrl } from './store.ts'

/** a kit take's cast card goes in lighter than the frame, so its own pose and framing do not pull the still (fix 2026-10-24) */

export interface HeroDeps {
  runtime: () => JobRuntime; seed?: () => number; now?: () => Date
  /** kit stills' colour-match (colorMatch.ts): the app's one Python (server/python.ts), the runner, the app folder holding scripts/ */
  python?: () => string | undefined; runPython?: RunPython; appDir?: string
}
export interface HeroCtx { publicDir: string; deps: HeroDeps }
export interface HeroRenderBody extends HeroRenderRequest, KitRenderFields { count?: number; prompt?: string; sid?: string }
export type ParsedRender = Required<Pick<HeroRenderBody, 'takeId'>> & Omit<HeroRenderBody, 'takeId'>

export function parseRenderRequest(body: unknown): ParsedRender {
  if (!body || typeof body !== 'object') throw new HeroHttpError(400, 'body must be a JSON object', 'bad_request')
  const b = body as Record<string, unknown>
  const takeId = takeIdOf(b.takeId)
  if (b.seed !== undefined && !(Number.isInteger(b.seed) && (b.seed as number) >= 0 && (b.seed as number) < 2 ** 32)) throw new HeroHttpError(400, 'seed must be a non-negative integer', 'bad_request')
  if (b.count !== undefined && !(Number.isInteger(b.count) && (b.count as number) >= 1 && (b.count as number) <= MAX_SEEDS)) throw new HeroHttpError(400, `count must be 1 to ${MAX_SEEDS}`, 'bad_request')
  if (b.prompt !== undefined && (typeof b.prompt !== 'string' || b.prompt.length > MAX_PROMPT)) throw new HeroHttpError(400, `prompt must be text of at most ${MAX_PROMPT} characters`, 'bad_request')
  if (b.sid !== undefined && (typeof b.sid !== 'string' || !/^perf-[\w-]{1,64}$/.test(b.sid))) throw new HeroHttpError(400, 'sid must be a perform session id', 'bad_request')
  return { takeId, seed: b.seed as number | undefined, count: b.count as number | undefined, prompt: b.prompt as string | undefined, sid: b.sid as string | undefined, ...parseKitFields(b) }
}

const stampOf = (d: Date) => d.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')

/** the press's still ids (never an existing file's) and seeds */
function pickIds(ctx: HeroCtx, dir: string, req: ParsedRender, now: Date): { id: string; seed: number }[] {
  const base = req.seed ?? (ctx.deps.seed ?? (() => Math.floor(Math.random() * 2 ** 31)))()
  const stamp = stampOf(now)
  return Array.from({ length: req.count ?? 1 }, (_, i) => {
    let id = `hero-${stamp}-${i + 1}`
    for (let k = 2; [`${id}.png`, `${id}.json`, `intent-${id}.json`, `${id}-draw.png`].some((f) => existsSync(path.join(dir, f))); k++) id = `hero-${stamp}-${i + 1}-${k}`
    return { id: stillIdOf(id), seed: (base + i * 7919) % 2 ** 32 }
  })
}

/** the paid sections a hero call without a scene job refuses to run beside (409, free); a scene job queues behind them */
export const HERO_OTHERS = [{ key: L2R_KEY, match: isL2RLabel }, { key: MASTER_KEY, match: isMasterLabel }]

export async function renderHero(ctx: HeroCtx, req: ParsedRender): Promise<{ stills: HeroStill[] }> {
  // (guided wave) a kit take's still is drawn from the set: refused free, before the queue, unless the set is approved at its current key
  const first = await readTake(ctx.publicDir, req.takeId)
  // (per-take set) a take that keeps its own set passes when that set was approved, whatever the scene's set is now (setGate.ts)
  const why = setRefusalFor(ctx.publicDir, first.worldId, first)
  if (why) throw new HeroHttpError(409, why, 'set_not_approved')
  const rt = ctx.deps.runtime()
  return exclusive(HERO_KEY, `a hero still of ${req.takeId}`, rt.store, isHeroLabel, async () => {
    const take = await readTake(ctx.publicDir, req.takeId)
    const kit = takeKitWorldFor(ctx.publicDir, take) // a kit world: the face may come from Cast, the prompt from its plan
    const role = req.role ?? 'opening'
    const now = (ctx.deps.now ?? (() => new Date()))()
    const dir = heroDirOf(ctx.publicDir, take.id)
    if (kit) {
      // a kit take with the clay's metric depth: the depth-locked Qwen draw + Klein finish, at the role's frame (kitRun.ts)
      const frame = frameFor(role, take.frames, req.frame)
      // free, before the depth check: the card that plays them; no one cast draws with no person only while they are out of the frame
      const who = kit.perf.castId ? await resolveWho(ctx.publicDir, take, req.sid, { castId: kit.perf.castId }) : kitNobody(ctx.publicDir, take, kit, frame)
      const zdepth = clayDepthAt(ctx.publicDir, take, frame)
      if (zdepth) return renderKitStill(ctx, req, { take, kit, role, frame, zdepth, picks: pickIds(ctx, dir, req, now), now, who })
      // every kit still is drawn on the clay's depth (the one-step Klein fallback is gone: the button is priced for this chain)
      throw new HeroHttpError(409, `This still is drawn on the 3D set's depth at its frame, and those frames are not prepared yet: press Prepare the frames under the locked take (free), then draw again. Nothing was billed.`, 'no_depth')
    }
    if (role !== 'opening') throw new HeroHttpError(400, 'mid and end keyframes are for kit worlds', 'bad_request')
    const opening = await openingInfo(ctx.publicDir, take.id)
    if (!opening.present) throw new HeroHttpError(400, "the take's opening frame has not been uploaded yet", 'opening_missing')
    if (opening.startKey !== null && opening.startKey !== take.startKey) throw new HeroHttpError(409, 'the uploaded opening frame is for an older start of this take: capture it again', 'stale_opening')
    const who = await resolveWho(ctx.publicDir, take, req.sid, null)
    const cast = { name: who.name, description: who.description }
    const prompt = buildHeroPrompt({ world: who.world, lighting: who.lighting, cast, focal: take.focal, override: req.prompt })

    const picks = pickIds(ctx, dir, req, now)
    const n = picks.length
    const intents: HeroStill[] = picks.map((p) => ({ id: p.id, takeId: take.id, startKey: take.startKey, png: heroUrl(take.id, `${p.id}.png`), seed: p.seed, jobId: null, credits: 0, approved: false, createdAt: now.toISOString(), prompt
    }))
    for (const s of intents) await writeJson(intentFile(dir, s.id), s) // before the spend: a job recovered by id can always be put back

    const estimate = heroCredits(n)
    const ids = picks.map((p) => p.id)
    const r = await runJob(rt, {
      graph: buildHeroGraph({ prompt, picks, prefix: `canvas-stage/${take.id}` }), label: heroLabel(take.id, ids), estimateCredits: estimate,
      outputs: Object.fromEntries(picks.map((p) => [saveNode(p.id), { dir, name: p.id }])),
      binds: [[NODES.opening, 'image', openingFile(ctx.publicDir, take.id)], [NODES.face, 'image', who.faceFile]],
      note: `${take.id} hero x${n} seeds ${picks.map((p) => p.seed).join(',')} (${estimate} cr estimated)`, timeoutMs: 15 * 60_000,
    }).catch(async (e: unknown) => {
      // a free refusal (budget, invalid graph, no object_info) spent nothing: its intents are not a paid render's and go
      if (isFreeRefusal(e)) for (const s of intents) await rm(intentFile(dir, s.id), { force: true })
      throw e
    })

    const each = r.costCredits == null ? 0 : Math.round((r.costCredits / n) * 100) / 100
    const missing = ids.filter((id) => !existsSync(path.join(dir, `${id}.png`)))
    if (missing.length) throw new HeroHttpError(422, `job ${r.jobId} succeeded but ${missing.join(', ')} did not land; look it up by id, do not resubmit.`, 'bad_output')
    const stills = intents.map((s) => ({ ...s, jobId: r.jobId, credits: each }))
    for (const s of stills) await writeJson(stillFile(dir, s.id), s) // LAST: its existence is what makes the still exist
    return { stills }
  }, HERO_OTHERS)
}
