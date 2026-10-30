/**
 * Everything a kit still reads before any spend, all free and refused in plain words: the clay's metric depth at the still's
 * frame (a kit clay exported with depth, for this start of the take), the camera at that frame (clay/cameras.json, else the
 * take's own samples), the scene Bible (bible.json by the Wave 0.5 disk layout; null = none yet), its approved master and the
 * material references asked for (board prop tiles or materials), and what the still is colour-matched to. Read-only.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { isTag, type BibleRecord } from '../../src/shared/bibleContract.ts'
import { shotPaths, type ClayCamera, type ClayExport, type HeroStill, type KeyframeRole, type TakeRecord } from '../../src/shared/shotContract.ts'
import { isLockPreset, type LockPresetId } from '../../src/shared/stillPressContract.ts'
import type { KitItem } from '../../src/stage3d/contract.ts'
import { clayStampStale } from '../clay/stamps.ts'
import { claySetMoved } from '../l2r/inputs.ts'
import { modelDepthAt, type ClaySource } from '../pieces/modelClay.ts'
import type { KitWorld } from '../stage3d/types.ts'
import { assetFile } from './face.ts'
import { parseDrawMode } from './editSpec.ts'
import { isRole, MAX_MATERIAL_REFS, type KitRenderFields } from './kitSpec.ts'
import { elementOf } from './kitStillPrompt.ts'
import { HeroHttpError } from './store.ts'
import { parseDrawAdds } from './drawAdds.ts'

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }
const pad = (i: number) => String(i).padStart(3, '0')

export const clayDirOf = (publicDir: string, takeId: string) => path.join(publicDir, shotPaths(takeId).clay)

/** the take's clay.json as stored, or null */
export const readClay = (publicDir: string, takeId: string): ClayExport | null => readJson<ClayExport>(path.join(clayDirOf(publicDir, takeId), 'clay.json'))

/** The clay's zdepth file at `frame` when the take's kit clay is done, for this start and the take's walk (clay/stamps.ts), with
 *  depth, and not stamped with another set than the take's; null otherwise (not prepared: the press prepares the frames first). */
export function clayDepthAt(publicDir: string, take: Pick<TakeRecord, 'id' | 'startKey' | 'frames' | 'packId' | 'setKey'>, frame: number): string | null {
  const dir = clayDirOf(publicDir, take.id)
  const clay = readJson<ClayExport>(path.join(dir, 'clay.json'))
  if (!clay || clay.status !== 'done' || clay.startKey !== take.startKey || clayStampStale(take, clay) || !clay.depth || frame < 0 || frame >= take.frames) return null
  const f = path.join(dir, `zdepth_${pad(frame)}.png`)
  return existsSync(f) ? f : null
}

/**
 * Refuses a paid still press, free (409 clay_set_moved), when the take's set changed after its clay was made: the Render rule
 * (l2r/inputs claySetMoved), so a pre-setKey take or a second tab whose page still reads Locked cannot draw on the old set's
 * depth or ID pass and find out at Render. The page's set key guards the button; this guards the spend.
 */
export function refuseSetMoved(publicDir: string, take: TakeRecord): void {
  const clay = readClay(publicDir, take.id)
  if (clay && claySetMoved(publicDir, take, clay)) {
    throw new HeroHttpError(409, 'The set has changed since these frames were prepared (a piece was built or moved): a still now would show the set as it was. Press Draw the first frame again: it prepares the frames from the set as it stands first (free, the same take), then draws. Nothing was billed.', 'clay_set_moved')
  }
}

/**
 * Which depth image drives the still's control (recipe step 3, E139 "two clays"): the massing clay's zdepth at the frame when the
 * take's massing clay is current (server/pieces/modelClay.ts), else the precise clay's. The press and the preview both call this and
 * the press records `source` on the still (controlDepth). The layout check, the judge, the ID pass keep the precise clay.
 */
export const controlDepthFor = (publicDir: string, take: Pick<TakeRecord, 'id' | 'startKey' | 'frames'>, frame: number, precise: string): { file: string; source: ClaySource } =>
  modelDepthAt(publicDir, take, frame, precise)

/** the camera at a clay frame: the clay's cameras.json, else the take's sample nearest the frame's time */
export function cameraAt(publicDir: string, take: TakeRecord, frame: number): { position: number[]; quaternion: number[]; focal: number } | null {
  const cams = readJson<{ frames?: ClayCamera[] }>(path.join(clayDirOf(publicDir, take.id), 'cameras.json'))?.frames
  const c = cams?.find((x) => x.i === frame)
  if (c) return { position: c.position, quaternion: c.quaternion, focal: c.focal }
  const t = frame / take.fps
  const s = [...take.samples].sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0]
  return s ? { position: s.position, quaternion: s.quaternion, focal: frame === 0 ? take.focal : s.focal ?? take.focal } : null
}

/** the performance time (s) a clay frame shows: the clay's own camera time (warpPlan: world time of pack frame perfStart + i), else
 *  that same clock from the take record */
export function perfTimeAt(publicDir: string, take: Pick<TakeRecord, 'id' | 'fps' | 'perfStart'>, frame: number): number {
  const c = readJson<{ frames?: ClayCamera[] }>(path.join(clayDirOf(publicDir, take.id), 'cameras.json'))?.frames?.find((x) => x.i === frame)
  return c && Number.isFinite(c.t) ? c.t : (take.perfStart + frame) / take.fps
}

/** a Bible image's public path as a file on disk (absolute /lab-assets/… or relative lab-assets/…), or null */
export function bibleFile(publicDir: string, url: string | undefined | null): string | null {
  if (!url) return null
  return assetFile(publicDir, url.startsWith('/') ? url : `/${url}`)
}

