// A prop drawn or uploaded on the Stage becomes a real piece of the scene when its picked candidate is placed (Fable F2; owner
// 2026-10-28): (1) an approved prop tile in the Stage's one copy of the scene design (StageScene.tsx), with the candidate as its
// look — the tiles the pieces route builds from (server/pieces/store.ts tiles) — under a tag of its own in this scene, and the
// design's own save of it landed; (2) a labelled stand-in at the marked spot carrying `pieceTag: 'prop:<tag>'`, so the built mesh
// takes its place and its label (server/pieces/place.ts placePiece) and the rail and the piece panel know it as that prop; (3) its
// Bible element, so its picture and words are the prop's like a Board prop's; (4) its one automatic 3D build (pieceAutoBuild.ts).
// Each step waits for the one before; a refusal stops there, takes the tile back out (a retry starts clean) and is thrown in words.
// The design is the only writer of the draft on the Stage, so a drawer edit or a person pick in the same moment never refuses it.
import type { BibleApi } from '../scene/bibleApi'
import { isUnsynced } from '../scene/design/state'
import { mkPiece, uniqTag, type Piece } from '../scene/design/model'
import type { KitItem } from '../../stage3d/contract'
import { STANDIN_KIND } from './railModel'
import type { StageScene } from './scene/StageScene'

/** the words a photo uploaded on the Stage carries (shown as its prompt; never sent as the prop's look line) */
export const UPLOAD_DESC = 'Uploaded as is.'

/** what a placement needs of the scene design (stagePropDesign makes it from the Stage's one copy; tests fake it) */
export interface StagePropDesign {
  /** the design's tiles now (a new tag never shadows one) */
  pieces: () => readonly Pick<Piece, 'tag'>[]
  /** the tile added to the design (no tag appended to the words) */
  add: (tile: Piece) => void
  /** a placement that was refused takes its tile back out */
  drop: (id: string) => void
  /** resolves once the design's save holding the tile has landed on the server; throws in words when it was refused */
  saved: (id: string) => Promise<void>
}

export interface StagePropDeps {
  design: StagePropDesign
  bible: Pick<BibleApi, 'putElement'>
  /** the piece add route (useSetPlace.add): true once the stand-in is in the plan */
  place: (kind: string, at: [number, number], label: string, pieceTag: string) => Promise<boolean>
  /** the one automatic build (startAutoBuild) */
  build: (world: string, tag: string) => void
}

export interface StageProp {
  world: { id: string; plan: { kit: Pick<KitItem, 'pieceTag'>[] } }
  /** the label typed on the draw screen (or the candidate's name) */
  name: string
  /** the picked candidate's picture */
  look: string
  /** the words it was drawn from */
  desc: string
  at: [number, number]
  /** the world's Bible element tags (a new tag never shadows one) */
  elementTags: readonly string[]
}

/** the prop's tag: its name made a tag, unique against the design's tiles, the set's props and the Bible's elements */
export function stagePropTag(name: string, pieces: readonly Pick<Piece, 'tag'>[], kit: readonly Pick<KitItem, 'pieceTag'>[], elementTags: readonly string[]): string {
  const taken = [
    ...pieces.map((p) => p.tag),
    ...kit.flatMap((k) => (k.pieceTag?.startsWith('prop:') ? [k.pieceTag.slice(5)] : [])),
    ...elementTags,
  ]
  return uniqTag(name, taken)
}

/** place the picked candidate as the scene's new prop and start its build; resolves to its tag */
export async function placeStageProp(d: StagePropDeps, o: StageProp): Promise<string> {
  const name = o.name.trim() || 'prop'
  const line = o.desc.trim() && o.desc !== UPLOAD_DESC ? o.desc.trim() : name
  const tag = stagePropTag(name, d.design.pieces(), o.world.plan.kit, o.elementTags)
  const tile = mkPiece(tag, name, 'prop', { state: 'approved', looks: [o.look], look: 0, line, onBoard: true })
  d.design.add(tile)
  try {
    // the pieces route builds from the saved draft's tiles, so the stand-in (and its build) waits for the tile to be there
    await d.design.saved(tile.id)
    if (!(await d.place(STANDIN_KIND, o.at, name, `prop:${tag}`))) throw new Error('the set did not take the stand-in, try again')
  } catch (e) { d.design.drop(tile.id); throw e }
  // the picture and words as the prop's own (the rail's pictures, an @tag in a prompt); the build does not need it, so a refusal
  // here leaves the prop placed and building
  await d.bible.putElement({ worldId: o.world.id, element: { tag, kind: 'prop', refs: [o.look], line } }).catch(() => {})
  d.build(o.world.id, tag)
  return tag
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * The placement's design: the Stage's one copy (read through `live`, the newest the provider published). Its save is landed when
 * the tile is in it and the design no longer marks the scene unsynced (useDesign clears the mark only when a write that held every
 * change so far came back); it is refused when the design says so (another tab's write, or a failed save). The mark clears in the
 * same turn a refusal is caught, so a landing counts only when a second look still finds no refusal.
 */
export function stagePropDesign(live: () => StageScene | null, o: { poll?: number; wait?: number } = {}): StagePropDesign {
  const poll = o.poll ?? 100, wait = o.wait ?? 20_000
  const design = () => {
    const v = live()
    if (!v) throw new Error('the Stage has no scene open, try again')
    return v
  }
  return {
    pieces: () => design().x.s.ref.current.pieces,
    add: (tile) => design().x.s.addPiece(tile, false),
    drop: (id) => live()?.x.s.removePiece(id),
    saved: async (id) => {
      const before = live()?.x.s.saveError ?? null
      const until = Date.now() + wait
      let seen = false
      for (;;) {
        await pause(poll)
        const v = design(), s = v.x.s
        // the design's own words: another tab's write is the only refusal that says to reload
        if (s.stale) throw new Error(lower(s.saveError ?? 'this scene was changed in another tab or window. Reload to see it'))
        if (s.saveError && s.saveError !== before) throw new Error(`${lower(s.saveError)}, try again`)
        const landed = !isUnsynced(v.scene) && s.ref.current.pieces.some((p) => p.id === id)
        if (landed && seen) return
        seen = landed
        if (Date.now() > until) throw new Error('the scene was not saved in time, try again')
      }
    },
  }
}
