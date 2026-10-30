/**
 * "Draw from the master, projected" (draw-from-master plan, arm 2, mode 'edit-projected'): the scene's approved master seen from
 * the take's camera by its depth (scripts/hero/project_master.py, a z-buffered point splat), so the edit starts from the real
 * place instead of a drawn empty set. What the master never saw is black, with a mask beside it. Free and local: no plate is
 * drawn. Refused free, in plain words, when the world has no master depth (master-zdepth.png), no master is approved, or there
 * is no Python; nothing is written then. Written beside the take's stills as `projected-NNN.png` and `projected-NNN-holes.png`.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { readBibleFile } from '../bible/read.ts'
import { currentSetKey } from '../bible/setGate.ts'
import { KIT_MASTER_MM, KIT_MASTER_POSITION, KIT_MASTER_TARGET } from '../stage3d/master.ts'
import { heightFn } from '../../src/stage3d/world.ts'
import { bareWorldId, takeKitWorld } from '../stage3d/takeWorld.ts'
import { bibleFile } from './kitInputs.ts'
import type { HeroCtx } from './run.ts'
import { HeroHttpError } from './store.ts'

export const PROJECT_SCRIPT = 'scripts/hero/project_master.py'
export const projectedName = (frame: number) => `projected-${String(frame).padStart(3, '0')}.png`
export const holesName = (frame: number) => `projected-${String(frame).padStart(3, '0')}-holes.png`

export interface MasterCam { position: readonly number[]; target: readonly number[]; focalMm: number }
export interface TakeCam { position: readonly number[]; quaternion: readonly number[]; focal: number }
/** a camera as the script reads it: look-at (7 numbers) or quaternion (8) */
type CamArg = MasterCam | (TakeCam & { target?: undefined })
const camArg = (c: CamArg): string => (c.target ? [...c.position, ...c.target, (c as MasterCam).focalMm] : [...c.position, ...(c as TakeCam).quaternion, (c as TakeCam).focal]).join(',')

const NO_MASTER = 'This draw starts from the approved master of the scene, and there is none: approve a master in the scene sheet first. Nothing was billed.'
const NO_DEPTH = 'This scene\'s master has no depth recorded, so it cannot be seen from another camera: build the set again to capture it. Nothing was billed.'
export const PROJECTED_OFF_SET = "The scene's master was drawn on the scene's set, and this take keeps another set of its own, so the master seen from this camera would show the wrong place. Use Draw from your approved frame instead, or lock the take again on the set as it stands. Nothing was billed."
const NO_PYTHON = 'Python was not found, and the master is moved to the new camera with it. Install Python with OpenCV and numpy (or set CANVAS_PYTHON to it) and restart. Nothing was billed.'

/** the camera the master was drawn from: kitStill.ts masterCamera(world.groundAt), the master position and target lifted by the terrain under each */
export function masterCamOf(plan: Parameters<typeof heightFn>[0] | null): MasterCam {
  const g = plan ? heightFn(plan) : () => 0, [px, py, pz] = KIT_MASTER_POSITION, [tx, ty, tz] = KIT_MASTER_TARGET
  return { position: [px, py + g(px, pz), pz], target: [tx, ty + g(tx, tz), tz], focalMm: KIT_MASTER_MM }
}

/**
 * the approved master picture, its depth and its camera, or the free 409 saying which is missing. The master, its depth and its camera
 * are the scene's (its plan's terrain lifts the camera): a take with a set key that is not the scene's set now (it keeps its own,
 * PLAN-PER-TAKE-SET.md) is refused, free, before anything is read.
 */
export function masterSources(publicDir: string, take: Pick<TakeRecord, 'worldId' | 'setKey'>): { masterPng: string; zdepthFile: string; masterCam: MasterCam } {
  const worldId = take.worldId
  if (take.setKey) {
    let now: string | null = null
    try { now = currentSetKey(publicDir, worldId) } catch { /* a set that does not read is not this take's */ }
    if (now !== take.setKey) throw new HeroHttpError(409, PROJECTED_OFF_SET, 'set_differs')
  }
  const masterPng = bibleFile(publicDir, readBibleFile(publicDir, worldId)?.master?.png)
  if (!masterPng || !existsSync(masterPng)) throw new HeroHttpError(409, NO_MASTER, 'no_master')
  const zdepthFile = path.join(publicDir, 'lab-assets', 'locations', bareWorldId(worldId), 'master-zdepth.png')
  if (!existsSync(zdepthFile)) throw new HeroHttpError(409, NO_DEPTH, 'no_master_depth')
  return { masterPng, zdepthFile, masterCam: masterCamOf(takeKitWorld(publicDir, worldId)?.plan ?? null) }
}

/** Writes `out` (the projected picture) and its mask beside it (`…-holes.png`); returns both paths. */
export async function projectMaster(ctx: HeroCtx, o: { masterPng: string; zdepthFile: string; masterCam: MasterCam; takeCam: TakeCam; out: string }): Promise<{ png: string; holes: string }> {
  const python = ctx.deps.python?.()
  const script = path.join(ctx.deps.appDir ?? path.resolve(ctx.publicDir, '..'), PROJECT_SCRIPT)
  if (!python || !ctx.deps.runPython || !existsSync(script)) throw new HeroHttpError(409, NO_PYTHON, 'no_python')
  const holes = o.out.replace(/\.png$/i, '-holes.png')
  try {
    await ctx.deps.runPython(python, [script, '--master', o.masterPng, '--zdepth', o.zdepthFile, '--master-cam', camArg(o.masterCam), '--take-cam', camArg(o.takeCam), '--out', o.out, '--holes', holes])
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    throw new HeroHttpError(409, /ENOENT/.test(msg) ? NO_PYTHON : `The master could not be moved to this camera (${msg.slice(-200)}). Nothing was billed.`, 'no_python')
  }
  if (!existsSync(o.out) || !existsSync(holes)) throw new HeroHttpError(409, 'The projected picture was not written. Nothing was billed.', 'no_python')
  return { png: o.out, holes }
}
