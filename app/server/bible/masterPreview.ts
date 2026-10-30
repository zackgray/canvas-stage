/**
 * The master's press preview (tidy wave, the still's pattern: server/hero/preview.ts): POST /__lab/bible/master/preview composes
 * exactly what "Draw the look" would send (composeMaster, the function the draw runs) and answers it with NO Cloud call, no budget
 * check and no intent: the prompt (the owner's edit after the scrub, and the composed default), the lock preset, the seeds and the
 * price, and the master view's depth as the draw is held to it (written as preview-master-depth.png beside the candidates, made
 * again only when the set's depth is newer, so a running draw's own master-depth.png is never touched). Refusals are the draw's
 * free ones (bad body 400, an unknown @tag 400); a set with no measured depth yet answers with no depth image instead of refusing.
 */
import { existsSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { briefFromBible, warnPrompt } from '../prompt/warn.ts'
import { biblePaths, type BibleRecord } from '../../src/shared/bibleContract.ts'
import type { MasterPreviewRequest, MasterPreviewResponse } from '../../src/shared/stillPressContract.ts'
import { writeDepthControl } from '../hero/depthImage.ts'
import { masterCredits } from '../hero/master.ts'
import { DEFAULT_LOCK } from '../hero/lockPresets.ts'
import { composeMaster, masterDepthFile } from './masterDraw.ts'
import type { BibleStore } from './store.ts'
import { BibleError } from './validate.ts'

const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : -1)
export const MASTER_PREVIEW_DEPTH = 'preview-master-depth.png'

export async function previewMaster(publicDir: string, store: BibleStore, bible: BibleRecord | null, body: unknown): Promise<MasterPreviewResponse> {
  const b = (body && typeof body === 'object' ? body : {}) as Partial<MasterPreviewRequest>
  if (typeof b.worldId !== 'string' || !b.worldId) throw new BibleError(400, 'worldId is required')
  const c = composeMaster(publicDir, bible, { ...b, worldId: b.worldId })
  const zdepth = masterDepthFile(store, b.worldId)
  let depthUrl: string | null = null
  if (existsSync(zdepth)) {
    const rel = biblePaths(b.worldId).master, out = path.join(publicDir, ...rel.split('/'), MASTER_PREVIEW_DEPTH)
    if (mtime(out) < mtime(zdepth)) { await mkdir(path.dirname(out), { recursive: true }); writeDepthControl(zdepth, out) }
    depthUrl = `/${rel}/${MASTER_PREVIEW_DEPTH}?v=${Math.round(mtime(out))}`
  }
  return { prompt: c.prompt, composed: c.composed, edited: c.edited, preset: c.lock.preset ?? DEFAULT_LOCK, count: c.count, price: masterCredits(c.count), depthUrl,
    warnings: warnPrompt(b.prompt?.trim() ? b.prompt.trim() : c.composed, { step: 'master', brief: briefFromBible(bible), pasted: !!b.prompt?.trim() }) }
}
