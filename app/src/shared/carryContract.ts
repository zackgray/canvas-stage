/**
 * Carry the approved opening still across a re-lock (recipe wave 3, troubleshooting review item 7). A blocking or pose fix gives the
 * take a new id, and every still of the old id reads stale; when frame 0 shows exactly what it showed before, the approved opening
 * still is copied into the new take instead of being paid for again. shotContract.ts is at its size limit, so the fields merge into
 * its interfaces from here (as renderFinishContract does); every one is optional, so takes and stills written before it still read.
 * Pure.
 */
import type { TakeRecord } from './shotContract.ts'

/** what the lock response says was carried: the still (same id, now in the new take's hero folder) and the take it came from */
export interface CarriedStill { stillId: string; from: string }

declare module './shotContract.ts' {
  interface TakeRecord {
    /** what frame 0 shows, hashed in the page at lock (src/studio/shoot/frame0Key.ts): the frame-0 camera, focal and aspect, every
     *  figure's pose there (hero, extras, creatures) and the set plan. Absent = not known (a pack world, an older page): never carried. */
    frame0Key?: string
    /** (tidy wave) the kit set plan alone at lock, hashed in the page (src/studio/shoot/setKey.ts): Shoot says "changed since lock"
     *  when a piece is built or moved after it. Absent = no kit set or an older page: no set check on Shoot (Render still checks). */
    setKey?: string
  }
  interface HeroStill {
    /** the take this approved opening still was carried from on a re-lock with an unchanged frame 0 (absent = drawn on this take) */
    carriedFrom?: string
  }
  interface TakeLockResponse {
    /** set when a new take inherited the previous take's approved opening still */
    carried?: CarriedStill | null
  }
}

/** a frame-0 key on the wire: FNV-1a 32, hex */
export const FRAME0_KEY_RE = /^[0-9a-f]{8}$/

type CarryFields = Pick<TakeRecord, 'id' | 'worldId' | 'focal' | 'viewAspect' | 'startKey' | 'bibleVersion' | 'frame0Key'>

/**
 * Why `prev`'s approved opening still cannot stand for `next`'s frame 0, or null when it can. The first reason wins. Never sure
 * enough without both keys; the world, start, focal, aspect and Bible are checked apart from the key so an unforeseen key
 * collision still cannot carry a still across them. The server's carry (server/hero/carry.ts) and Shoot's re-lock line share it.
 */
export function carryRefusal(prev: CarryFields, next: CarryFields): string | null {
  if (prev.id === next.id) return 'same take'
  if (!prev.frame0Key || !next.frame0Key) return 'no frame-0 key'
  if (prev.worldId !== next.worldId) return 'another world'
  if (prev.focal !== next.focal || prev.viewAspect !== next.viewAspect) return 'another focal or aspect'
  if (prev.startKey !== next.startKey) return 'another start (camera or performance frame)'
  if ((prev.bibleVersion ?? null) !== (next.bibleVersion ?? null)) return 'another scene sheet version'
  if (prev.frame0Key !== next.frame0Key) return 'frame 0 changed'
  return null
}
