/**
 * The paid master draw behind POST /__lab/bible/master (routes.ts `DrawMaster`): track B's depth-locked Qwen-Image 2512 graph
 * (server/hero/master.ts) on the master view's metric depth, which the set build captures beside still.png (master-zdepth.png).
 * Free refusals first (bad count, no depth, an unknown @tag, another master draw or a Layout-To-Render pass running), then ONE
 * job of 1..2 seeds held by the photographic lock unless the press asks for tight (tidy wave: the still's recipe; the press preview,
 * masterPreview.ts, composes the same thing for free); the candidates are appended to the Bible (never replacing one). One master draw at a time (409 busy).
 * A job that succeeded but whose files did not land is recovered by id (POST /__lab/jobs/recover), never resubmitted.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import * as THREE from 'three'
import { biblePaths, promptTags, type BibleMasterRequest, type BibleRecord } from '../../src/shared/bibleContract.ts'
import { exclusive, isFreeRefusal, running, type JobRuntime } from '../jobs/index.ts'
import { drawMasterCandidates, MASTER_MADE_BY } from '../hero/master.ts'
import { buildDrawPrompt } from '../hero/kitStillPrompt.ts'
import { isLockPreset, lockFor } from '../hero/lockPresets.ts'
import { isL2RLabel, L2R_KEY } from '../l2r/spec.ts'
import { HERO_KEY, isHeroLabel } from '../hero/spec.ts'
import { KIT_MASTER_MM, KIT_MASTER_POSITION, KIT_MASTER_TARGET } from '../stage3d/master.ts'
import { angleWords, kitView, type OpeningCamera } from '../hero/kitView.ts'
import { FILES, KitStore } from '../stage3d/store.ts'
import { dropMasterIntents, writeMasterIntents } from './masterIntents.ts'
import { setRefusalFor } from './setGate.ts'
import { composePrompt, unknownTagMessage } from './prompt.ts'
import type { DrawMaster } from './routes.ts'
import type { BibleStore } from './store.ts'
import { BibleError } from './validate.ts'

export const MASTER_KEY = 'bible-master'
const LABEL = 'bible-master '
export const isMasterLabel = (label: string) => label.startsWith(LABEL)
/** the master camera as the still's view math takes it (stage3d/master.ts: its position, looking at its target, 24 mm) */
export function masterCamera(): OpeningCamera {
  const o = new THREE.PerspectiveCamera() // a camera's lookAt points its -z (the view) at the target
  o.position.fromArray(KIT_MASTER_POSITION); o.lookAt(new THREE.Vector3(...KIT_MASTER_TARGET))
  return { position: [...KIT_MASTER_POSITION], quaternion: o.quaternion.toArray() as number[], focal: KIT_MASTER_MM }
}

/** (prompt wave) the master camera's sentence from its real pitch and height (kitView angleWords), never a fixed line */
export const masterCameraWords = (c: OpeningCamera = masterCamera()): string => angleWords(c) || `Seen at eye height, ${c.position[1].toFixed(1)} metres up.`

export interface MasterDrawCtx {
  publicDir: string
  store: BibleStore
  runtime: () => JobRuntime
  seed?: () => number
  now?: () => Date
}

const CLAIM = 'master candidates for '
/** the world a master draw is for, from its job label or its claim ('bible-master <world> …' / 'master candidates for <world>') */
const masterWorld = (what: string) => (what.startsWith(LABEL) ? what.slice(LABEL.length).split(' ')[0] : what.startsWith(CLAIM) ? what.slice(CLAIM.length) : null)

/**
 * a master draw in flight (this process's claim or a live job record), for GET's `running`; with `worldId`, only one for that
 * world (another scene's master draw is not this set's: its Set step neither shows it nor waits on it)
 */
export function masterRunning(rt: JobRuntime, worldId?: string): { since: string; what: string } | null {
  const r = running(MASTER_KEY, rt.store, isMasterLabel)
  if (!r || (worldId !== undefined && masterWorld(r.what) !== worldId)) return null
  return { since: r.since, what: r.what }
}

/**
 * The master draw's prompt (the still's photograph with nobody in it, kitStillPrompt.ts): the place, the master camera's own words
 * and lens feel, the pieces the master camera sees by their labels, the brief's light and atmosphere; never a person's card.
 * `override`: the owner's text, sent verbatim (owner decision 1).
 */
export function masterPrompt(bible: BibleRecord | null, plan: Parameters<typeof buildDrawPrompt>[0]['plan'], override?: string): string {
  const c = composePrompt({ bible, target: 'video', fallback: plan.sentence })
  if (c.unknown.length) throw new BibleError(400, unknownTagMessage(c.unknown))
  // the master is the place: a sentence naming a cast member would draw a person the set's depth has no body for
  const cast = new Set((bible?.elements ?? []).filter((e) => e.kind === 'cast').map((e) => e.tag))
  if (bible && cast.size) {
    const keep = bible.prompt.split(/(?<=[.!?])\s+/).filter((sen) => !promptTags(sen).some((t) => cast.has(t)))
    bible = { ...bible, prompt: keep.join(' ') }
  }
  // the master camera's view: only the pieces it sees are named, and fire words only for a fire it sees
  const cam = masterCamera()
  return buildDrawPrompt({ bible, plan, cast: { name: '', description: '' }, view: kitView(plan, undefined, cam), focal: KIT_MASTER_MM, mode: 'master', masterCamera: masterCameraWords(cam), override })
}

