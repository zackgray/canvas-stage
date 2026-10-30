/**
 * The still's press preview (troubleshooting review item 1): POST /__lab/hero/preview composes exactly what "Draw this frame"
 * would send (composeKitPress, the same function the press runs) and answers it with NO Cloud call, no budget check and no
 * intent: the prompt (the owner's edit as written, and the composed default), the lock preset, every board tile that could
 * go as a material reference and which would, the seeds and the price, and the depth image the draw is held to (written beside
 * the take's stills as preview-depth-NNN.png, so a running press's own depth file is never touched), and every paid job the press
 * sends with its exact words (`sent`, owner 10-29: the draw and its negative, the finish; the empty set and the edit when drawing from
 * the approved frame), from the same functions the press runs. Refusals are the press's
 * (bad body 400, unknown tag 409, no cast 409). Kit takes only: a panorama take's still has no depth or preset.
 */
import { existsSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { EditPreview, LookFrame, PromptWarning, SentJob, StillPreviewResponse, StillRefChip } from '../../src/shared/stillPressContract.ts'
import { warnPrompt, briefFromBible } from '../prompt/warn.ts'
import { EDIT_SEED_CREDITS, editPressCredits, NO_LOOK_FRAME, PLATE_CREDITS } from './editSpec.ts'
import { plateId, readPlate } from './plateDraw.ts'
import { sameLookOf, type SameLook } from './sameLook.ts'
import { facePrompt, faceRedrawWords } from './faceRedraw.ts'
import { briefOf, heroTagOf } from './stillBrief.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { writeDepthControl } from './depthImage.ts'
import { claySetMoved } from '../l2r/inputs.ts'
import { clayDepthAt, readClay, materialRefs, perfTimeAt, refCandidates } from './kitInputs.ts'
import { composeKitPress, depthControlName } from './kitRun.ts'
import { composeWords } from './kitRunEdit.ts'
import { drawNegative, drawNegativeEnglish, QWEN_NEG_SOURCE } from './qwenGraph.ts'
import { addOn, DRAW_ADD_KEYS } from './drawAdds.ts'
import { DEFAULT_STILL_SEEDS, frameFor, kitStillCredits } from './kitSpec.ts'
import { DEFAULT_LOCK } from './lockPresets.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { parseRenderRequest, type HeroCtx } from './run.ts'
import { heroDirOf, HeroHttpError, heroUrl, readTake } from './store.ts'

const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : -1)
const lookFrame = (l: SameLook | null): LookFrame | null => (l ? { seed: l.seed, png: l.url, takeId: l.takeId, stillId: l.stillId, source: l.source, ...(l.stale ? { stale: l.stale } : {}) } : null)

export async function previewStill(ctx: HeroCtx, body: unknown): Promise<StillPreviewResponse> {
  const req = parseRenderRequest(body)
  const take = await readTake(ctx.publicDir, req.takeId)
  const kit = takeKitWorldFor(ctx.publicDir, take)
  if (!kit) throw new HeroHttpError(400, 'the press preview is for stills drawn on a 3D set', 'bad_request')
  const role = req.role ?? 'opening'
  const frame = frameFor(role, take.frames, req.frame)
  // frames from the set as it stood before a piece moved are shown as not prepared: the press prepares them again first (stillPrep.ts)
  const clay = readClay(ctx.publicDir, take.id)
  const zdepth = clay && claySetMoved(ctx.publicDir, take, clay) ? null : clayDepthAt(ctx.publicDir, take, frame)
  const c = await composeKitPress(ctx, req, { take, kit, role, frame, zdepth: zdepth ?? '' })

  // the control image, made again only when its depth is newer (a re-prepared clay) than the last preview's
  let depthUrl: string | null = null
  if (zdepth) {
    // one file per source: a massing clay coming or going shows its own depth, not the other clay's cached image
    const dir = heroDirOf(ctx.publicDir, take.id), name = `preview-${c.control.source === 'massing' ? 'massing-' : ''}${depthControlName(frame)}`, out = path.join(dir, name)
    if (mtime(out) < mtime(c.control.file)) { await mkdir(dir, { recursive: true }); writeDepthControl(c.control.file, out) }
    depthUrl = `${heroUrl(take.id, name)}?v=${Math.round(mtime(out))}`
  }
  const sent = new Set(c.materials.map((m) => m.tag))
  const tags = [...new Set([...c.materials.map((m) => m.tag), ...refCandidates(ctx.publicDir, c.bible, c.view?.pieces ?? kit.plan.kit)])]
  const refs: StillRefChip[] = tags.flatMap((t) => materialRefs(ctx.publicDir, c.bible, [t])).map((m) => ({
    tag: m.tag, kind: m.kind, url: m.url, label: `@${m.tag} · ${m.kind === 'prop' ? 'set piece' : 'material'}`, sent: sent.has(m.tag),
  }))
  const count = req.count ?? DEFAULT_STILL_SEEDS
  const mode = req.mode ?? 'depth'
  const edit = await editPreview(ctx, take, c.castId, frame, count, mode === 'edit-projected')
  // warn-only checks on the text the owner typed or pasted (else the composed one): the text is never changed by them
  const pasted = !!req.prompt?.trim()
  const warnings: PromptWarning[] = warnPrompt(pasted ? req.prompt!.trim() : c.composed, { step: 'still', brief: briefFromBible(c.bible), take, pasted })
  // Klein takes 4 images: what the cap left out is said, never silent (decision 6); a duplicate file sent once is not a loss
  const lost = c.refsDropped.filter((x) => !/same file/.test(x)), n = lost.length
  if (n) warnings.push({ code: 'refs-dropped', message: `${n} reference image${n > 1 ? 's were' : ' was'} left out: ${lost.join('; ')}.` })
  // the face redraw's prompt exactly as a redraw of the hero at this frame would send it (faceRedraw.ts planFaceRedraw)
  const words = faceRedrawWords(c.bible, heroTagOf(c.bible, c.castId, briefOf(c.bible)), c.who.description ?? '', perfTimeAt(ctx.publicDir, take, frame))
  const faceRedrawPrompt = facePrompt(words.who, words.expression)
  const jobs = await sentJobs(ctx, c, { take, kit, role, frame, zdepth: zdepth ?? '', picks: [], now: new Date() }, mode, edit.hasPlate)
  return { sent: jobs, role, frame, prompt: c.prompt, composed: c.composed, edited: c.edited, preset: c.lock.preset ?? DEFAULT_LOCK, count, price: mode === 'edit' || mode === 'edit-projected' ? edit.price : kitStillCredits(count), mode, edit, refs, depthUrl, warnings, finishPrompt: c.card, faceRedrawPrompt,
    // the look frame the finish takes the clothes from on this request (only when asked), and the one any press could ask for
    sameLook: lookFrame(c.sameLook), lookFrame: lookFrame(c.lookFrame), nobody: c.nobody }
}

