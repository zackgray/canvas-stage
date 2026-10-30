/**
 * The second half of a kit still (kitRun.ts steps 3-5): colour-match the draws (free), ONE Klein 4B job with the references the
 * intent recorded, the layout check, and each still's json LAST. Shared by the press and by "Finish" (POST /__lab/hero/finish),
 * which runs only this half for draws that landed while their finish never ran: a budget refusal between the two jobs, or a dev
 * server that died between them (M4). Their intent already holds the card prompt and the reference files, so a Finish spends
 * only the Klein credits (~2 cr a still) and never draws again. Its own free refusals come first (stale take, a reference gone,
 * the budget), then one runJob.
 */
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { KeyframeRole, TakeRecord } from '../../src/shared/shotContract.ts'
import { runJob, type JobRecord, type JobRuntime, type JobStore } from '../jobs/index.ts'
import { colorMatch } from './colorMatch.ts'
import { readBibleFile } from '../bible/read.ts'
import { clayDepthAt, gradeTarget } from './kitInputs.ts'
import { KLEIN_CREDITS_PER_STILL, KLEIN_REF_MP, type KitStill, type StillGrade, type UnfinishedStill } from './kitSpec.ts'
import { buildKleinGraph, kleinSaveNode } from './kleinGraph.ts'
import { checkLayout } from './layoutCheck.ts'
import type { HeroCtx } from './run.ts'
import { heroLabel, isHeroLabel, STILL_ID_RE } from './spec.ts'
import { heroDirOf, heroUrl, HeroHttpError, intentFile, listStills, readJson, stillFile, writeJson } from './store.ts'

/** the Klein step's inputs as the intent records them: the card prompt and each reference (node key -> public-relative file) */
export interface FinishInputs { card: string; extra: Record<string, string> }
/** a kit still's intent: the still minus its job, plus what its finish needs */
export type KitIntent = KitStill & { finish?: FinishInputs }

export const drawName = (id: string) => `${id}-draw`
const round2 = (n: number) => Math.round(n * 100) / 100
const each = (credits: number | null | undefined, n: number) => (credits == null ? 0 : round2(credits / Math.max(1, n)))
/** a job record's ids (the label after `hero-still <take>`) */
const idsOf = (r: JobRecord) => r.label.split(' ').slice(2)
/** the newest hero record whose label names `token` exactly (a still id, or its `-draw` name) */
export const heroRecordOf = (store: JobStore, token: string): JobRecord | undefined => store.list().find((r) => isHeroLabel(r.label) && idsOf(r).includes(token))
/** a still's share of a record's measured cost */
export const shareOf = (r: JobRecord | undefined) => (r ? each(r.costCredits, idsOf(r).length) : 0)

export async function finishKitStills(ctx: HeroCtx, take: TakeRecord, role: KeyframeRole, intents: KitIntent[], drawCost: (id: string) => number): Promise<KitStill[]> {
  const rt = ctx.deps.runtime()
  const dir = heroDirOf(ctx.publicDir, take.id)
  const fin = intents[0].finish!
  const bible = readBibleFile(ctx.publicDir, take.worldId)
  const drawn = intents.map((s) => path.join(dir, `${drawName(s.id)}.png`))
  const target = gradeTarget(ctx.publicDir, role, bible, await listStills(ctx.publicDir, take.id, rt.store), (s) => path.join(dir, `${s.id}.png`))
  const cm = { appDir: ctx.deps.appDir ?? path.resolve(ctx.publicDir, '..'), python: ctx.deps.python ?? (() => undefined), run: ctx.deps.runPython ?? (async () => { throw new Error('no runner') }) }
  const grades: StillGrade[] = []
  for (const f of drawn) grades.push(await colorMatch(cm, f, target))

  // Klein: image 1 = the draw (1 MP), then face, gear, master, materials at 0.5 MP each
  const extra = Object.fromEntries(Object.entries(fin.extra).map(([k, rel]) => [k, path.join(ctx.publicDir, rel)]))
  const files: Record<string, string> = {}, mp: Record<string, number> = {}
  for (const k of Object.keys(extra)) { files[k] = `${k}.png`; mp[k] = KLEIN_REF_MP }
  const list = intents.map((s, i) => { files[`rw${i}`] = `still${i}.png`; return { id: s.id.replace(/[^\w]/g, '_'), seed: s.seed, refs: [`rw${i}`, ...Object.keys(extra)], prompt: fin.card } })
  const n = intents.length, ids = intents.map((s) => s.id)
  const r = await runJob(rt, {
    graph: buildKleinGraph(list, `canvas-stage/${take.id}`, files, mp), label: heroLabel(take.id, ids), estimateCredits: KLEIN_CREDITS_PER_STILL * n,
    outputs: Object.fromEntries(intents.map((s, i) => [kleinSaveNode(list[i].id), { dir, name: s.id }])),
    binds: [...drawn.map((f, i) => [`rw${i}`, 'image', f] as [string, string, string]), ...Object.entries(extra).map(([k, f]) => [k, 'image', f] as [string, string, string])],
    note: `${take.id} ${role} f${intents[0].frame ?? 0} klein finish x${n} (${KLEIN_CREDITS_PER_STILL * n} cr estimated)`, timeoutMs: 15 * 60_000,
  })
  const missing = ids.filter((id) => !existsSync(path.join(dir, `${id}.png`)))
  if (missing.length) throw new HeroHttpError(422, `job ${r.jobId} succeeded but ${missing.join(', ')} did not land; look it up by id, do not resubmit.`, 'bad_output')

  const zdepth = clayDepthAt(ctx.publicDir, take, intents[0].frame ?? 0)
  const stills: KitStill[] = intents.map(({ finish: _f, ...s }, i) => ({
    ...s, jobId: r.jobId, credits: round2(drawCost(s.id) + each(r.costCredits, n)), grade: grades[i],
    layout: zdepth ? checkLayout(zdepth, path.join(dir, `${s.id}.png`)) : null,
  }))
  for (const s of stills) await writeJson(stillFile(dir, s.id), s) // LAST: its existence is what makes the still exist
  return stills
}

