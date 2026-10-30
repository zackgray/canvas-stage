/**
 * "Draw from your approved frame" (draw-from-master plan section 2.1): one press of a kit take with `mode: 'edit'`. Same promises as
 * kitRun.ts (free refusals first, intents before the spend, the json last, a failure after a paid job keeps its draws), a different
 * first frame:
 *   free:  the set is unmoved, the scene has a look frame (sameLook.ts), the budget fits every job at once;
 *   A  free, local: the angle's control depth with the performer inpainted out (emptyDepth.ts), only when the plate is to be drawn;
 *   B  paid ~17: the plate, the empty set drawn on it (plateDraw.ts), reused by every later press on this take and start;
 *   C  paid ~8 a seed: ONE Qwen-Image-Edit job, plate + look frame + face, held to the full depth (editGraph.ts) -> `<id>-draw.png`;
 *   D  the existing Klein finish (kitFinish.ts), so the grade, the layout score, the judge and Approve work unchanged.
 * A press is the Stage's one button; a plate that landed while the edit failed is kept, and an edit that landed while the finish
 * did not is an unfinished draw ("Finish"). Runs inside run.ts's exclusive section; kitRun.ts hands off here.
 */
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { stillBibleKeys } from '../../src/shared/stillBible.ts'
import { isFreeRefusal, runJob } from '../jobs/index.ts'
import { writeDepthControl } from './depthImage.ts'
import { buildEditGraph, EDIT_NODES, editSaveNode } from './editGraph.ts'
import { buildEditPrompt, type EditPromptParts } from './editPrompt.ts'
import { emptyDepthName, makeEmptyDepth } from './emptyDepth.ts'
import { EDIT_CREDITS_PER_SEED, EDIT_DEPTH_END, EDIT_DEPTH_STRENGTH, EDIT_MADE_BY, editPressCredits, NO_LOOK_FRAME, type EditStillFields } from './editSpec.ts'
import { figuresAt, figureWords } from './figures.ts'
import { cameraAt, clayDirOf, perfTimeAt, refuseSetMoved, startOf } from './kitInputs.ts'
import { drawName, finishKitStills, type KitIntent } from './kitFinish.ts'
import { composeKitPress, depthControlName, type KitPress } from './kitRun.ts'
import type { KitStill } from './kitSpec.ts'
import { elementOf, firstClause, type StillPromptParts } from './kitStillPrompt.ts'
import { plainNoun } from './kitWords.ts'
import { isNamed, ownerText } from './pieceNames.ts'
import { plateId, readPlate, drawPlate } from './plateDraw.ts'
import { masterSources, projectedName, projectMaster } from './projectedView.ts'
import { buildPlatePrompt } from './platePrompt.ts'
import { sameLookOf } from './sameLook.ts'
import type { HeroCtx, ParsedRender } from './run.ts'
import { heroLabel } from './spec.ts'
import { beatAt, briefOf, heroAction, heroTagOf, placeOf } from './stillBrief.ts'
import { stillMotion } from './stillAction.ts'
import { pronounOf, samePerson } from './onePerson.ts'
import { heroDirOf, heroUrl, intentFile, writeJson, HeroHttpError } from './store.ts'
import { untag } from '../../src/shared/bibleContract.ts'

const each = (credits: number | null, n: number) => (credits == null ? 0 : Math.round((credits / n) * 100) / 100)
const rel = (publicDir: string, f: string) => path.relative(publicDir, f).split(path.sep).join('/')

/** the words both prompts need, composed free: the plate's parts and the edit's (also what the press preview shows, preview.ts) */
export async function composeWords(ctx: HeroCtx, p: KitPress, c: Awaited<ReturnType<typeof composeKitPress>>, projected: boolean): Promise<{ plate: string; edit: string }> {
  const { take, kit, frame } = p
  const cam = cameraAt(ctx.publicDir, take, frame), start = startOf(kit)
  const figures = figuresAt(clayDirOf(ctx.publicDir, take.id), frame, start, cam)
  const perfT = perfTimeAt(ctx.publicDir, take, frame)
  const motion = await stillMotion(ctx.publicDir, kit.perf, frame, perfT, cam)
  const desc = c.who.description
  const parts: StillPromptParts = { bible: c.bible, plan: kit.plan, cast: { cardId: c.castId, name: c.who.name, description: desc }, view: c.view, figures, action: motion.words, pose: motion.pose,
    takeAction: take.action, perfT, focal: cam?.focal ?? take.focal }
  const brief = briefOf(c.bible)
  const beat = beatAt(brief, heroTagOf(c.bible, c.castId, brief), perfT)
  const act = heroAction({ beat: beat && { ...beat, does: samePerson(beat.does, desc) }, takeAction: p.take.action && samePerson(p.take.action, desc), motion: motion.words, pose: motion.pose, name: c.who.name })
  const text = ownerText(c.bible, kit.plan.sentence)
  const named = (c.view?.pieces ?? kit.plan.kit).filter((k) => isNamed(k, !!elementOf(c.bible, k), text))
  const names = [...new Set(named.map((k) => (k.label?.trim() || plainNoun(k.kind)).replace(/[.\s]+$/, '')))].slice(0, 4)
  const place = brief ? placeOf(brief) : firstClause(untag(c.bible?.prompt?.trim() || kit.plan.sentence || '', (t) => t.replace(/[_-]+/g, ' ')))
  const hero = (figures ?? []).filter((f) => f.tag === 'hero')
  const edit: EditPromptParts = { place, pieces: names, prop: named[0] ? plainNoun(named[0].kind) : '', figure: figureWords(hero, '')[0] ?? '', doing: act.after || (act.attach ? `${pronounOf(desc)} ${pronounOf(desc) === 'They' ? 'are' : 'is'} ${act.attach}` : ''), description: desc, projected }
  return { plate: buildPlatePrompt(parts), edit: buildEditPrompt(edit) }
}

