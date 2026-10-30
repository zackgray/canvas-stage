/// <reference types="vitest/config" />
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import { labAssets } from './server/assets/plugin.ts'
import { labBible } from './server/bible/plugin.ts'
import { labClay } from './server/clay/plugin.ts'
import { labCast } from './server/cast/plugin.ts'
import { labCut } from './server/cut/plugin.ts'
import { labFrameEdit } from './server/frameEdit/plugin.ts'
import { labHero } from './server/hero/plugin.ts'
import { refuseForeign } from './server/guard.ts'
import { labJobs } from './server/jobs/plugin.ts'
import { labL2R } from './server/l2r/plugin.ts'
import { labMotion } from './server/motion/plugin.ts'
import { labPasses } from './server/passes/plugin.ts'
import { labProject } from './server/project/plugin.ts'
import { labScene } from './server/scene/plugin.ts'
import { labLibrary } from './server/scene/libraryPlugin.ts'
import { labStage3D } from './server/stage3d/plugin.ts'
import { labPieces } from './server/pieces/plugin.ts'
import { labTakes } from './server/takes/plugin.ts'
import { trackerPlugin } from './server/tracker/plugin.ts'

const RENDERS_DIR = 'public/lab-assets/renders'
/** Largest single export file accepted (a 16-bit guide frame or an RGBA still is a few MB). */
const SAVE_LIMIT = 64 * 1024 * 1024

/**
 * Dev-only: POST /__lab/save?path=<folder/file> writes the request body under public/lab-assets/renders/
 * (gitignored). Used by the labs to export renders, masks and depth guides. Local pages only (server/guard.ts),
 * bodies capped at SAVE_LIMIT.
 */
export function labSave(): Plugin {
  return {
    name: 'lab-save',
    apply: 'serve',
    configureServer(server) {
      const root = path.resolve(server.config.root, RENDERS_DIR)
      server.middlewares.use('/__lab/save', (req, res) => {
        const fail = (code: number, msg: string) => { res.statusCode = code; res.end(msg) }
        if (req.method !== 'POST') return fail(405, 'POST only')
        const refused = refuseForeign(req) // binary bodies: origin checks only
        if (refused) return fail(refused.status, refused.message)
        const rel = new URL(req.url ?? '', 'http://lab').searchParams.get('path') ?? ''
        if (!/^[\w\-./]+$/.test(rel) || rel.split('/').some((p) => p === '..' || p === '')) {
          return fail(400, 'bad path')
        }
        const target = path.resolve(root, rel)
        if (!target.startsWith(root + path.sep)) return fail(400, 'bad path')
        const chunks: Buffer[] = []
        let size = 0
        let tooLarge = false
        req.on('data', (c: Buffer) => {
          size += c.length
          if (size <= SAVE_LIMIT) return void chunks.push(c)
          if (!tooLarge) { tooLarge = true; chunks.length = 0; res.setHeader('connection', 'close'); fail(413, 'body too large') }
        })
        req.on('end', async () => {
          if (tooLarge) return
          try {
            await mkdir(path.dirname(target), { recursive: true })
            await writeFile(target, Buffer.concat(chunks))
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, path: `/lab-assets/renders/${rel}` }))
          } catch (e) {
            fail(500, String(e))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Server-side only (no VITE_ prefix, never `define`d): the plugins that run Comfy jobs read it.
  // Under Vitest the key is never loaded, so the suite runs as in a fresh clone with no app/.env and cannot bill.
  const env: Record<string, string | undefined> = process.env.VITEST ? {} : loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), labSave(), trackerPlugin(), labAssets(),
      labJobs({ COMFY_API_KEY: env.COMFY_API_KEY, COMFY_BASE_URL: env.COMFY_BASE_URL, CANVAS_DAY_BUDGET: env.CANVAS_DAY_BUDGET }),
      // the scene library, and the record of every paid job per scene: mounted BEFORE the paid routes below, so it sees their replies
      labLibrary(),
      labCast({ COMFY_API_KEY: env.COMFY_API_KEY, COMFY_BASE_URL: env.COMFY_BASE_URL }),
      labCut(),
      labProject(),
      // Stage3D kit worlds (free): plan.json + performance.json + the master still under locations/<loc-…>/
      labStage3D(),
      labPieces({ COMFY_API_KEY: env.COMFY_API_KEY, COMFY_BASE_URL: env.COMFY_BASE_URL }), // (recipe wave) generated set pieces, paid: Build in 3D
      // Wave B (docs/wave-b-contract.md): a locked take, its clay, hero stills and the Layout-To-Render pass, under public/lab-assets/shots/
      labTakes(),
      labClay(), // the Python setting is read by server/python.ts alone (CANVAS_PYTHON, LIFT_PYTHON the older name)
      labHero({ COMFY_API_KEY: env.COMFY_API_KEY, COMFY_BASE_URL: env.COMFY_BASE_URL }),
      // "Edit this frame" (owner 10-28): the plain Qwen still edit; its versions are hero stills, under the hero section's key
      labFrameEdit({ COMFY_API_KEY: env.COMFY_API_KEY, COMFY_BASE_URL: env.COMFY_BASE_URL }),
      labL2R({ COMFY_API_KEY: env.COMFY_API_KEY, COMFY_BASE_URL: env.COMFY_BASE_URL }),
      labPasses(), // Keep / Discard for pass candidates (free; wave-3 passes plug in appliers)
      // Made moves (free): the owner's own motion computer, proxied per docs/motion-box-contract.md; an unset
      // MOTION_BOX_URL turns the generator off (the panel says so; ready-made moves still work)
      labMotion({ MOTION_BOX_URL: env.MOTION_BOX_URL, MOTION_BOX_TOKEN: env.MOTION_BOX_TOKEN }),
      // Wave 0.5 (docs/preproduction-plan-fable.md): the scene Bible under locations/<loc-…>/bible/ (track A1)
      labBible({ COMFY_API_KEY: env.COMFY_API_KEY, COMFY_BASE_URL: env.COMFY_BASE_URL }),
      // Scene's design before a world: concept candidates (paid), the draft design, uploads, the move into a Bible
      labScene({ COMFY_API_KEY: env.COMFY_API_KEY, COMFY_BASE_URL: env.COMFY_BASE_URL })],
    server: {
      // exported renders must not trigger reloads mid-export
      // (Cut exports to cuts/; locations/ is served from disk by server/assets; Wave B writes to shots/)
      watch: { ignored: ['**/public/lab-assets/renders/**', '**/public/lab-assets/cuts/**', '**/public/lab-assets/locations/footage/**', '**/public/lab-assets/shots/**', '**/public/lab-assets/locations/*/bible/**'] },
    },
    // fails the run if any test wrote the real credit ledger (server/__tests__/ledger-guard.ts)
    // experiments/lib/e20-graphs.test.ts tests the deleted look graph (legacy removal, tag contest-fallback-2026-10-23 has it)
    test: { globalSetup: ['./server/__tests__/ledger-guard.ts'], exclude: [...configDefaults.exclude, 'experiments/lib/e20-graphs.test.ts'] },
  }
})
