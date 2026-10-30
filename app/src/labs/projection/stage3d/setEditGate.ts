// Every set edit on the page passes here before it is sent (PLAN-PER-TAKE-SET.md, Design: Page; Risk 5, edits against the wrong
// plan). The set editors always edit the scene's set (what the next take starts from), never a locked take's:
// - a take on show whose own set is not the scene's: the viewport shows the take's set and is read-only for pieces, the mark,
//   the sky, the ground and the light; an edit is refused here (nothing is sent) and the banner offers "Edit the scene's set";
// - a take on show whose set is the scene's: the edit goes through, and the first one sets that take aside (takeShow.ts
//   setTakeAside, the one set-aside for the walk and the set), so the stage shows the scene's set from then on.
// The writers that call it: setPlaceApi.ts (pieces, mark), usePieceDrag.ts (move, words, swap), kitApi.ts (reset, light, ground, sky).
import { ownSetOnShow, sceneSetOf, takeOnShow, takeOnShowFor, type TakeOnShow } from './takeOnShow'

export const SET_READ_ONLY = 'A locked take is on show with its own set, so the set cannot be changed here. Press Edit the scene\'s set first; changes are for the next take.'

export class SetReadOnlyError extends Error {
  constructor() { super(SET_READ_ONLY) }
}

let aside: ((worldId: string) => boolean) | null = null
/** who sets the take on show aside (takeShow.ts registers setTakeAside; labs code never imports the studio's take state) */
export function onSceneSetEdit(f: (worldId: string) => boolean): void { aside = f }

/** the take on show on this world whose own set is not the scene's (the set is read-only), or null; an unread scene counts as
 *  another set */
export const readOnlySet = (worldId: string | null | undefined): TakeOnShow | null =>
  worldId ? ownSetOnShow(sceneSetOf(worldId), takeOnShow(), worldId) : null

/** Before a set edit is sent: throws SetReadOnlyError while the take on show has its own other set; sets aside a take on show
 *  whose set is the scene's (so the edit is seen on the scene's set). */
export function gateSetEdit(worldId: string): void {
  if (readOnlySet(worldId)) throw new SetReadOnlyError()
  if (takeOnShowFor(takeOnShow(), worldId)?.plan) aside?.(worldId)
}
