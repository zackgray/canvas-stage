/**
 * A kit still with no one cast (no-person shots, owner 2026-10-29: a tyre close-up). When the world's performance names no cast card
 * and the 3D performer is NOT in the still's frame, the draw goes with no person at all: no face reference, no card line, no person
 * words (the draw prompt already says nobody when the figures hold no hero). When the performer IS in the frame (or the frame's
 * figures are not known) the press is refused as before (409 no_cast, free), with the way out said: cast them, or frame the shot
 * without them. A cast card named but missing from the project is never this case (face.ts refuses that). Pure but for reading the clay.
 */
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import type { KitWorld } from '../stage3d/types.ts'
import { NO_KIT_CAST } from './castCard.ts'
import { worldWords, type HeroWho } from './face.ts'
import { figuresAt, type Figure } from './figures.ts'
import { cameraAt, clayDirOf, startOf } from './kitInputs.ts'
import { HeroHttpError } from './store.ts'

/** the refusal when nobody plays the person and they are in the frame: the cast line, then the no-person way out */
export const NO_KIT_CAST_IN_VIEW = `${NO_KIT_CAST} To draw this frame with no person in it, frame the shot without them.`

/** the performer is not in the frame: the figures are known and none is the hero */
export const heroOutOfFrame = (figures: Figure[] | null): boolean => !!figures && !figures.some((f) => f.tag === 'hero')

/** the figures of a kit still at `frame` (the same reading the draw prompt makes) */
export const kitFigures = (publicDir: string, take: TakeRecord, kit: KitWorld, frame: number): Figure[] | null =>
  figuresAt(clayDirOf(publicDir, take.id), frame, startOf(kit), cameraAt(publicDir, take, frame))

/** who plays no one: no face file, no name, no words; the world's words only */
export const nobodyWho = (publicDir: string, take: Pick<TakeRecord, 'worldId'>): HeroWho =>
  ({ sid: 'nobody', name: '', description: '', faceFile: '', lighting: undefined, world: worldWords(publicDir, take.worldId) })

/** a kit still with no cast card named: nobody when the performer is out of the frame, else the free refusal */
export function kitNobody(publicDir: string, take: TakeRecord, kit: KitWorld, frame: number): HeroWho {
  if (!heroOutOfFrame(kitFigures(publicDir, take, kit, frame))) throw new HeroHttpError(409, NO_KIT_CAST_IN_VIEW, 'no_cast')
  return nobodyWho(publicDir, take)
}
