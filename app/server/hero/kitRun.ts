/**
 * One "Render this frame" press on a kit take whose clay has metric depth (plan §3.3): for the opening, mid or end keyframe,
 *   1. free (composeKitPress, also what the press preview shows, preview.ts): the depth image that drives the control (the seam,
 *      kitInputs controlDepthFor), the figures' places and sizes (figures.ts), the prompts (an unknown @tag is refused, 409), the
 *      lock preset (lockPresets.ts), the material references (the press's tags, else the visible pieces' board tiles);
 *   then the day budget is checked for BOTH jobs and intents (with what the finish needs) are written;
 *   2. paid: ONE Qwen-Image 2512 job draws the seeds asked for (the Stage offers 1 or 2) held to that depth, 1920x1088 (qwenGraph.ts, ~14 cr a still);
 *   3-5. kitFinish.ts: colour-match (free), ONE Klein 4B finish (~2 cr), the layout check, the json LAST.
 * The two jobs carry distinct labels (`<id>-draw` for the draw), so a still is completed and priced from the right record.
 * A draw whose finish never ran stays an intent with its `-draw.png`: the Stage lists it and offers "Finish" (kitFinish.ts).
 * A keyframe is never an edit of the master (Wave 0 P3: Qwen-Image-Edit did not hold camera or pose). Runs inside run.ts's
 * exclusive section. A free refusal of the first job removes the intents; a failure after the first job keeps its draws.
 */
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { KeyframeRole, TakeRecord } from '../../src/shared/shotContract.ts'
import { stillBibleKeys } from '../../src/shared/stillBible.ts'
import { unknownTagMessage, UnknownTagError } from '../bible/prompt.ts'
import { takeBible } from '../takes/words.ts'
import { isFreeRefusal, runJob } from '../jobs/index.ts'
import type { KitWorld } from '../stage3d/types.ts'
import { castGear } from './castCard.ts'
import { writeDepthControl } from './depthImage.ts'
import { resolveWho } from './face.ts'
import { figuresAt } from './figures.ts'
import { bibleFile, cameraAt, clayDirOf, controlDepthFor, defaultRefTags, materialRefs, perfTimeAt, refuseSetMoved, startOf } from './kitInputs.ts'
import { drawName, finishKitStills, type KitIntent } from './kitFinish.ts'
import { kitStillCredits, QWEN_CREDITS_PER_STILL, type KitStill } from './kitSpec.ts'
import { buildDrawPrompt, drawAdditions, drawStyled } from './kitStillPrompt.ts'
import { buildCardPrompt, kleinRefs } from './kleinCard.ts'
import { cardMaterial, sameFile } from './kleinInputs.ts'
import { renderEditStill } from './kitRunEdit.ts'
import { heroOutOfFrame, kitNobody } from './nobody.ts'
import { pieceCoverAt, topRowSolid, wordsView } from './pieceCover.ts'
import { kitView } from './kitView.ts'
import { lockFor } from './lockPresets.ts'
import { stillMotion } from './stillAction.ts'
import { buildQwenDepthGraph, QWEN_NODES, qwenSaveNode } from './qwenGraph.ts'
import { sameLookOf } from './sameLook.ts'
import type { HeroCtx, ParsedRender } from './run.ts'
import { heroLabel } from './spec.ts'
import { heroDirOf, intentFile, writeJson, heroUrl, HeroHttpError } from './store.ts'

export const QWEN_MADE_BY = 'qwen-image-2512+union-depth -> klein-4b'

export interface KitPress {
  take: TakeRecord; kit: KitWorld; role: KeyframeRole; frame: number; zdepth: string; picks: { id: string; seed: number }[]; now: Date
  /** who plays the hero, when the caller has resolved it already (m15: once per press) */
  who?: Awaited<ReturnType<typeof resolveWho>>
}

const each = (credits: number | null, n: number) => (credits == null ? 0 : Math.round((credits / n) * 100) / 100)
const rel = (publicDir: string, f: string) => path.relative(publicDir, f).split(path.sep).join('/')

/** the depth control image a press binds, by frame (also what the preview shows beside the clay frame) */
export const depthControlName = (frame: number) => `depth-${String(frame).padStart(3, '0')}.png`

