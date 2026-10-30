import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Prober } from '../takes.ts'

export const PACK = 'warehouse-fight'
export const DRAFT_A = 'warp-2026-10-19T10-00-00/crossview-2026-10-19T10-05-00-000'
export const FINAL_A = 'warp-2026-10-19T10-00-00/final-2026-10-19T10-30-00-000'
export const DRAFT_B = 'warp-2026-10-19T11-00-00/crossview-2026-10-19T11-05-00-000'
export const FINISHED_B = 'warp-2026-10-19T11-00-00/finished-src1-2026-10-19T11-40-00-000'

/** A public dir with two camera moves of one performance (and one of another); files are stubs, the probe answers by name. */
export function rig() {
  const publicDir = mkdtempSync(path.join(os.tmpdir(), 'cut-'))
  const renders = path.join(publicDir, 'lab-assets', 'renders')
  const add = (folder: string, cams: object, files: string[]) => {
    mkdirSync(path.join(renders, folder), { recursive: true })
    writeFileSync(path.join(renders, folder, 'cameras.json'), JSON.stringify(cams))
    for (const f of files) writeFileSync(path.join(renders, folder, f), 'stub')
  }
  add('warp-2026-10-19T10-00-00', { packId: PACK, sourceStart: 0 }, ['crossview-2026-10-19T10-05-00-000.mp4', 'final-2026-10-19T10-30-00-000.mp4'])
  add('warp-2026-10-19T11-00-00', { packId: PACK, sourceStart: 12 }, ['crossview-2026-10-19T11-05-00-000.mp4', 'finished-src1-2026-10-19T11-40-00-000.mp4', 'warp.mp4', 'source.mp4'])
  add('warp-2026-10-19T12-00-00', { packId: 'other', sourceStart: 0 }, ['crossview-2026-10-19T12-05-00-000.mp4'])
  add('warp-2026-10-19T13-00-00', {}, ['crossview-2026-10-19T13-05-00-000.mp4']) // no pack: not a take of any performance
  const probe: Prober = async (file) => {
    const f = path.basename(file)
    if (!f.endsWith('.mp4')) return null
    const big = f.startsWith('final') || f.startsWith('finished')
    return { width: big ? 1920 : 960, height: big ? 1088 : 544, frames: 97, hasAudio: !f.startsWith('finished') }
  }
  return { publicDir, renders, probe }
}
