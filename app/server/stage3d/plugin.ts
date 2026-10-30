/**
 * Kit worlds (Stage3D), at /__lab/stage3d. Local pages only (server/guard.ts); free: nothing here spends.
 *   GET  /worlds                          -> { worlds: KitWorld[] } (newest first)
 *   GET  /world?id=loc-…                  -> KitWorld
 *   POST /world        { plan, perf?, description?, scene? }   -> 201 KitWorld (422 { error, errors } when parsePlan refuses the plan);
 *                      with `scene` (a library scene id) the world is attached to that scene in the same request and becomes its
 *                      current set (404 before anything is written when the scene does not exist; libraryContract.ts)
 *   POST /still?id=loc-…   PNG body (1920 x 1088)       -> KitWorld (the world is listed in locations/manifest.json now)
 *   POST /performance?id=loc-…   PerformancePlan        -> KitWorld
 *   POST /master-depth?id=loc-…  16-bit grey PNG (1920 x 1088) -> KitWorld (the master view's metric depth, for the Bible master draw)
 *   POST /piece?id=loc-…   { index, kind, at, yawDeg? }  -> KitWorld (recipe wave: one kit piece dragged or turned in the top view;
 *                      409 when kit[index] is no longer that kind, 422 when the plan refuses it; stamps the set changed, store.changeKit;
 *                      Track C: also scale, lift (metres above the ground, -2..10), remove: true, label (the piece's own words,
 *                      '' clears it) or swapTo (the piece becomes another kind, its place kept), or { add: { kind, ... } } for a
 *                      new piece, server/stage3d/pieceEdit.ts)
 *   POST /mark?id=loc-...  { at: [x, z], yawDeg? }  -> KitWorld (the subject's mark, plan.mark; stamps the set changed)
 *   POST /reset?id=loc-... {}  -> KitWorld (Reset the set: every piece and the mark back where Build the set placed them; free; stamps
 *                      the set changed; 409 for a set built before the built copy was kept, builtPlan.ts)
 *   POST /ground?id=loc-... { ground: 'flat' | 'rolling' }  -> KitWorld (the ground's shape, plan.ground; free; a set change: stamps the
 *                      set changed and drops the master depth; 400 for anything else)
 *   POST /light?id=loc-... { keyDir: [yaw, elevation] }  -> KitWorld (the sun: plan.light.keyDir, the field the planner writes; free;
 *                      stamps the set changed, keeps the master depth; 400 outside the plan's ranges)
 *   POST /sky?id=loc-...   { look }  -> KitWorld (the sky's look, plan.sky.look — the same field the planner writes; free,
 *                      400 when the look is not one of the plan's; stamps the set changed like any other set change, so the
 *                      free set approval goes stale until it is approved again)
 */
import type { IncomingMessage } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { readBody, send } from '../crossview/http.ts'
import { refuseForeign } from '../guard.ts'
import { SCENE_ID_RE } from '../../src/shared/libraryContract.ts'
import { SceneLibrary } from '../scene/library.ts'
import { KitError, KitStore } from './store.ts'
import { resetToBuilt } from './builtPlan.ts'
import type { CreateKitRequest } from './types.ts'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const STAGE3D_ROUTE = '/__lab/stage3d'
const JSON_LIMIT = 512 * 1024
const STILL_LIMIT = 24 * 1024 * 1024

export interface Stage3DOverrides { publicDir?: string; now?: () => Date }

export function readBinary(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0, over = false
    req.on('data', (c: Buffer) => {
      size += c.length
      // past the limit the rest is read and thrown away, so the 413 reaches the page; a socket destroyed first shows there as a network error
      if (size > limit) { chunks.length = 0; if (!over) { over = true; reject(new KitError(413, 'body too large')) } } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function jsonBody(req: IncomingMessage): Promise<unknown> {
  try { return JSON.parse(await readBody(req, JSON_LIMIT)) } catch (e) {
    const status = (e as { status?: number }).status
    throw new KitError(status ?? 400, status ? (e as Error).message : 'body must be JSON')
  }
}

export function labStage3D(_env: Record<string, string | undefined> = {}, over: Stage3DOverrides = {}): Plugin {
  const store = new KitStore(over.publicDir ?? path.join(APP, 'public'))
  const library = new SceneLibrary(over.publicDir ?? path.join(APP, 'public'), over.now)
  const now = () => over.now?.() ?? new Date()
  return {
    name: 'lab-stage3d',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(STAGE3D_ROUTE, (req, res) => {
        void (async () => {
          const url = new URL(req.url ?? '/', 'http://lab')
          const route = url.pathname.replace(/\/+$/, '') || '/'
          const id = url.searchParams.get('id') ?? ''
          try {
            if (req.method === 'GET' && route === '/worlds') return send(res, 200, { worlds: store.list() })
            if (req.method === 'GET' && route === '/world') return send(res, 200, store.read(id))
            if (req.method !== 'POST') return send(res, 404, { error: 'no such route' })
            const refused = refuseForeign(req, { json: route !== '/still' && route !== '/master-depth' })
            if (refused) return send(res, refused.status, { error: refused.message })
            if (route === '/world') {
              const body = await jsonBody(req)
              if (!body || typeof body !== 'object' || Array.isArray(body)) throw new KitError(400, 'body must be { plan, perf?, description? }')
              const scene = (body as CreateKitRequest).scene
              if (scene !== undefined && !(typeof scene === 'string' && SCENE_ID_RE.test(scene) && library.read(scene))) throw new KitError(404, 'no such scene')
              // a stillless world a scene lists is that scene's set (its still upload failed): the sweep never takes it
              const world = store.create(body as CreateKitRequest, now(), (id) => !!library.ownerOf(id))
              if (typeof scene === 'string') await library.attachWorld(scene, world.id)
              return send(res, 201, world)
            }
            if (route === '/performance') return send(res, 200, store.savePerformance(id, await jsonBody(req)))
            if (route === '/plan') return send(res, 200, store.savePlan(id, await jsonBody(req), now()))
            if (route === '/piece') return send(res, 200, store.movePiece(id, await jsonBody(req), now()))
            if (route === '/mark') return send(res, 200, store.setMark(id, await jsonBody(req), now()))
            if (route === '/sky') return send(res, 200, store.saveSky(id, await jsonBody(req), now()))
            if (route === '/ground') return send(res, 200, store.saveGround(id, await jsonBody(req), now()))
            if (route === '/light') return send(res, 200, store.saveLight(id, await jsonBody(req), now()))
            if (route === '/reset') { await jsonBody(req); return send(res, 200, resetToBuilt(store, id, now())) }
            if (route === '/still') return send(res, 200, await store.writeStill(id, await readBinary(req, STILL_LIMIT), now()))
            if (route === '/master-depth') return send(res, 200, store.writeMasterDepth(id, await readBinary(req, STILL_LIMIT)))
            return send(res, 404, { error: 'no such route' })
          } catch (e) {
            if (res.headersSent) return
            if (e instanceof KitError) return send(res, e.status, { error: e.message, ...(e.errors.length ? { errors: e.errors } : {}) })
            send(res, 500, { error: e instanceof Error ? e.message : String(e) })
          }
        })()
      })
    },
  }
}
