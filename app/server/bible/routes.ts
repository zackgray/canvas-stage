/** HTTP routes at BIBLE_ROUTES.bible (bibleContract.ts), as pure handlers over a BibleStore. */
import type { BibleMasterRequest, BibleRecord, BibleResponse } from '../../src/shared/bibleContract.ts'
import type { SetApproval } from '../../src/shared/setApproval.ts'
import { NOT_BUILT } from '../../src/shared/shotContract.ts'
import type { BibleStore } from './store.ts'
import { BibleError, isMasterId } from './validate.ts'

export interface Reply { status: number; body: unknown }
const ok = (bible: BibleRecord | null, running?: BibleResponse['running'], unrecovered?: BibleResponse['unrecovered']): Reply =>
  ({ status: 200, body: { bible, ...(running !== undefined ? { running } : {}), ...(unrecovered?.length ? { unrecovered } : {}) } satisfies BibleResponse })
const fail = (status: number, error: string): Reply => ({ status, body: { error } })

/** The paid master draw (Qwen 2512 + depth patch) is track B's graph; injected, 501 until it is. Returns the new candidates. */
export type DrawMaster = (bible: BibleRecord | null, req: BibleMasterRequest) => Promise<BibleRecord | null>

export interface BibleCtx {
  store: BibleStore; drawMaster?: DrawMaster; /** a paid master draw in flight for this world (GET reports it) */ running?: (worldId: string) => BibleResponse['running']
  /** (GET, M5) completes landed master intents into candidates and lists billed master jobs to recover (masterIntents.ts) */
  complete?: (worldId: string) => Promise<BibleResponse['unrecovered']>
  /** (tidy wave) POST /master/preview: what Draw the look would send, FREE (masterPreview.ts); 404 when not wired */
  previewMaster?: (bible: BibleRecord | null, body: unknown) => Promise<unknown>
  /** (guided wave) the world's set key now (setGate.ts currentSetKey): POST /set/approve approves the set at it; 404 when not wired */
  setKey?: (worldId: string) => string | null
  /** (guided wave) the set the owner approved (read.ts readSetApproval): GET and the approval's reply carry it */
  setApproval?: (worldId: string) => SetApproval | null
  /** (review F1) a set key POST /set/approve may approve besides the scene's (setGate.ts approvableSetKey); absent = the scene's only */
  approvable?: (worldId: string, sent: unknown) => { key: string; scene: boolean } | null
  /** (review F1) every set key approved on the world (setKeys.ts): GET and the approval's reply carry it, so the page can show a take's own set as approved */
  approvedKeys?: (worldId: string) => string[]
}

export const NOT_APPROVABLE = "That set is neither the scene's set now nor the set of a locked take of this scene, so it was not approved. Reload the page."

/** the reply with the world's set approval and its set key now beside the sheet (approval null = never approved; key null = no set, or its plan does not read) */
const withApproval = (ctx: BibleCtx, world: string, r: Reply): Reply => {
  if (!ctx.setApproval) return r
  let setKey: string | null = null
  try { setKey = ctx.setKey?.(world) ?? null } catch { /* a plan that does not read: no key, so the set reads as not approved */ }
  return { ...r, body: { ...(r.body as object), setApproval: ctx.setApproval(world), setKey, ...(ctx.approvedKeys ? { setKeys: ctx.approvedKeys(world) } : {}) } }
}

const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {})

export async function handleBible(ctx: BibleCtx, method: string, sub: string, query: URLSearchParams, body: unknown): Promise<Reply> {
  try {
    const { store } = ctx
    if (method === 'GET' && sub === '') {
      const world = String(query.get('world') ?? '')
      store.worldDir(world)
      const running = ctx.running?.(world) ?? null
      // a draw still in flight owns its intents; only a finished or dead one's are completed here
      const unrecovered = running ? [] : await ctx.complete?.(world)
      return withApproval(ctx, world, ok(await store.get(world), running, unrecovered))
    }
    if (method !== 'POST') return fail(405, 'method not allowed')
    const b = obj(body)
    const world = String(b.worldId ?? '')
    switch (sub) {
      case '': {
        const { worldId: _w, ...rest } = b
        return ok(await store.save(world, rest))
      }
      // free, writes nothing, needs no world: what the save and element routes would refuse for this design (Build the set's check)
      case '/check': { const errors = store.check(b); return { status: 200, body: { ok: errors.length === 0, errors } } }
      case '/element': return ok(await store.upsertElement(world, b.element))
      case '/element/remove': return ok(await store.removeElement(world, String(b.tag ?? '')))
      case '/approve':
        if (!isMasterId(b.masterId)) return fail(400, 'bad master id')
        return ok(await store.approve(world, b.masterId))
      case '/set/approve': { // free: the owner approves the set as it stands (setApproval.ts)
        store.worldDir(world)
        if (!ctx.setKey) return fail(404, 'no such route')
        const key = ctx.setKey(world)
        if (key === null) return fail(409, 'This scene has no set to approve yet. Build the set first.')
        // (review F1) an optional setKey: the scene's current key, or a locked take's own set on this world; anything else is refused
        const sent = b.setKey === undefined || b.setKey === null || b.setKey === key ? { key, scene: true } : ctx.approvable?.(world, b.setKey) ?? null
        if (!sent) return fail(409, NOT_APPROVABLE)
        await store.approveSet(world, sent.key, { scene: sent.scene })
        return withApproval(ctx, world, ok(await store.get(world)))
      }
      case '/master': {
        store.worldDir(world)
        if (!ctx.drawMaster) return { status: NOT_BUILT.status, body: { error: NOT_BUILT.error, code: NOT_BUILT.code } }
        return ok(await ctx.drawMaster(await store.get(world), b as unknown as BibleMasterRequest))
      }
      case '/master/preview': {
        store.worldDir(world)
        if (!ctx.previewMaster) return fail(404, 'no such route')
        return { status: 200, body: await ctx.previewMaster(await store.get(world), b) }
      }
      default: return fail(404, 'no such route')
    }
  } catch (e) {
    if (e instanceof BibleError) return fail(e.status, e.message)
    // the paid draw's refusals (busy 409, budget 429, no target 503, a lost output 422 with its job id to recover) keep their status
    const x = e as { status?: unknown; jobId?: unknown; running?: unknown }
    const status = typeof x.status === 'number' && x.status >= 400 && x.status < 600 ? x.status : 500
    return { status, body: { error: e instanceof Error ? e.message : String(e), ...(typeof x.jobId === 'string' ? { jobId: x.jobId } : {}), ...(x.running ? { running: x.running } : {}) } }
  }
}
