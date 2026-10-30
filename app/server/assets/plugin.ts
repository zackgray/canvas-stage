/**
 * Dev-only static mounts for lab assets that are written after the server starts. Vite caches the public-file list at
 * startup and these folders are watch-ignored, so a render or a location file written later would 404 from the public
 * dir; serve them straight from disk (GET/HEAD, fixed file types, path-checked).
 *   /lab-assets/renders     png + json
 *   /lab-assets/locations   png + json, footage takes (mp4) and strips (jpg), Scene's uploaded Bible references (jpg/webp),
 *                           generated set pieces' meshes (glb: pieces/<tag>/<run>/mesh.glb + massing.glb)
 * A type missing here falls through to Vite's stale index and comes back as index.html with a 200: the "beehive" piece built
 * mid-session loaded as `Unexpected token '<'` (2026-10-25) because glb was not on this list.
 */
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin } from 'vite'
import { serveMp4 } from '../perform/serve.ts'

type Typer = (rel: string) => string | null

export function mount(dir: string, typeOf: Typer, mp4?: RegExp): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    let rel: string
    try { rel = decodeURIComponent(new URL(req.url ?? '', 'http://lab').pathname).replace(/^\/+/, '') } catch { return next() } // a malformed %
    const file = path.resolve(dir, rel)
    if (!file.startsWith(dir + path.sep) || !existsSync(file)) return next()
    if (mp4?.test(rel)) return serveMp4(req, res, file)
    const type = typeOf(rel)
    if (!type) return next()
    res.setHeader('content-type', type)
    res.setHeader('cache-control', 'no-cache')
    if (req.method === 'HEAD') return void res.end()
    createReadStream(file).on('error', () => { res.statusCode = 500; res.end() }).pipe(res)
  }
}

const pngOrJson: Typer = (rel) => (rel.endsWith('.png') ? 'image/png' : rel.endsWith('.json') ? 'application/json' : null)

const PIECE_GLB = /^loc-[\w-]+\/pieces\/[\w.-]+\/[\w.-]+\/[\w.-]+\.glb$/

export const locationType: Typer = (rel) =>
  pngOrJson(rel)
  ?? (PIECE_GLB.test(rel) ? 'model/gltf-binary' : null)
  ?? (rel.endsWith('.jpg') && rel.startsWith('footage/') ? 'image/jpeg'
    // Scene's uploaded references, moved into a Bible at Build the set (server/scene/draft.ts)
    : /^loc-[\w-]+\/bible\/elements\/[\w.-]+\.(jpg|webp)$/.test(rel) ? (rel.endsWith('.jpg') ? 'image/jpeg' : 'image/webp') : null)

export function labAssets(): Plugin {
  return {
    name: 'lab-assets',
    apply: 'serve',
    config: () => ({ server: { watch: { ignored: ['**/public/lab-assets/locations/**'] } } }),
    configureServer(server) {
      const publicDir = server.config.publicDir || path.join(server.config.root, 'public')
      server.middlewares.use('/lab-assets/renders', mount(path.join(publicDir, 'lab-assets', 'renders'), pngOrJson))
      server.middlewares.use('/lab-assets/locations', mount(path.join(publicDir, 'lab-assets', 'locations'), locationType, /^footage\/ft[a-z0-9]+\/take\.mp4$/))
    },
  }
}
