/**
 * Kept user moves in the clip lookup (track D, docs/plan-kimodo-live.md 1.5 and 8 Playback): GET /__lab/motion/clips lists the
 * folders under public/lab-assets/motions; each one's clip.json is a ClipDef-shaped record written at keep time (plan 1.5). The
 * library loader (motion/library.ts) merges every folder that loads into the clip lookup under its gen:<motion-id>; a folder whose
 * clip.json or clip.bvh does not load is left out, and the move then plays as standing still, with a warning naming it
 * (motion/moveAction.ts). A made move always happens on the spot, so root is 'pinned' whatever the file says.
 */
import type { ClipDef, ClipPhase, GenClipId } from '../clips.ts'

/** one kept move as the loader lists it: its id, its folder under public/lab-assets/motions, and the user's own words (clip.json's note) */
export type UserClipRef = { id: GenClipId; folder: string; note?: string }

/** a kept move's id, as the keep route hands it back: gen:<motion-id> (lowercase words, the folder name) */
export const GEN_ID_RE = /^gen:[a-z0-9][a-z0-9-]{0,63}$/

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** one entry of GET /__lab/motion/clips as a ref, or null when it is not shaped like one */
export function refOf(entry: unknown): UserClipRef | null {
  const e = entry as { id?: unknown; folder?: unknown; note?: unknown } | null
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !GEN_ID_RE.test(e.id) || typeof e.folder !== 'string' || !e.folder) return null
  return { id: e.id as GenClipId, folder: e.folder, ...(typeof e.note === 'string' ? { note: e.note } : {}) }
}

/** where a kept move's ClipDef-shaped record is read from (the folder is served from public/) */
export const userClipJsonUrl = (folder: string): string => `/lab-assets/motions/${folder}/clip.json`

/**
 * clip.json as the library's ClipDef: url, source, note, in/out, hold, prop and phases ride through; in/out must be a playable
 * window and the url must be the move's own folder. null when the record cannot play.
 */
export function userClipDef(folder: string, json: unknown): ClipDef | null {
  const j = json as Partial<ClipDef> | null
  if (!j || typeof j !== 'object' || typeof j.url !== 'string' || !j.url.startsWith(`/lab-assets/motions/${folder}/`)) return null
  if (!num(j.in) || !num(j.out) || j.in < 0 || j.out <= j.in) return null
  const src = j.source as { generated?: unknown } | undefined
  const def: ClipDef = {
    url: j.url,
    source: { generated: typeof src?.generated === 'string' ? src.generated : `kimodo:${folder}` },
    note: typeof j.note === 'string' ? j.note : '',
    root: 'pinned',
    in: j.in,
    out: j.out,
  }
  if (Array.isArray(j.hold) && j.hold.length === 2 && num(j.hold[0]) && num(j.hold[1]) && j.hold[0] >= def.in && j.hold[1] > j.hold[0] && j.hold[1] <= def.out) {
    def.hold = [j.hold[0], j.hold[1]]
  }
  const p = j.prop as { kind?: unknown; grab?: unknown; release?: unknown } | undefined
  if (p && typeof p === 'object' && (num(p.grab) || num(p.release))) {
    def.prop = { ...(typeof p.kind === 'string' ? { kind: p.kind } : {}), ...(num(p.grab) ? { grab: p.grab } : {}), ...(num(p.release) ? { release: p.release } : {}) }
  }
  if (Array.isArray(j.phases)) {
    const phases = j.phases.filter((ph): ph is ClipPhase => !!ph && typeof ph === 'object' && num((ph as ClipPhase).from) && typeof (ph as ClipPhase).words === 'string')
    if (phases.length) def.phases = phases
  }
  return def
}