/**
 * Kit stills drawn but never finished: an intent whose `-draw.png` landed with no final png or json, and no billed finish job
 * (that one is Recover's, not a new spend). The newest first. What Shoot offers a priced "Finish" for.
 */
export async function unfinishedStills(publicDir: string, takeId: string, store: JobStore): Promise<UnfinishedStill[]> {
  const dir = heroDirOf(publicDir, takeId)
  if (!existsSync(dir)) return []
  const names = new Set(await readdir(dir))
  const out: UnfinishedStill[] = []
  for (const f of names) {
    const m = /^intent-(hero-[\w-]+)\.json$/.exec(f)
    if (!m || !STILL_ID_RE.test(m[1])) continue
    const id = m[1]
    if (!names.has(`${drawName(id)}.png`) || names.has(`${id}.png`) || names.has(`${id}.json`)) continue
    const intent = await readJson<KitIntent>(path.join(dir, f))
    if (!intent?.finish || intent.takeId !== takeId) continue
    if (heroRecordOf(store, id)?.jobId) continue // its finish was billed: recover that job by id instead
    out.push({ id, role: intent.role ?? 'opening', frame: intent.frame ?? 0, png: heroUrl(takeId, `${drawName(id)}.png`), createdAt: intent.createdAt, startKey: intent.startKey })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
}

/** POST /__lab/hero/finish: the Klein step alone for the take's unfinished draws (all, or the ids asked), one role at a time. */
export async function resumeFinish(ctx: HeroCtx, take: TakeRecord, want: string[] | undefined, rt: JobRuntime): Promise<KitStill[]> {
  const dir = heroDirOf(ctx.publicDir, take.id)
  const open = await unfinishedStills(ctx.publicDir, take.id, rt.store)
  const pick = want?.length ? open.filter((u) => want.includes(u.id)) : open
  if (!pick.length) throw new HeroHttpError(404, 'No drawn still of this take is waiting for its finish.', 'not_found')
  const role = pick[0].role
  const same = pick.filter((u) => u.role === role)
  if (same.some((u) => u.startKey !== take.startKey)) throw new HeroHttpError(409, 'Those draws are of an older opening of this take (its camera, lens or performance frame changed): draw again.', 'stale')
  const read = (await Promise.all(same.map((u) => readJson<KitIntent>(intentFile(dir, u.id))))).filter((s): s is KitIntent => !!s?.finish)
  // one Klein job takes one card and one set of references: the draws of one press (or presses that asked the same)
  const intents = read.filter((s) => JSON.stringify(s.finish) === JSON.stringify(read[0].finish))
  const lost = Object.values(intents[0].finish!.extra).filter((rel) => !existsSync(path.join(ctx.publicDir, rel)))
  if (lost.length) throw new HeroHttpError(409, `A reference the finish needs is gone (${lost.map((f) => path.basename(f)).join(', ')}): draw the still again.`, 'inputs')
  rt.budget.check(KLEIN_CREDITS_PER_STILL * intents.length) // free: refused before anything is sent
  return finishKitStills(ctx, take, role, intents, (id) => shareOf(heroRecordOf(rt.store, drawName(id))))
}