export interface MaterialRef { tag: string; kind: 'prop' | 'material'; file: string; line: string; /** the tile's public URL */ url: string }

/** a Bible element whose board tile may go to the finish as a material reference (recipe step 4, E139 M3: a prop tile or a material) */
const isRefKind = (k: string): k is MaterialRef['kind'] => k === 'material' || k === 'prop'

/** The Bible's material and prop (board tile) elements by tag, each its first reference image. Unknown tags, other kinds, too many: 400. */
export function materialRefs(publicDir: string, bible: BibleRecord | null, tags: string[] | undefined): MaterialRef[] {
  if (!tags?.length) return []
  if (tags.length > MAX_MATERIAL_REFS) throw new HeroHttpError(400, `at most ${MAX_MATERIAL_REFS} material references`, 'bad_request')
  return tags.map((tag) => {
    const el = bible?.elements.find((e) => e.tag === tag)
    if (!el || !isRefKind(el.kind)) throw new HeroHttpError(400, `@${tag} is not a prop or material board tile in this scene's sheet`, 'bad_request')
    const url = el.refs.find((r) => !!bibleFile(publicDir, r))
    if (!url) throw new HeroHttpError(409, `@${tag} has no reference image on disk`, 'no_material')
    return { tag, kind: el.kind as MaterialRef['kind'], file: bibleFile(publicDir, url)!, line: el.line, url: url.startsWith('/') ? url : `/${url}` }
  })
}

/** every board tile that could go as a reference (an image on disk): the visible pieces' prop tiles first, in plan order, then materials */
export function refCandidates(publicDir: string, bible: BibleRecord | null, visible: Pick<KitItem, 'kind' | 'pieceTag'>[]): string[] {
  const onDisk = (tag: string) => !!bible?.elements.find((e) => e.tag === tag)?.refs.some((r) => !!bibleFile(publicDir, r))
  const props = visible.map((k) => elementOf(bible, k)?.tag).filter((t): t is string => !!t)
  const mats = (bible?.elements ?? []).filter((e) => e.kind === 'material').map((e) => e.tag)
  return [...new Set([...props, ...mats])].filter(onDisk)
}

/** a press that names no references sends these: up to MAX_MATERIAL_REFS of refCandidates (E139 M3: the train tile + the materials tile) */
export const defaultRefTags = (publicDir: string, bible: BibleRecord | null, visible: Pick<KitItem, 'kind' | 'pieceTag'>[]): string[] =>
  refCandidates(publicDir, bible, visible).slice(0, MAX_MATERIAL_REFS)

/** What a still is colour-matched to: the opening to the Bible's master; a mid or end to the take's approved opening, else the master. */
export function gradeTarget(publicDir: string, role: KeyframeRole, bible: BibleRecord | null, stills: HeroStill[], heroFile: (s: HeroStill) => string): { file: string; url: string } | null {
  if (role !== 'opening') {
    const open = stills.find((s) => s.approved && (s.role ?? 'opening') === 'opening')
    if (open && existsSync(heroFile(open))) return { file: heroFile(open), url: open.png }
  }
  const m = bibleFile(publicDir, bible?.master?.png)
  return m && bible?.master ? { file: m, url: bible.master.png } : null
}

/** POST /__lab/hero's kit fields, checked (all optional): role, frame, reference tags, the lock preset, a raw strength (old callers), the draw mode, same look */
/** the edited finish words' cap (the draw's own MAX_PROMPT) */
const MAX_FINISH_PROMPT = 4000

export function parseKitFields(b: Record<string, unknown>): KitRenderFields {
  const bad = (m: string) => new HeroHttpError(400, m, 'bad_request')
  if (b.role !== undefined && !isRole(b.role)) throw bad('role must be opening, mid or end')
  if (b.frame !== undefined && !(Number.isInteger(b.frame) && (b.frame as number) >= 0 && (b.frame as number) % 8 === 0)) throw bad('frame must be a clay frame index on the 8-frame grid (0, 8, 16, …): Render can only send a keyframe there')
  if (b.materials !== undefined && !(Array.isArray(b.materials) && b.materials.every(isTag))) throw bad('materials must be tags from the scene sheet')
  if (b.depthStrength !== undefined && !(typeof b.depthStrength === 'number' && b.depthStrength >= 0.5 && b.depthStrength <= 1)) throw bad('depthStrength must be 0.5 to 1')
  if (b.preset !== undefined && !isLockPreset(b.preset)) throw bad('preset must be photographic or tight')
  if (b.sameLook !== undefined && typeof b.sameLook !== 'boolean') throw bad('sameLook must be true or false')
  if (b.finishPrompt !== undefined && (typeof b.finishPrompt !== 'string' || b.finishPrompt.length > MAX_FINISH_PROMPT)) throw bad(`finishPrompt must be text of at most ${MAX_FINISH_PROMPT} characters`)
  const adds = parseDrawAdds(b.drawAdds)
  if (adds === 'bad') throw bad('drawAdds must map castRest / frameTail to true or false')
  return { role: b.role as KeyframeRole | undefined, frame: b.frame as number | undefined, materials: b.materials as string[] | undefined, depthStrength: b.depthStrength as number | undefined,
    ...(b.preset !== undefined ? { preset: b.preset as LockPresetId } : {}), ...(b.mode !== undefined ? { mode: parseDrawMode(b.mode) } : {}),
    ...(b.sameLook === true ? { sameLook: true } : {}), ...(typeof b.finishPrompt === 'string' && b.finishPrompt.trim() ? { finishPrompt: b.finishPrompt } : {}),
    ...(adds ? { drawAdds: adds } : {}) }
}

/** the kit world's start point for the framing words (frame 0 only: a later frame's figures come from its ID pass, figures.ts) */
export const startOf = (kit: KitWorld): [number, number] | undefined => kit.perf.path[0]