/** the press's paid jobs in order with their exact words: what kitRun.ts (depth) or kitRunEdit.ts (from the approved frame) sends */
async function sentJobs(ctx: HeroCtx, c: Awaited<ReturnType<typeof composeKitPress>>, p: Parameters<typeof composeWords>[1], mode: string, hasPlate: boolean): Promise<SentJob[]> {
  const finish: SentJob = { what: 'Then the finish (FLUX.2 Klein), on each drawing', prompt: c.card, composed: c.cardComposed, edit: 'finishPrompt' }
  if (mode !== 'edit' && mode !== 'edit-projected') {
    // (prompt-fix pass) what the app adds to the words, each with its switch, and the negative in English beside the Chinese
    const added = DRAW_ADD_KEYS.filter((k) => c.adds[k]).map((k) => ({ key: k, text: c.adds[k], on: addOn(c.drawAdds, k) }))
    return [{ what: 'The draw (Qwen-Image 2512, held to the 3D set)', prompt: c.prompt, composed: c.composed, edit: 'prompt', negative: drawNegative({ prompt: c.prompt, noPeople: c.noPeople }),
      negativeEnglish: drawNegativeEnglish({ prompt: c.prompt, noPeople: c.noPeople }), negativeSource: QWEN_NEG_SOURCE, ...(added.length && !c.edited ? { added } : {}) }, finish]
  }
  const w = await composeWords(ctx, p, c, mode === 'edit-projected').catch(() => null)
  if (!w) return [finish]
  return [
    ...(hasPlate ? [] : [{ what: 'The empty set (Qwen-Image 2512), drawn once for this angle', prompt: w.plate, negative: drawNegative({ prompt: w.plate, noPeople: true }),
      negativeEnglish: drawNegativeEnglish({ prompt: w.plate, noPeople: true }), negativeSource: QWEN_NEG_SOURCE }]),
    { what: 'The edit (Qwen-Image-Edit 2511): the empty set, the approved frame and the face', prompt: w.edit },
    finish,
  ]
}

/** "Draw from your approved frame" for this take and frame, free: the look frame it would take from, the plate if one was made, the price (`projected`: no plate at all, the edit only) */
async function editPreview(ctx: HeroCtx, take: TakeRecord, castId: string | null, frame: number, count: number, projected = false): Promise<EditPreview> {
  const look = sameLookOf(ctx.publicDir, take, castId)
  const dir = heroDirOf(ctx.publicDir, take.id), plate = await readPlate(dir, take, frame)
  const file = path.join(dir, `${plateId(frame)}.png`)
  return { available: !!look, why: look ? null : NO_LOOK_FRAME, lookUrl: look?.url ?? null, stale: look?.stale ?? null, hasPlate: projected || !!plate, plateUrl: plate ? `${plate.png}?v=${Math.round(mtime(file))}` : null,
    price: editPressCredits(count, projected || !!plate), plateCredits: projected ? 0 : PLATE_CREDITS, seedCredits: EDIT_SEED_CREDITS }
}
