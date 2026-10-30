/**
 * Kit worlds on disk (Stage3D). A kit world is an ordinary location folder, so every `loc-` check, the Stage's world list and
 * Shoot's source list take it as they are:
 *   public/lab-assets/locations/<loc-stamp>/
 *     meta.json         kind 'location', world.kind 'kit', the master lens (known) and horizon, the description
 *     plan.json         the ScenePlan (validated by src/stage3d/plan.ts parsePlan)
 *     plan.built.json   the plan as Build the set placed it, for Reset the set (builtPlan.ts)
 *     performance.json  the PerformancePlan the 3D performer plays (default: standing on the mark, a 6 s shot, no walk)
 *     still.png         the master view, rendered in the browser at the master camera and uploaded (1920 x 1088)
 *   locations/manifest.json  gets the world as a shot (kind 'kit', no depths) once its still is on disk: written last.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parsePlan } from '../../src/stage3d/plan.ts'
import { markOf } from '../../src/stage3d/mark.ts'
import { standPath } from '../../src/stage3d/motion/standPlan.ts'
import type { PerformancePlan, ScenePlan } from '../../src/stage3d/contract.ts'
import { LocationFiles, LOCATIONS_URL } from '../location/io.ts'
import { LOCATION_RE, newLocationId } from '../location/request.ts'
import type { LocationShot } from '../location/types.ts'
import { KIT_EYE_HEIGHT_M, KIT_MASTER_MM, KIT_MASTER_POSITION, KIT_MASTER_TARGET, KIT_STILL_H, KIT_STILL_W, kitHorizonRow, kitVfovDeg } from './master.ts'
import { KitError } from './errors.ts'
import { parsePerformancePlan } from './perf.ts'
import { stampStrideFit } from './strideFitStamp.ts'
import { knownMotionIds } from './motionIds.ts'
import { snapToMark } from './markStart.ts'
import { writeBuilt } from './builtPlan.ts'
import { adoptPerfInto, adoptSetInto } from '../takes/adopt.ts'
import { editGround, editKit, editLight, editMark, editSky } from './pieceEdit.ts'
import type { CreateKitRequest, KitWorld } from './types.ts'
export type { CreateKitRequest, KitWorld } from './types.ts'

export const FILES = { meta: 'meta.json', plan: 'plan.json', perf: 'performance.json', still: 'still.png', masterDepth: 'master-zdepth.png' } as const
export const MAX_DESCRIPTION = 400
/** a world still without its still after this long is an orphan of a failed render (the page draws the still within seconds of creating the world) */
export const ORPHAN_MS = 30 * 60_000

export { KitError }

const readJson = (file: string): Record<string, unknown> | null => {
  try { return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> } catch { return null }
}
const writeJson = (file: string, v: unknown) => writeFileSync(file, JSON.stringify(v, null, 2) + '\n')

/** the shot length a new world starts with, seconds (the Camera panel's chips change it) */
export const DEFAULT_SHOT_S = 6
/** the default performance: the hero standing on the mark for a 6 s shot. No walk exists unless one is given on purpose, and no
 *  costume is written (every figure is the one neutral mannequin). */
export function standingPerf(plan: Pick<ScenePlan, 'flat'> & Partial<Pick<ScenePlan, 'mark' | 'kit'>>): PerformancePlan {
  return { path: standPath(markOf(plan)), stand: true, shotSeconds: DEFAULT_SHOT_S }
}

export class KitStore {
  readonly files: LocationFiles
  readonly publicDir: string
  constructor(publicDir: string) { this.publicDir = publicDir; this.files = new LocationFiles(publicDir) }

  dir(id: string): string {
    if (!LOCATION_RE.test(id)) throw new KitError(400, 'bad world id')
    return this.files.locationDir(id)
  }

  isKit(id: string): boolean {
    const w = readJson(path.join(this.dir(id), FILES.meta))?.world as { kind?: unknown } | undefined
    return w?.kind === 'kit'
  }

