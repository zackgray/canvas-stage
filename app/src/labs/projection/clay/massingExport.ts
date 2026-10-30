// The massing clay of a kit take (recipe wave, E139 "two clays from one scene"): while the precise clay exports, each frame is
// rendered once more with every generated piece swapped for its massing mesh (glbPiece.ts setMassing) and uploaded beside the
// precise clay, under shots/<take>/clay/massing/ (server/pieces/massingClay.ts names the files). Only when the set has a piece with
// a massing mesh. Model-facing (the still's depth control, the Layout-To-Render video); the precise clay stays what it was.
// A massing failure never fails the precise clay: it is reported, and the joining track falls back to the precise depth.
// (tidy wave) The massing video is encoded by the clay finish, beside clay.mp4 (server/clay/service.ts), not by a finish of its
// own awaited before the precise one (its old route, /__lab/pieces/massing-finish, is gone).
import type { Stage } from '../engine/Stage'
import type { WarpFrame, WarpPlan } from '../performance/warpPlan'
import { setMassing } from '../../../stage3d/glbPiece'
import type { Fetch } from './api'
import { grabFrame, type Grabbed, type KitFrameCapture } from './kitCapture'

export const PIECES_ROUTE = '/__lab/pieces'

/** the set on the stage has a generated piece with a massing mesh */
export const hasMassing = (stage: Stage): boolean => !!stage.kit?.plan?.kit?.some((it) => it.glb?.massingUrl)

/** one frame drawn with the massing meshes shown (precise ones hidden), and its metric depth, still encoding; the precise meshes
 *  come back as soon as it is drawn */
export async function massingFrame(cap: KitFrameCapture, stage: Stage, f: WarpFrame, pose: WarpPlan['poses'][number]): Promise<Grabbed> {
  setMassing(stage.scene, true)
  try { return await grabFrame(cap, stage, f, pose) } finally { setMassing(stage.scene, false) }
}

async function ok(res: Response): Promise<unknown> {
  const b = await res.json().catch(() => ({})) as { error?: string }
  if (!res.ok) throw new Error(b.error ?? `HTTP ${res.status}`)
  return b
}

export async function uploadMassing(takeId: string, frame: number, kind: 'final' | 'zdepth', body: Uint8Array, f: Fetch = fetch): Promise<void> {
  const q = new URLSearchParams({ take: takeId, frame: String(frame), kind })
  await ok(await f(`${PIECES_ROUTE}/massing-frame?${q}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: body as BodyInit }))
}
