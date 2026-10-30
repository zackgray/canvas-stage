/**
 * "Two clays from one scene" (E139), the one rule for which clay the MODELS see: the massing clay (massingClay.ts) when it is
 * current for the take, else the precise clay. Current = its massing.json was written for this start of the take and frame count
 * by the latest clay export (forgetMassing drops it when a new precise export begins, so a set that lost its massing pieces, or a
 * massing pass that failed this time, falls back instead of showing the last export's set). Model-facing only: the still's depth
 * control (hero/kitInputs.ts controlDepthFor) and the Layout-To-Render video (l2r/run.ts). The layout check, the judge, the ID pass
 * keep reading the precise clay directly. The fallback is silent in the UI and recorded on what it drove. Free.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { TakeRecord } from '../../src/shared/shotContract.ts'
import { massingDir as dirOf, type MassingClay } from './massingClay.ts'

/** which clay drove a model input (recorded on the still as controlDepth, on the render as layoutClay) */
export type ClaySource = 'massing' | 'precise'

const pad = (i: number) => String(i).padStart(3, '0')

/** the take's massing clay when it is current for this start and length, else null */
export function currentMassing(publicDir: string, take: Pick<TakeRecord, 'id' | 'startKey' | 'frames'>): MassingClay | null {
  const f = path.join(dirOf(publicDir, take.id), 'massing.json')
  if (!existsSync(f)) return null
  try {
    const m = JSON.parse(readFileSync(f, 'utf8')) as MassingClay
    return m.takeId === take.id && m.startKey === take.startKey && m.frames === take.frames ? m : null
  } catch { return null }
}

/** the depth image the still's control is drawn from at `frame`: the massing zdepth when current and on disk, else `precise` */
export function modelDepthAt(publicDir: string, take: Pick<TakeRecord, 'id' | 'startKey' | 'frames'>, frame: number, precise: string): { file: string; source: ClaySource } {
  const m = currentMassing(publicDir, take)
  const f = path.join(dirOf(publicDir, take.id), `zdepth_${pad(frame)}.png`)
  return m?.depth && frame >= 0 && frame < take.frames && existsSync(f) ? { file: f, source: 'massing' } : { file: precise, source: 'precise' }
}

/** the layout video a render is sent: the massing video when current and on disk, else the precise clay video */
export function modelClayVideo(publicDir: string, take: Pick<TakeRecord, 'id' | 'startKey' | 'frames'>, precise: string): { file: string; url: string | null; source: ClaySource } {
  const m = currentMassing(publicDir, take)
  const f = path.join(dirOf(publicDir, take.id), 'massing.mp4')
  return m && existsSync(f) ? { file: f, url: m.mp4, source: 'massing' } : { file: precise, url: null, source: 'precise' }
}

/** a new precise clay export of the take has begun: the last export's massing clay is no longer current (its frames are overwritten) */
export function forgetMassing(publicDir: string, takeId: string): void {
  rmSync(path.join(dirOf(publicDir, takeId), 'massing.json'), { force: true })
}
