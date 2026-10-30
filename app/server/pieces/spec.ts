/**
 * Generated set pieces (recipe wave, Track D; E136/E137/E139): the shared names of a "Build in 3D" press. One approved board PROP
 * tile -> one TRELLIS.2 shape-only mesh at 1024 (one Cloud job) -> its massing clay (free, local) -> a KitItem with `glb` in the
 * world's plan. Owner: layout clay, not hero props, so no texture, polish or cleanup steps. Files, per world and tile, per press:
 *   public/lab-assets/locations/<loc-…>/pieces/<tag>/<run>/
 *     intent.json   written BEFORE the job (what was pressed, the price); a billed job can always be put back from it
 *     mesh.glb      the job's output (TRELLIS.2, ~0.7 MB, 30k faces)
 *     massing.glb   scripts/pieces/massing.py's (absent when Python could not run it: the piece is placed without one)
 *     piece.json    written LAST, once the piece is in the plan: its existence is what makes the piece placed
 */
import path from 'node:path'

export const PIECES_ROUTE = '/__lab/pieces'
export const PIECES_KEY = 'set-piece'
const LABEL = 'piece-build '
export const isPieceLabel = (label: string) => label.startsWith(LABEL)
export const pieceLabel = (world: string, tag: string, run: string) => `${LABEL}${world} ${tag} ${run}`
export const labelParts = (label: string) => { const [, world, tag, run] = label.split(' '); return { world, tag, run } }

/**
 * credits on the button, re-based 2026-10-28 from the app's own Build in 3D rows (server/priceBasis.ts): 7 first (cold), then
 * 3, 4, 4, 4, 4, 2 billed (n=7), so 8 sits just over the cold one. E136's experiment meshes (7-11) ran before the app's graph.
 */
export const PIECE_CR = 8

/** TRELLIS.2 and its encoders live in Cloud's model library but in no loader combo of object_info (E136): validation lets exactly these through */
export const TRELLIS = 'trellis_2_int8_convrot.safetensors'
export const PIECE_MODELS = [TRELLIS, 'trellis_2_shape_vae_bf16.safetensors', 'dino_v3_L_naf_fp32.safetensors']

/** the graph's output node (SaveGLB) and the image loader the tile is bound to */
export const NODES = { image: 'img', glb: 'glb' } as const

export const RUN_RE = /^p-\d{14}-[a-z0-9]{4}$/
export const TAG_RE = /^[a-z][a-z0-9_-]{0,31}$/

export const FILES = { intent: 'intent.json', mesh: 'mesh.glb', massing: 'massing.glb', piece: 'piece.json' } as const

export const piecesDir = (publicDir: string, world: string) => path.join(publicDir, 'lab-assets', 'locations', world, 'pieces')
export const runDir = (publicDir: string, world: string, tag: string, run: string) => path.join(piecesDir(publicDir, world), tag, run)
export const runUrl = (world: string, tag: string, run: string, file: string) => `/lab-assets/locations/${world}/pieces/${tag}/${run}/${file}`

/** what a press wrote before its job */
export interface PieceIntent {
  world: string; scene: string; tag: string; run: string
  /** the piece's plain noun (the tile's name), its board look and that look's file */
  kind: string; name: string; look: string
  estimate: number; createdAt: string
}

/** a placed piece (piece.json) */
export interface PieceRecord {
  world: string; tag: string; run: string; kind: string
  url: string; massingUrl: string | null
  jobId: string | null; credits: number | null
  /** where it went: replacing the planner's kit item for the same noun, or a free spot near the set centre */
  placed: 'replaced' | 'free' | 'rebuilt'
  massingNote?: string
  placedAt: string
}

export type PieceStatus = 'none' | 'building' | 'landed' | 'placed' | 'failed'

/** one approved prop tile as the Set step shows it */
export interface PieceTileState {
  tag: string; name: string; look: string
  status: PieceStatus
  /** the run the status is of */
  run?: string
  /** a billed job whose mesh never landed: Recover fetches it by id (free), then the piece is placed */
  recover?: { jobId: string }
  error?: string
  piece?: PieceRecord
}

export interface PiecesResponse {
  price: number
  tiles: PieceTileState[]
  running: { since: string; what: string } | null
  /** when a piece last landed in or moved on this set (null = never): a master drawn before it describes another set */
  setChangedAt: string | null
  /** the set's clay view (still.png) predates that change: the Set step renders it again (free, in the page) */
  stillStale: boolean
}