/** Everything a press would send, composed for free (no budget, no write, no Cloud): the press and the preview both call it. */
export async function composeKitPress(ctx: HeroCtx, req: ParsedRender, p: Omit<KitPress, 'picks' | 'now'>) {
  const { take, kit, frame } = p
  const castId = kit.perf.castId ?? null
  // no one cast: the draw has no person (nobody.ts), refused free while the performer is in the frame
  const nobody = !castId
  const who = p.who ?? (castId ? await resolveWho(ctx.publicDir, take, req.sid, { castId }) : kitNobody(ctx.publicDir, take, kit, frame))
  // (stage-only) the finish's gear image is the card's own full-body front (usually the face file, so it drops) unless the press asks
  // for the scene's approved look frame (sameLook.ts): Klein copies whatever is in that frame, so a close-up could wear a wide's
  // props. "Draw from your approved frame" (kitRunEdit.ts) is that frame by choice. The look is found either way, so the preview can offer it
  const look = sameLookOf(ctx.publicDir, take, castId)
  const useLook = !!look && (req.sameLook === true || req.mode === 'edit' || req.mode === 'edit-projected')
  const gear = useLook && look ? look.file : await castGear(ctx.publicDir, castId)
  // the take's own words lead the draw and are what its stills record (takes/words.ts); older takes read the scene prompt
  const bible = takeBible(ctx.publicDir, take)
  const master = bibleFile(ctx.publicDir, bible?.master?.png)
  const cam = cameraAt(ctx.publicDir, take, frame)
  const start = startOf(kit)
  const view = cam ? kitView(kit.plan, frame === 0 ? start : undefined, cam) : null
  // the press's tags; none named = the visible pieces' board tiles, then the materials (E139 M3); [] = none
  const refTags = req.materials ?? defaultRefTags(ctx.publicDir, bible, view?.pieces ?? kit.plan.kit)
  const asked = materialRefs(ctx.publicDir, bible, refTags)
  const figures = figuresAt(clayDirOf(ctx.publicDir, take.id), frame, start, cam)
  // (prompt-fix pass) the cast's figure known to be out of this frame: the finish has no person to make, so no face or gear image goes
  // and its card says so (a car close-up's finish grew a driver with a face); figures not known keep the person line, as before
  const noFace = nobody || heroOutOfFrame(figures)
  // (prompt wave) Klein takes 4 images: identical files once (run 1 sent the cast's front image as face AND gear), the master first to go
  const refs = kleinRefs({ face: noFace ? null : who.faceFile, gear: noFace ? null : gear, master, materials: asked, fileOf: (m) => m.file }, sameFile)
  const materials = refs.materials
  // what the hero does at THIS frame (tidy wave): the performance's segment at the frame's performance time, as the set plays it
  // (prompt wave) the brief's beat for the hero at that time comes first, then the take's written action; the segment is the fallback
  const perfT = perfTimeAt(ctx.publicDir, take, frame)
  // (lift wave) a take whose action names its own pose by phase says that pose at the frame, before any beat (stillAction.ts)
  const motion = await stillMotion(ctx.publicDir, kit.perf, frame, perfT, cam)
  // the words read the ID pass and the clay depth's top row for which pieces are seen and cut at the top (pieceCover.ts); the references keep `view`
  const parts = { bible, plan: kit.plan, cast: { cardId: castId, name: who.name, description: who.description }, view: wordsView(view, pieceCoverAt(clayDirOf(ctx.publicDir, take.id), frame), topRowSolid(p.zdepth)), figures, adds: req.drawAdds, action: motion.words, pose: motion.pose, takeAction: take.action, perfT,
    focal: cam?.focal ?? take.focal }
  let prompt: string, composed: string
  try {
    // (owner 10-29) "Same look" takes the look frame's clothes and seed; it no longer appends that take's style words to the prompt
    composed = buildDrawPrompt(parts)
    prompt = req.prompt?.trim() ? buildDrawPrompt({ ...parts, override: req.prompt }) : composed
  } catch (e) {
    // M1: a scene naming a tag no reference answers to would draw a still with no place at all; refused, free
    if (e instanceof UnknownTagError) throw new HeroHttpError(409, `${unknownTagMessage(e.unknown)} (in the Stage's words; nothing was spent)`, 'unknown_tag')
    throw e
  }
  // a draw that states a picture medium (its words, the brief's style, the card, or the pasted prompt) is not finished as a photograph
  const styled = drawStyled(req.prompt?.trim() ? { ...parts, override: req.prompt } : parts)
  const cardComposed = buildCardPrompt({ face: !noFace, gear: !!refs.gear, master: !!refs.master, materials: materials.map((m) => cardMaterial(bible, m)), styled })
  // (owner 10-29) the finish's words as edited in "What will be sent" go as written; only the text changes, never an image input
  const card = req.finishPrompt?.trim() ? req.finishPrompt.trim() : cardComposed
  // Klein's references beyond the draw, in image order: face, gear, master, materials (recorded for a later "Finish"); nobody in the
  // frame: no face (the Klein graph chains whatever references are bound, kleinGraph.ts, so the rest simply move up a number)
  const extra: Record<string, string> = { ...(noFace ? {} : { rf: who.faceFile }), ...(refs.gear ? { rg: refs.gear } : {}), ...(refs.master ? { rs: refs.master } : {}) }
  materials.forEach((m, i) => { extra[`rt${i}`] = m.file })
  return { castId, who, bible, view, materials, adds: drawAdditions(parts), drawAdds: req.drawAdds, refsDropped: refs.dropped, prompt, composed, edited: prompt !== composed, card, cardComposed, extra, lock: lockFor(req), control: controlDepthFor(ctx.publicDir, take, frame, p.zdepth),
    /** no one cast and the performer out of the frame (nobody.ts): no person; with no figure at all, people go in the negative */
    nobody, noPeople: nobody && !!figures && figures.length === 0,
    /** the approved frame the finish takes the clothes from, only when the press asked for it (its seed is the Stage press's to send) */
    sameLook: useLook && refs.gear ? look : null,
    /** the approved frame the press COULD take the clothes from (the Stage offers the choice), null when the scene has none */ lookFrame: look }
}