  /**
   * Validate the plan (and performance), then write the world's folder. Not listed in the manifest until its still lands.
   * `kept`: worlds the orphan sweep must leave alone (a library scene lists them, so its Bible and its place in the scene stay).
   */
  create(req: CreateKitRequest, now = new Date(), kept?: (id: string) => boolean): KitWorld {
    const plan = parsePlan(req.plan)
    if (!plan.ok) throw new KitError(422, 'the plan is not a world yet', plan.errors)
    const words = typeof req.description === 'string' && req.description.trim() ? req.description : plan.plan.sentence ?? 'a kit world'
    // an older client's `hero` words are ignored: the default performance names no costume
    const perf = parsePerformancePlan(req.perf ?? standingPerf(plan.plan), knownMotionIds(this.publicDir))
    if (!perf.ok) throw new KitError(422, 'the performance is not valid', perf.errors)
    const description = words.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION)
    this.sweepOrphans(now, kept)
    let at = now.getTime(), id = newLocationId(new Date(at))
    while (existsSync(this.files.locationDir(id))) id = newLocationId(new Date(++at))
    const dir = this.dir(id)
    mkdirSync(dir, { recursive: true })
    const vfovDeg = kitVfovDeg()
    writeJson(path.join(dir, FILES.plan), plan.plan)
    writeBuilt(dir, plan.plan)
    // a supplied performance starts on the mark, as every save keeps it (snapToMark); the default stand is built on it already
    writeJson(path.join(dir, FILES.perf), req.perf ? stampStrideFit(snapToMark(perf.perf, plan.plan), null) : perf.perf)
    writeJson(path.join(dir, FILES.meta), {
      kind: 'location', id, width: KIT_STILL_W, height: KIT_STILL_H,
      lens: { vfovDeg, from: 'known' },
      world: { kind: 'kit', eyeHeightM: KIT_EYE_HEIGHT_M, cameraPreset: 'eye', horizonRow: kitHorizonRow(vfovDeg), builtAt: null },
      result: { shot: { description, prompt: description } },
      kit: {
        plan: FILES.plan, performance: FILES.perf, createdAt: now.toISOString(),
        master: { position: KIT_MASTER_POSITION, target: KIT_MASTER_TARGET, focalMm: KIT_MASTER_MM },
      },
    })
    return this.read(id)
  }

  /** remove stillless kit worlds older than ORPHAN_MS (each failed render would otherwise leave one for good), except `kept` ones */
  sweepOrphans(now: Date, kept?: (id: string) => boolean): void {
    let ids: string[] = []
    try { ids = readdirSync(this.files.root).filter((n) => LOCATION_RE.test(n)) } catch { return }
    for (const id of ids) {
      const dir = this.files.locationDir(id), meta = readJson(path.join(dir, FILES.meta))
      if ((meta?.world as { kind?: unknown } | undefined)?.kind !== 'kit' || existsSync(path.join(dir, FILES.still)) || kept?.(id)) continue
      const made = Date.parse(String((meta?.kit as { createdAt?: unknown } | undefined)?.createdAt ?? ''))
      if (Number.isFinite(made) && now.getTime() - made > ORPHAN_MS) rmSync(dir, { recursive: true, force: true })
    }
  }

  read(id: string): KitWorld {
    const dir = this.dir(id)
    const meta = readJson(path.join(dir, FILES.meta))
    if (!meta || (meta.world as { kind?: unknown } | undefined)?.kind !== 'kit') throw new KitError(404, 'no kit world with this id')
    const plan = parsePlan(readJson(path.join(dir, FILES.plan)))
    if (!plan.ok) throw new KitError(409, 'this world\'s plan.json is broken', plan.errors)
    const perf = parsePerformancePlan(readJson(path.join(dir, FILES.perf)) ?? standingPerf(plan.plan))
    const shot = ((meta.result as Record<string, unknown> | undefined)?.shot ?? {}) as Record<string, unknown>
    const still = existsSync(path.join(dir, FILES.still)) ? `${LOCATIONS_URL}/${id}/${FILES.still}` : null
    const masterDepth = existsSync(path.join(dir, FILES.masterDepth)) ? `${LOCATIONS_URL}/${id}/${FILES.masterDepth}` : null
    const createdAt = String((meta.kit as { createdAt?: unknown } | undefined)?.createdAt ?? '')
    return { id, description: String(shot.description ?? ''), plan: plan.plan, perf: perf.ok ? perf.perf : standingPerf(plan.plan), still, masterDepth, createdAt }
  }

  /** every kit world on disk, newest first */
  list(): KitWorld[] {
    let ids: string[] = []
    try { ids = readdirSync(this.files.root).filter((n) => LOCATION_RE.test(n)) } catch { return [] }
    return ids.sort().reverse().flatMap((id) => {
      try { return this.isKit(id) ? [this.read(id)] : [] } catch { return [] }
    })
  }

  /** The master still (a 1920 x 1088 PNG): written, listed in the manifest, then the world stamped built (last). */
  async writeStill(id: string, png: Buffer, now = new Date()): Promise<KitWorld> {
    const world = this.read(id)
    const size = pngSize(png)
    if (!size) throw new KitError(400, 'the still must be a PNG')
    if (size.width !== KIT_STILL_W || size.height !== KIT_STILL_H) throw new KitError(400, `the still must be ${KIT_STILL_W} x ${KIT_STILL_H}, got ${size.width} x ${size.height}`)
    const dir = this.dir(id)
    writeFileSync(path.join(dir, FILES.still), png)
    await this.files.appendManifest(kitShot(id, world)) // listed first, stamped built last: a failure here leaves the world unbuilt, and a second upload completes it
    const meta = readJson(path.join(dir, FILES.meta))!
    writeJson(path.join(dir, FILES.meta), { ...meta, world: { ...(meta.world as object), builtAt: now.toISOString() } })
    return this.read(id)
  }

  /** The master view's metric depth (a 16-bit greyscale PNG at the still's size, as the kit clay's zdepth): the master draw holds to it. */
  writeMasterDepth(id: string, png: Buffer): KitWorld {
    this.read(id)
    const size = pngSize(png)
    if (!size || png[24] !== 16 || png[25] !== 0) throw new KitError(400, 'the master depth must be a 16-bit greyscale PNG')
    if (size.width !== KIT_STILL_W || size.height !== KIT_STILL_H) throw new KitError(400, `the master depth must be ${KIT_STILL_W} x ${KIT_STILL_H}, got ${size.width} x ${size.height}`)
    writeFileSync(path.join(this.dir(id), FILES.masterDepth), png)
    return this.read(id)
  }

  /**
   * (recipe wave) The set changed under its master: a generated piece landed or a piece moved. The plan is rewritten through
   * parsePlan (422 when the change makes it invalid; nothing written), meta.json's kit.setChangedAt is stamped (the Set step warns
   * that a master drawn before it describes another set), and the master view's depth is dropped so the next master draw measures
   * the set as it now stands (the Set step re-renders it before drawing). `change` gets the stored plan and returns its new kit.
   * (tidy wave) A change that leaves the plan as it was (a piece dropped where it stood) is no change: nothing is written or stamped,
   * so Render's set check (setChangedAt) agrees with Shoot's (the set key, a hash of the plan) that nothing moved.
   */
  changeKit(id: string, change: (plan: KitWorld['plan']) => KitWorld['plan']['kit'], now = new Date()): KitWorld {
    return this.changePlan(id, (plan) => ({ ...plan, kit: change(plan) }), now)
  }

  /**
   * (Track C) changeKit for any part of the plan: the Set's mark is one. `keepDepth`: the change leaves what the master view sees
   * as it was (the mark is not in the master's depth), so its depth stays. Same rules otherwise: the whole plan is re-parsed, a
   * change that changes nothing writes nothing, and the plan on disk is what the set key hashes.
   */
  changePlan(id: string, change: (plan: KitWorld['plan']) => KitWorld['plan'], now = new Date(), keepDepth = false): KitWorld {
    const world = this.read(id)
    const plan = parsePlan(change(world.plan))
    if (!plan.ok) throw new KitError(422, 'the set would not be valid after this change', plan.errors)
    const before = parsePlan(world.plan)
    if (before.ok && JSON.stringify(before.plan) === JSON.stringify(plan.plan)) return world
    // every take locked on the set on disk now, holding no copy and with frames on it, takes one first (takes/adopt.ts)
    adoptSetInto(this.publicDir, id, world.plan, this.setChangedAt(id))
    const dir = this.dir(id)
    writeJson(path.join(dir, FILES.plan), plan.plan)
    const meta = readJson(path.join(dir, FILES.meta))!
    writeJson(path.join(dir, FILES.meta), { ...meta, kit: { ...(meta.kit as object), setChangedAt: now.toISOString() } })
    if (!keepDepth) rmSync(path.join(dir, FILES.masterDepth), { force: true })
    return this.read(id)
  }

  /**
   * A narrow edit of one kit piece (Track C: moved, turned, scaled, removed, or one added; pieceEdit.ts): nothing else in the plan
   * changes. A stale index or kind is a 409, a plan that would not parse a 422.
   */
  movePiece(id: string, raw: unknown, now = new Date()): KitWorld {
    return this.changeKit(id, (plan) => editKit(plan, raw), now)
  }

  /** the subject's mark (plan.mark); the hero's path always begins on it, so it moves the start with it (a standing hero's stub turns too) */
  setMark(id: string, raw: unknown, now = new Date()): KitWorld {
    const mark = editMark(raw)
    const w = this.changePlan(id, (plan) => ({ ...plan, mark }), now, true)
    const snapped = snapToMark(w.perf, w.plan)
    if (snapped !== w.perf) {
      adoptPerfInto(this.publicDir, id, w.perf) // the takes locked on the walk being rewritten keep it (takes/adopt.ts)
      writeJson(path.join(this.dir(id), FILES.perf), snapped)
    }
    return this.read(id)
  }

  /**
   * New take (owner 10-29): the whole set replaced by a locked take's own set, so the next take starts from what was on show. A set
   * change like any other (changePlan: parsed, the takes still on the set adopt it first, stamped, the master depth dropped);
   * plan.built.json is never touched. The walk begins on the mark, so a new mark moves the walk's start as setMark does.
   */
  savePlan(id: string, raw: unknown, now = new Date()): KitWorld {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new KitError(400, 'body must be a set plan')
    const w = this.changePlan(id, () => raw as KitWorld['plan'], now)
    const snapped = snapToMark(w.perf, w.plan)
    if (snapped !== w.perf) {
      adoptPerfInto(this.publicDir, id, w.perf)
      writeJson(path.join(this.dir(id), FILES.perf), snapped)
    }
    return this.read(id)
  }

  /**
   * (layout wave L5) The sky's look (plan.sky.look; pieceEdit.ts editSky). A set change like any other: the plan is re-written
   * and re-hashed, the set-changed stamp moves and the master view's depth drops (the master is drawn from the plan's sky).
   */
  saveSky(id: string, raw: unknown, now = new Date()): KitWorld {
    return this.changePlan(id, (plan) => ({ ...plan, sky: editSky(plan, raw) }), now)
  }

  /**
   * The ground's shape (plan.ground; pieceEdit.ts editGround): a set change like any other — the plan is re-written and re-hashed, the
   * set-changed stamp moves (a locked take reads its set changed) and the master view's depth drops (the ground is in it). Every piece
   * stands on the new ground when the world is built from it (world.ts heightFn), so nothing else in the plan moves.
   */
  saveGround(id: string, raw: unknown, now = new Date()): KitWorld {
    const ground = editGround(raw)
    return this.changePlan(id, (plan) => ({ ...plan, ground }), now)
  }

  /** the sun's direction (plan.light.keyDir; pieceEdit.ts editLight): a set change, but the master view's depth stays (light is no depth) */
  saveLight(id: string, raw: unknown, now = new Date()): KitWorld {
    return this.changePlan(id, (plan) => ({ ...plan, light: editLight(plan, raw) }), now, true)
  }

  /** when a piece last landed in or moved on this set (meta.json kit.setChangedAt), null = never */
  setChangedAt(id: string): string | null {
    const v = (readJson(path.join(this.dir(id), FILES.meta))?.kit as { setChangedAt?: unknown } | undefined)?.setChangedAt
    return typeof v === 'string' ? v : null
  }

  savePerformance(id: string, raw: unknown): KitWorld {
    const world = this.read(id)
    // a move already in the saved performance stays savable when its kept clip is not on this machine (kept clips are not in the
    // repo, so a fresh clone has none): playback plays it as Stop with a warning. Only a NEW unknown move is refused.
    const perf = parsePerformancePlan(raw, [...knownMotionIds(this.publicDir), ...savedMoveIds(world.perf)])
    if (!perf.ok) throw new KitError(422, 'the performance is not valid', perf.errors)
    // every take locked on the walk on disk now and holding no copy of its own takes one first (takes/adopt.ts): a locked take never changes
    adoptPerfInto(this.publicDir, id, world.perf)
    // the walk begins on the mark (markStart.ts); plan.json is never written here, so the set approval key does not move
    // a walk saved new or changed takes the stride fit; an unchanged one keeps the file's (strideFitStamp.ts: locked takes keep their frames)
    writeJson(path.join(this.dir(id), FILES.perf), stampStrideFit(snapToMark(perf.perf, world.plan), world.perf))
    return this.read(id)
  }
}