export async function renderEditStill(ctx: HeroCtx, req: ParsedRender, p: KitPress): Promise<{ stills: KitStill[] }> {
  const { take, role, frame, picks } = p
  const rt = ctx.deps.runtime()
  const dir = heroDirOf(ctx.publicDir, take.id)
  refuseSetMoved(ctx.publicDir, take)
  const c = await composeKitPress(ctx, req, p)
  const look = sameLookOf(ctx.publicDir, take, c.castId)
  if (!look) throw new HeroHttpError(409, NO_LOOK_FRAME, 'no_look')
  const n = picks.length
  // 'edit-projected': picture 1 is the approved master seen from this camera (free, local), so there is no plate and no plate bill
  const projected = req.mode === 'edit-projected'
  const src = projected ? masterSources(ctx.publicDir, take) : null // free refusals: another set than the scene's, no master, no master depth
  const plate = projected ? null : await readPlate(dir, take, frame)
  rt.budget.check(editPressCredits(n, projected || !!plate)) // both jobs at once, or a plate is paid for and stranded
  const words = await composeWords(ctx, p, c, projected)

  await mkdir(dir, { recursive: true })
  const depthPng = path.join(dir, depthControlName(frame))
  writeDepthControl(c.control.file, depthPng) // the FULL control depth (she is in it, so she lands on her mark)
  let made = plate, plateCost = 0, plateFile = path.join(dir, `${plateId(frame)}.png`)
  const cam = cameraAt(ctx.publicDir, take, frame)
  if (src) {
    if (!cam) throw new HeroHttpError(409, 'This take has no camera at this frame to see the master from. Nothing was billed.', 'no_camera')
    plateFile = (await projectMaster(ctx, { ...src, takeCam: { position: cam.position, quaternion: cam.quaternion, focal: cam.focal }, out: path.join(dir, projectedName(frame)) })).png
  } else if (!made) {
    const empty = await makeEmptyDepth(ctx, { clayDir: clayDirOf(ctx.publicDir, take.id), frame, depthPng, out: path.join(dir, emptyDepthName(frame)) }) // free refusals end here
    made = await drawPlate(rt, { take, dir, frame, seed: picks[0].seed, prompt: words.plate, emptyDepth: empty, now: p.now })
    plateCost = made.credits
  }
  const finish = { card: c.card, extra: Object.fromEntries(Object.entries(c.extra).map(([k, f]) => [k, rel(ctx.publicDir, f)])) }
  const intents: (KitIntent & EditStillFields)[] = picks.map((k) => ({
    id: k.id, takeId: take.id, startKey: take.startKey, png: heroUrl(take.id, `${k.id}.png`), seed: k.seed, jobId: null, credits: 0, approved: false, createdAt: p.now.toISOString(),
    castId: c.castId, role, frame, ...(c.bible ? { bibleVersion: c.bible.version, bibleKeys: stillBibleKeys(c.bible) } : {}), ...(take.setKey ? { setKey: take.setKey } : {}), madeBy: EDIT_MADE_BY,
    depthStrength: EDIT_DEPTH_STRENGTH, depthEnd: EDIT_DEPTH_END, lockPreset: null, controlDepth: c.control.source, materials: c.materials.map((m) => m.tag),
    prompt: words.edit, refs: Object.values(c.extra).map((f) => path.basename(f)), finish,
    drawMode: projected ? 'edit-projected' : 'edit', plateId: made?.id ?? null, lookStillId: look.stillId, lookTakeId: look.takeId, editSeed: k.seed,
  }))
  for (const s of intents) await writeJson(intentFile(dir, s.id), s)

  const draw = await runJob(rt, {
    graph: buildEditGraph({ prompt: words.edit, seeds: picks.map((k) => k.seed), prefix: `canvas-stage/${take.id}-draw` }),
    label: heroLabel(take.id, picks.map((k) => drawName(k.id))), estimateCredits: EDIT_CREDITS_PER_SEED * n,
    outputs: Object.fromEntries(picks.map((k) => [editSaveNode(k.seed), { dir, name: drawName(k.id) }])),
    binds: [[EDIT_NODES.plate, 'image', plateFile], [EDIT_NODES.look, 'image', look.file], [EDIT_NODES.face, 'image', c.who.faceFile], [EDIT_NODES.depth, 'image', depthPng]],
    note: `${take.id} ${role} f${frame} qwen edit x${n} from ${look.stillId} (${EDIT_CREDITS_PER_SEED * n} cr estimated)`, timeoutMs: 20 * 60_000,
  }).catch(async (e: unknown) => {
    if (isFreeRefusal(e)) for (const s of intents) await rm(intentFile(dir, s.id), { force: true })
    throw e
  })
  const lost = picks.filter((k) => !existsSync(path.join(dir, `${drawName(k.id)}.png`)))
  if (lost.length) throw new HeroHttpError(422, `job ${draw.jobId} succeeded but ${lost.length} draw(s) did not land; look it up by id, do not resubmit.`, 'bad_output')

  const share = each(draw.costCredits, n) + each(plateCost, n) // a plate drawn in this press is shared by its seeds
  return { stills: await finishKitStills(ctx, take, role, intents, () => share) }
}
