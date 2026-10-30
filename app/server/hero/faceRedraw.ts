/**
 * "Redraw face from card" (recipe step 6, E140/E141): one staged person's face on a still redrawn by Klein from their OWN cast card,
 * pasted back inside a feathered face oval only (E141: a face-only oval under any hat kept the head's size and the cap; the
 * whole-head mask grew it). Plans the job and refuses for free, in plain words, when there is no face to redraw or no card to
 * draw it from; redrawRun.ts spends. (Prompt wave, 2026-10-25) the face is described by the brief element's `face` line when it has
 * one, and the expression is that person's beat cue at the still's time, else nothing: never a default "calm".
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { readBibleFile } from '../bible/read.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { castFace } from './castCard.ts'
import { faceOval, ovalMask, padBox } from './idMask.ts'
import { entityMask, idFrameAt, stagedOf } from './judge.ts'
import { perfTimeAt } from './kitInputs.ts'
import type { KitStill } from './kitSpec.ts'
import { FACE_CROP } from './redrawGraph.ts'
import type { RedrawPlan } from './redrawRun.ts'
import { beatAt, briefElement, briefOf, heroTagOf } from './stillBrief.ts'
import { HeroHttpError } from './store.ts'

const trim = (s: string | undefined) => (s ?? '').trim().replace(/[.\s]+$/, '')
/** the card's words for the face, short: its first sentence, at most 240 characters (when the brief has no face line) */
const cardFace = (description: string) => trim(description.split(/(?<=[.!?])\s+/)[0]).slice(0, 240)

/**
 * The face words and the expression for one person (`tag`: their Bible tag): the brief element's `face` line, else the card's first
 * sentence; the expression is their beat's `visible` cue at performance time `t`, else ''.
 */
export function faceRedrawWords(bible: BibleRecord | null, tag: string | null, description: string, t = 0): { who: string; expression: string } {
  const brief = briefOf(bible)
  return { who: trim(briefElement(brief, tag)?.face) || cardFace(description), expression: trim(beatAt(brief, tag, t)?.visible) }
}

export const facePrompt = (who: string, expression = '') => `A real photograph. In image 1, redraw only the face of the person in the middle as the face of the person in image 2${who ? `: ${who}` : ''}. ` +
  'Keep their hair, any hat or hood, and the head\'s exact size, position, tilt and turn as in image 1, and keep the light, the shadows and the colours of image 1. ' +
  `Natural skin, clear eyes${expression ? `, ${expression}` : ''}.`

export async function planFaceRedraw(publicDir: string, take: TakeRecord, still: KitStill, entity: string, size: { width: number; height: number }): Promise<Omit<RedrawPlan, 'take' | 'still'>> {
  const kit = takeKitWorldFor(publicDir, take)
  if (!kit) throw new HeroHttpError(409, 'Face redraws are for stills drawn on a 3D set. Nothing was billed.', 'not_kit')
  const bible = readBibleFile(publicDir, take.worldId)
  const who = stagedOf(kit, bible).find((s) => s.entity === entity)
  if (!who) throw new HeroHttpError(400, `${entity} is not a person staged in this take`, 'bad_request')
  const card = await castFace(publicDir, who.cardId ?? undefined)
  if (!card) throw new HeroHttpError(409, `${who.fallback} has no cast card with a face image to redraw from. Pick who plays them in The subject's panel on the Stage. Nothing was billed.`, 'no_cast')
  const idf = idFrameAt(publicDir, take, still.frame ?? 0)
  const m = idf ? entityMask(idf, entity, size.width, size.height) : null
  const face = m ? faceOval(m) : null
  if (!face) throw new HeroHttpError(409, `The 3D set does not show ${card.name}'s head in this frame (no figure map here, or the head is cut off or too small), so there is no face to redraw. Nothing was billed.`, 'no_face')
  const tag = entity === 'hero' ? heroTagOf(bible, kit.perf.castId, briefOf(bible)) : who.fallback.replace(/^@/, '')
  const words = faceRedrawWords(bible, tag, card.description, perfTimeAt(publicDir, take, still.frame ?? 0))
  return {
    pass: 'face', subject: card.cardId, box: padBox({ x0: face.x, y0: face.y, x1: face.x + face.w - 1, y1: face.y + face.h - 1 }, size.width, size.height, 0.6, 96),
    mask: ovalMask(size.width, size.height, face), refFile: card.faceFile, prompt: facePrompt(words.who, words.expression), crop: FACE_CROP,
  }
}