/** The manifest shot of a kit world: the lab's source list reads it; `kind: 'kit'` and no depths tell the lab to build it in 3D. */
export function kitShot(id: string, w: Pick<KitWorld, 'description' | 'plan'>): LocationShot {
  const shot = {
    id, image: `${LOCATIONS_URL}/${id}/${FILES.still}`, width: KIT_STILL_W, height: KIT_STILL_H, prompt: w.description, seed: w.plan.seed,
    fovDeg: kitVfovDeg(), metric: true, depths: [], kind: 'kit', plan: `${LOCATIONS_URL}/${id}/${FILES.plan}`,
  }
  return shot as unknown as LocationShot
}

/** width and height from a PNG's IHDR, or null when it is not a PNG */
export function pngSize(b: Buffer): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length < 24 || !sig.every((v, i) => b[i] === v) || b.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/** the made moves' ids a saved performance already names (the hero's actions and every extra's) */
export function savedMoveIds(perf: { actions?: { kind: string; motion?: string }[]; extras?: { actions?: { kind: string; motion?: string }[] }[] } | null | undefined): string[] {
  const all = [...(perf?.actions ?? []), ...(perf?.extras ?? []).flatMap((e) => e.actions ?? [])]
  return all.flatMap((a) => (a.kind === 'move' && typeof a.motion === 'string' ? [a.motion] : []))
}
