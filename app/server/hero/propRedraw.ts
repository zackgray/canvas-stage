/**
 * "Redraw from board tile" (recipe step 4, E139 crop, E140 fix): one set piece in a still redrawn by Klein with its approved board
 * tile as the reference, pasted back INSIDE THE PIECE'S OWN MASK ONLY: its colour on the clay's ID pass ('prop:<tag>') at the
 * still's frame (E140's ghosting came from pasting the whole crop). Plans the job and refuses for free, in plain words; redrawRun.ts
 * spends.
 */
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { readBibleFile } from '../bible/read.ts'
import { boundsOf, padBox, sharedColour } from './idMask.ts'
import { entityMask, idFrameAt } from './judge.ts'
import { bibleFile } from './kitInputs.ts'
import type { KitStill } from './kitSpec.ts'
import { elementOf } from './kitStillPrompt.ts'
import { PROP_CROP } from './redrawGraph.ts'
import type { RedrawPlan } from './redrawRun.ts'
import { briefElement, briefOf, surfaceOf } from './stillBrief.ts'
import { HeroHttpError } from './store.ts'

export const propPrompt = (noun: string, line: string) => `A real photograph. In image 1, redraw the ${noun} as the ${noun} in image 2${line ? `: ${line}` : ''}. ` +
  `Keep the ${noun}'s exact size, outline, position and angle in image 1, and the light, the shadows and the colours of image 1. Real photographic detail.`

export function planPropRedraw(publicDir: string, take: TakeRecord, still: KitStill, tag: string, size: { width: number; height: number }): Omit<RedrawPlan, 'take' | 'still'> {
  const bible = readBibleFile(publicDir, take.worldId)
  const el = elementOf(bible, { kind: tag, pieceTag: `prop:${tag}` })
  const tile = el?.refs.map((r) => bibleFile(publicDir, r)).find((f): f is string => !!f)
  if (!el || !tile) throw new HeroHttpError(409, `@${tag} has no board tile on disk to redraw it from. Nothing was billed.`, 'no_tile')
  const idf = idFrameAt(publicDir, take, still.frame ?? 0)
  const entity = `prop:${tag}`
  if (!idf || !idf.colors[entity]) throw new HeroHttpError(409, `The 3D set has no piece map for @${tag} at this frame, so its outline is not known. Nothing was billed.`, 'no_mask')
  if (sharedColour(idf.colors, entity)) throw new HeroHttpError(409, `@${tag} shares its colour on the piece map with another piece (an older export), so it cannot be cut out alone. Prepare the frames again under the locked take (free), then redraw. Nothing was billed.`, 'shared_mask')
  const m = entityMask(idf, entity, size.width, size.height)!
  const b = boundsOf(m)
  if (!b) throw new HeroHttpError(409, `@${tag} is not in view at this frame. Nothing was billed.`, 'no_mask')
  // (prompt wave) the brief's name and materials for the piece when it has them, else the tag and the board line
  const be = briefElement(briefOf(bible), el.tag)
  const noun = be?.name?.trim().replace(/^(a|an|the) /i, '') || tag.replace(/[_-]+/g, ' ')
  const line = surfaceOf(be) || el.line
  return { pass: 'prop', subject: el.tag, box: padBox(b, size.width, size.height, 0.1, 64), mask: m, refFile: tile, prompt: propPrompt(noun, line.replace(/[.\s]+$/, '')), crop: PROP_CROP }
}