export async function renderKitStill(ctx: HeroCtx, req: ParsedRender, p: KitPress): Promise<{ stills: KitStill[] }> {
  if (req.mode === 'edit' || req.mode === 'edit-projected') return renderEditStill(ctx, req, p) // "Draw from your approved frame" (kitRunEdit.ts)
  const { take, role, frame, picks } = p
  const rt = ctx.deps.runtime()
  const dir = heroDirOf(ctx.publicDir, take.id)
  refuseSetMoved(ctx.publicDir, take) // T3: the server's own set check, before the budget and any write
  const c = await composeKitPress(ctx, req, p)
  const n = picks.length
  // M4: the press is two billed jobs; both must fit today's budget before the first is sent, or a draw is paid for and stranded
  rt.budget.check(kitStillCredits(n))

  const depthPng = path.join(dir, depthControlName(frame))
  await mkdir(dir, { recursive: true }) // a kit still needs no opening upload, so nothing may have made the folder yet
  writeDepthControl(c.control.file, depthPng)
  const finish = { card: c.card, extra: Object.fromEntries(Object.entries(c.extra).map(([k, f]) => [k, rel(ctx.publicDir, f)])) }
  const intents: KitIntent[] = picks.map((k) => ({
    id: k.id, takeId: take.id, startKey: take.startKey, png: heroUrl(take.id, `${k.id}.png`), seed: k.seed, jobId: null, credits: 0, approved: false, createdAt: p.now.toISOString(),
    castId: c.castId, role, frame, ...(c.bible ? { bibleVersion: c.bible.version, bibleKeys: stillBibleKeys(c.bible) } : {}), ...(take.setKey ? { setKey: take.setKey } : {}), madeBy: QWEN_MADE_BY,
    depthStrength: c.lock.strength, depthEnd: c.lock.end, lockPreset: c.lock.preset, controlDepth: c.control.source, materials: c.materials.map((m) => m.tag),
    prompt: c.prompt, refs: Object.values(c.extra).map((f) => path.basename(f)), finish,
  }))
  for (const s of intents) await writeJson(intentFile(dir, s.id), s)

  const draw = await runJob(rt, {
    graph: buildQwenDepthGraph({ prompt: c.prompt, seeds: picks.map((k) => k.seed), prefix: `canvas-stage/${take.id}-draw`, strength: c.lock.strength, end: c.lock.end, noPeople: c.noPeople }),
    label: heroLabel(take.id, picks.map((k) => drawName(k.id))), estimateCredits: QWEN_CREDITS_PER_STILL * n,
    outputs: Object.fromEntries(picks.map((k) => [qwenSaveNode(k.seed), { dir, name: drawName(k.id) }])), binds: [[QWEN_NODES.depth, 'image', depthPng]],
    note: `${take.id} ${role} f${frame} qwen draw x${n} ${c.lock.preset ?? 'raw'} lock (${QWEN_CREDITS_PER_STILL * n} cr estimated)`, timeoutMs: 20 * 60_000,
  }).catch(async (e: unknown) => {
    if (isFreeRefusal(e)) for (const s of intents) await rm(intentFile(dir, s.id), { force: true })
    throw e
  })
  const lost = picks.filter((k) => !existsSync(path.join(dir, `${drawName(k.id)}.png`)))
  if (lost.length) throw new HeroHttpError(422, `job ${draw.jobId} succeeded but ${lost.length} draw(s) did not land; look it up by id, do not resubmit.`, 'bad_output')

  const share = each(draw.costCredits, n)
  return { stills: await finishKitStills(ctx, take, role, intents, () => share) }
}