/** the master view's metric depth the draw is held to (the set build measures it beside still.png) */
export const masterDepthFile = (store: BibleStore, worldId: string) => path.join(store.worldDir(worldId), FILES.masterDepth)

/** (guided wave) the set must be approved at its current key before the draw or its preview: 409 in plain words, before any claim, intent or job */
export function requireApprovedSet(publicDir: string, worldId: string): void {
  const why = setRefusalFor(publicDir, worldId)
  if (why) throw new BibleError(409, why)
}

/** a master request's fields, checked (400 in plain words); its seed count */
function checkMasterRequest(req: Partial<BibleMasterRequest>): number {
  const count = req.count ?? 2
  if (!Number.isInteger(count) || count < 1 || count > 2) throw new BibleError(400, 'count must be 1 or 2')
  if (req.seed !== undefined && !(Number.isInteger(req.seed) && req.seed >= 0 && req.seed < 2 ** 31)) throw new BibleError(400, 'seed must be a non-negative integer')
  if (req.depthStrength !== undefined && !(typeof req.depthStrength === 'number' && req.depthStrength >= 0.5 && req.depthStrength <= 1)) throw new BibleError(400, 'depthStrength must be 0.5 to 1')
  if (req.preset !== undefined && !isLockPreset(req.preset)) throw new BibleError(400, 'preset must be photographic or tight')
  if (req.prompt !== undefined && !(typeof req.prompt === 'string' && req.prompt.length <= 4000)) throw new BibleError(400, 'prompt must be text of 4000 characters at most')
  return count
}

/**
 * Everything a master draw would send, checked and composed for free (the draw and its press preview both call it): the count, the
 * seed, the lock (the photographic preset by default, the recipe's), the composed prompt and the owner's edit. No depth check here:
 * the preview shows a missing depth, the draw refuses it.
 */
export function composeMaster(publicDir: string, bible: BibleRecord | null, req: Partial<BibleMasterRequest> & { worldId: string }) {
  const count = checkMasterRequest(req)
  requireApprovedSet(publicDir, req.worldId)
  const plan = new KitStore(publicDir).read(req.worldId).plan
  const composed = masterPrompt(bible, plan)
  const prompt = req.prompt?.trim() ? masterPrompt(bible, plan, req.prompt) : composed
  return { count, composed, prompt, edited: prompt !== composed, lock: lockFor({ preset: req.preset, depthStrength: req.depthStrength }) }
}

export function masterDrawer(ctx: MasterDrawCtx): DrawMaster {
  return async (bible, req: BibleMasterRequest) => {
    const worldId = req.worldId
    checkMasterRequest(req)
    requireApprovedSet(ctx.publicDir, worldId) // before the depth check, the claim and any intent: nothing is spent on an unapproved set
    const zdepth = masterDepthFile(ctx.store, worldId)
    if (!existsSync(zdepth)) throw new BibleError(409, "The set has no master-view depth yet: open the Stage on it again (the depth is measured before the draw), or rebuild the set.")
    const { count, prompt, lock } = composeMaster(ctx.publicDir, bible, req)
    const rt = ctx.runtime()
    const now = (ctx.now ?? (() => new Date()))()
    const base = req.seed ?? (ctx.seed ?? (() => Math.floor(Math.random() * 2 ** 31)))()
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    const taken = new Set([...(bible?.candidates ?? []).map((m) => m.id)])
    const picks = Array.from({ length: count }, (_, i) => {
      let id = `m-${stamp}-${i + 1}`
      for (let k = 2; taken.has(id); k++) id = `m-${stamp}-${i + 1}-${k}`
      taken.add(id)
      return { seed: (base + i * 7919) % 2 ** 31, name: id }
    })
    const label = `${LABEL}${worldId} ${picks.map((p) => p.name).join(' ')}`
    return exclusive(MASTER_KEY, `${CLAIM}${worldId}`, rt.store, isMasterLabel, async () => {
      const outDir = path.join(ctx.publicDir, ...biblePaths(worldId).master.split('/'))
      await mkdir(outDir, { recursive: true })
      // M5: the candidates exist as intents before the spend, so a restart mid-draw can still bring them into the Bible
      const ids = picks.map((p) => p.name)
      await writeMasterIntents(ctx.publicDir, worldId, picks.map((p) => ({ id: p.name, seed: p.seed, madeBy: MASTER_MADE_BY, depthStrength: lock.strength, createdAt: now.toISOString() })))
      const r = await drawMasterCandidates(rt, { zdepthFile: zdepth, prompt, picks, outDir, label, depthStrength: lock.strength, depthEnd: lock.end }).catch(async (e: unknown) => {
        if (isFreeRefusal(e)) await dropMasterIntents(ctx.publicDir, worldId, ids) // free: nothing to recover
        throw e
      })
      const each = r.credits == null ? 0 : Math.round((r.credits / picks.length) * 100) / 100
      const next = await ctx.store.addCandidates(worldId, picks.map((p) => ({
        id: p.name, png: `/${biblePaths(worldId).master}/${p.name}.png`, madeBy: r.madeBy, seed: p.seed, depthStrength: r.depthStrength,
        jobId: r.jobId, credits: each, createdAt: now.toISOString(),
      })))
      await dropMasterIntents(ctx.publicDir, worldId, ids)
      return next
    }, [{ key: L2R_KEY, match: isL2RLabel }, { key: HERO_KEY, match: isHeroLabel }])
  }
}
