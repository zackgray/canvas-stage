/**
 * Who plays the 3D performer on a kit world (Stage3D, wave 2). A mocap performer has no perform session, so the face cannot come
 * from a lifted pack: it comes from the project's cast card the world's performance names (performance.json `castId`, picked in
 * Perform, which saves the card it shows). Only the studio's project (DEFAULT_PROJECT, the one Cast and Perform edit) is read: a
 * card id in another project is never matched, and no `castId` resolves no one (the hero refuses that before any spend). The card's
 * newest version, its face image as the panorama path picks it (references[1], else sheets[4]). Read-only; null when the card is
 * not there or has no face on disk.
 */
import { DEFAULT_PROJECT } from '../../src/project/model.ts'
import { ProjectStore } from '../project/store.ts'
import { assetFile } from './face.ts'

export interface CastFace { cardId: string; name: string; description: string; faceFile: string }

/** the plain words a kit hero or kit Layout-To-Render answers (409) when the world's performance names no cast card. A rebuilt set
 *  names nobody though the looks are kept (review F9), so the free "Plays the subject" press comes first, a new look only if none */
export const NO_KIT_CAST = 'No one plays the person yet: on the Stage pick The subject and press Plays the subject beside their look (free), or make their look if they have none.'

export async function castFace(publicDir: string, castId?: string): Promise<CastFace | null> {
  if (!castId) return null
  const project = await new ProjectStore(publicDir).read(DEFAULT_PROJECT).catch(() => null)
  const c = project?.ingredients.cast.find((x) => x.id === castId)
  const v = c?.versions.at(-1)
  if (!c || !v) return null
  const face = assetFile(publicDir, v.payload.references[1] ?? v.payload.sheets[4])
  return face ? { cardId: c.id, name: v.payload.name || c.name, description: v.payload.description, faceFile: face } : null
}

/** The card's gear image (the full-body front: references[0], else sheets[0]) for the kit still's Klein finish; null = none on disk. */
export async function castGear(publicDir: string, castId?: string | null): Promise<string | null> {
  if (!castId) return null
  const project = await new ProjectStore(publicDir).read(DEFAULT_PROJECT).catch(() => null)
  const v = project?.ingredients.cast.find((x) => x.id === castId)?.versions.at(-1)
  return v ? assetFile(publicDir, v.payload.references[0] ?? v.payload.sheets[0]) : null
}
