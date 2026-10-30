/**
 * The words a kit piece and the performer's motion are named by when nothing better is written (prompt wave, 2026-10-25: the aged
 * and clay-shape tables went; a piece is named by its brief label, its board tile, else its plain noun). Fire kinds are kept apart:
 * their words are the only fire words a kit prompt may carry, and only when the camera sees one. A generated set piece (KitItem.glb)
 * keeps a plain-noun kind that is no KIT key.
 */

/** kinds that ARE fire (a white flame shape in the clay); the prompt names flames only when the plan has one of these */
export const FIRE_KINDS: Record<string, string> = {
  fire: 'the bright white cones are orange flames where image 1 is white',
  campfireRing: 'the stone ring with crossed logs is a campfire, orange flames where image 1 is white',
}

/** ground relief (the horizon bank, boulders): shapes the 3D ground, never named in a prompt (the planner gives them no label) */
export const RELIEF_KINDS: ReadonlySet<string> = new Set(['mound', 'rock'])

/**
 * set dressing the planner may scatter on its own (debris fix, 2026-10-25: an unasked "debris" pile was named and drawn as junk):
 * named in a picture prompt only when the owner's words give it (pieceNames.ts isNamed). Every other kit kind is a landmark and is
 * named; a test holds that each KIT kind is one of relief, filler or landmark, so a new kit kind must be placed.
 */
export const FILLER_KINDS: ReadonlySet<string> = new Set(['debris', 'barrels', 'crates', 'spear', 'weaponRack'])

/** the kit kinds that matter to a picture and are always named (by label, board tile, else plain noun) */
export const LANDMARK_KINDS: ReadonlySet<string> = new Set(['tree', 'deadTree', 'treeline', 'haystack', 'fire', 'campfireRing', 'tent', 'hut',
  'barricade', 'wagon', 'fence', 'palisade', 'cart', 'banner'])

/** a kind as a plain noun: a generated piece's kind need not be a KIT key ('steam_train', 'leatherTrunk' -> 'steam train', 'leather trunk') */
export const plainNoun = (kind: string): string => kind.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase()

/** what the performer is doing at the start, in a word: from the first action placed at the path's start, else the gait */
export function actionWord(perf: { gait?: 'walk' | 'run'; actions?: { kind: string; at: number }[]; path?: [number, number][] }): string {
  const first = (perf.actions ?? []).find((a) => a.at <= 0.05)
  if (first?.kind === 'kneel') return 'kneeling'
  if (first && ['stop', 'idle', 'look', 'turn', 'lift'].includes(first.kind)) return 'standing'
  const p = perf.path ?? []
  const len = p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0)
  if (p.length > 1 && len < 0.5) return 'standing'
  return perf.gait === 'run' ? 'running' : 'walking'
}
