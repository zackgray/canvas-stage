/**
 * Keep on a still's redraw candidate (registerApplier('still', …), server/passes): the result becomes a NEW still,
 * `<id>-r<n>`, with the old one's role, frame, start, cast and Bible version, and it takes over the old one's approval. The old still
 * and its picture stay on disk untouched (replacedUrl). A new id is what makes everything built on the old still notice, exactly as
 * approving a freshly drawn still does: Render compares its last render's still id with the approved one and offers Render again;
 * a keyframe guide names its still by id. A still something was already kept onto is "redrawn": a second candidate from the same
 * still is refused at Keep (target_changed), so two redraws can never silently undo each other.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import type { PassCandidate, PassTarget } from '../../src/shared/passContract.ts'
import type { PassApplier, PassCtx } from '../passes/registry.ts'
import { clayDepthAt } from './kitInputs.ts'
import type { KitStill } from './kitSpec.ts'
import { checkLayout } from './layoutCheck.ts'
import { STILL_ID_RE } from './spec.ts'
import { heroDirOf, HeroHttpError, heroUrl, readJson, readTake, serial, stillFile, writeJson } from './store.ts'

/** a still made by Keep records what it replaced and which candidate made it */
export interface RedrawnStill extends KitStill { redrawOf?: string; passId?: string }

const readJsonSync = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }

/** the still a Keep already made from `stillId` (the newest), or null */
export function redrawnInto(publicDir: string, takeId: string, stillId: string): string | null {
  const dir = heroDirOf(publicDir, takeId)
  if (!existsSync(dir)) return null
  const hits: RedrawnStill[] = []
  for (const f of readdirSync(dir)) {
    if (!f.startsWith(`${stillId.replace(/-r\d+$/, '')}-r`) || !f.endsWith('.json')) continue
    const s = readJsonSync<RedrawnStill>(path.join(dir, f))
    if (s?.redrawOf === stillId) hits.push(s)
  }
  return hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? null
}

/** `<base>-r<n>`, the first n free (a redraw of a redraw counts on from the same base, so ids do not grow) */
export function nextStillId(dir: string, id: string): string {
  const base = id.replace(/-r\d+$/, '')
  for (let n = 1; ; n++) {
    const next = `${base}-r${n}`
    if (!STILL_ID_RE.test(next)) throw new HeroHttpError(409, `cannot name a redraw of ${id}`, 'bad_id')
    if (!existsSync(path.join(dir, `${next}.json`)) && !existsSync(path.join(dir, `${next}.png`))) return next
  }
}

const fileOfUrl = (publicDir: string, url: string) => path.join(publicDir, ...url.replace(/^\/+/, '').split('?')[0].split('/'))
/** what current() answers for a still a Keep already replaced: never equal to its own URL, so Keep refuses */
const REDRAWN = '#redrawn-into-'

export function stillApplier(now: () => Date = () => new Date()): PassApplier {
  return {
    async current(target: PassTarget, ctx: PassCtx, c: PassCandidate): Promise<string | null> {
      if (target.kind !== 'still') return null
      const dir = heroDirOf(ctx.publicDir, c.takeId)
      if (!existsSync(stillFile(dir, target.stillId)) || !existsSync(path.join(dir, `${target.stillId}.png`))) return null
      const into = redrawnInto(ctx.publicDir, c.takeId, target.stillId)
      return into ? `${REDRAWN}${into}` : heroUrl(c.takeId, `${target.stillId}.png`)
    },
    apply: (c: PassCandidate, ctx: PassCtx) => serial(async () => {
      if (c.target.kind !== 'still' || !c.afterUrl) throw new HeroHttpError(409, 'not a still candidate with a result', 'not_candidate')
      const dir = heroDirOf(ctx.publicDir, c.takeId)
      const old = await readJson<RedrawnStill>(stillFile(dir, c.target.stillId))
      if (!old) throw new HeroHttpError(404, `${c.target.stillId} is gone`, 'not_found')
      const after = fileOfUrl(ctx.publicDir, c.afterUrl)
      if (!existsSync(after)) throw new HeroHttpError(409, 'the redraw\'s picture is not on disk; Recover it first', 'no_output')
      const id = nextStillId(dir, old.id)
      await copyFile(after, path.join(dir, `${id}.png`)) // the picture first; the json LAST makes the still exist
      const take = await readTake(ctx.publicDir, c.takeId).catch(() => null)
      const depth = take ? clayDepthAt(ctx.publicDir, take, old.frame ?? 0) : null
      const layout = depth ? checkLayout(depth, path.join(dir, `${id}.png`)) ?? old.layout ?? null : old.layout ?? null
      const { png: _png, ...rest } = old
      const made: RedrawnStill = { ...rest, id, png: heroUrl(c.takeId, `${id}.png`), jobId: c.jobId, credits: c.costCredits ?? 0, createdAt: now().toISOString(),
        layout, redrawOf: old.id, passId: c.id, madeBy: `${old.madeBy ?? 'still'} + klein-4b ${c.pass} redraw` }
      await writeJson(stillFile(dir, id), made)
      if (old.approved) await writeJson(stillFile(dir, old.id), { ...rest, approved: false }) // the approval moves to the new still
      return { replacedUrl: heroUrl(c.takeId, `${old.id}.png`) }
    }),
  }
}
