/**
 * The preproduction chain's Comfy graphs (API format) as the submission's workflow files: workflows/<name>.api.json. Each entry
 * builds the graph exactly as the server sends it, with placeholder prompts; a test keeps the files in step (as Cast does), and
 * `npx tsx server/workflowSnapshots.ts` rewrites them after a graph change.
 *   hero_qwen2512-union-depth   a kit still or the Bible master: Qwen-Image 2512 held to the clay's depth by the Fun ControlNet Union (E130)
 *   hero_klein4b-finish      the Klein 4B finish of that still with face, gear and master references at 0.5 MP
 *   l2r_layout-to-render     LTX-2.5 + Layout-To-Render IC-LoRA from the clay video and the opening still
 *   l2r_layout-to-render-keyframes   the same with mid (0.7) and end (1.0) keyframe guides
 *   concept_qwen2512         Scene's concept candidates: Qwen-Image 2512 text-to-image, 50 steps (two images in one job)
 *   concept_qwen2512-lightning   the draft option: the same with the Lightning 4-step LoRA
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ApiGraph } from './comfy/index.ts'
import { buildKleinGraph } from './hero/kleinGraph.ts'
import { KLEIN_REF_MP } from './hero/kitSpec.ts'
import { buildQwenDepthGraph } from './hero/qwenGraph.ts'
import { l2rGraph } from './l2r/graph.ts'
import { buildConceptGraph } from './scene/conceptGraph.ts'

const L2R = { prompt: '<render prompt>', seed: 42, frames: 97, layoutSize: { w: 1920, h: 1088 }, prefix: 'canvas-stage/l2r' }

export const WORKFLOW_SNAPSHOTS: Record<string, () => ApiGraph> = {
  'hero_qwen2512-union-depth': () => buildQwenDepthGraph({ prompt: '<draw prompt>', seeds: [1], prefix: 'canvas-stage/hero-draw' }),
  'hero_klein4b-finish': () => buildKleinGraph([{ id: 'still', seed: 1, refs: ['rw0', 'rf', 'rg', 'rs'], prompt: '<card prompt>' }], 'canvas-stage/hero',
    { rw0: 'still0.png', rf: 'rf.png', rg: 'rg.png', rs: 'rs.png' }, { rf: KLEIN_REF_MP, rg: KLEIN_REF_MP, rs: KLEIN_REF_MP }),
  'l2r_layout-to-render': () => l2rGraph(L2R),
  'l2r_layout-to-render-keyframes': () => l2rGraph({ ...L2R, keys: { mid: { frame: 48, strength: 0.7 }, end: { frame: 96, strength: 1 } } }),
  'concept_qwen2512': () => buildConceptGraph({ prompt: '<concept prompt>', seeds: [1, 7920], quality: 'full', kind: 'location', prefix: 'canvas-stage/concept-location' }),
  'concept_qwen2512-lightning': () => buildConceptGraph({ prompt: '<concept prompt>', seeds: [1, 7920], quality: 'draft', kind: 'location', prefix: 'canvas-stage/concept-location' }),
}

export const WORKFLOWS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'workflows')
export const snapshotFile = (name: string) => path.join(WORKFLOWS_DIR, `${name}.api.json`)

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [name, build] of Object.entries(WORKFLOW_SNAPSHOTS)) writeFileSync(snapshotFile(name), JSON.stringify(build(), null, 1) + '\n')
}
