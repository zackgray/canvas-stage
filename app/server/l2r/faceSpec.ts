/**
 * The face detail pass (recipe step 6, E143 arm s): ids, labels, folders and the price. Pure apart from path joins.
 * Files: shots/<take>/l2r/face/<renderId>/<subject>/ holds the free track (track.json, strip.png, window.json, win-raw.mp4, the
 * Klein inputs); shots/<take>/l2r/face/<renderId>/<passId>/ holds one paid pass (the window render, the pasted raw, the finished
 * after, the crops). The pass's candidate is server/passes'.
 */
import path from 'node:path'
import { publicUrl, shotDirs } from './spec.ts'

export const FACE_KEY = 'l2r-face'
/** the window render's square size (stage 1 at half) and the window L2R's seed (E143) */
export const FACE_WIN = 1088
export const FACE_SEED = 42
/** a head this tall at 1920 or more is not small: the render already resolves the face */
export const FACE_SMALL_PX = 150
/** below this the window would need more than ~7x upscaling (E143: untested under ~30 px faces) */
export const FACE_MIN_PX = 16

/** the subjects a pass names: the hero, or an extra's ID-pass tag ('extra:<index>:<variant>') */
export const SUBJECT_RE = /^(hero|extra:\d{1,3}:\d{1,3})$/
/** a folder-safe name for a subject */
export const subjectDir = (subject: string) => subject.replace(/:/g, '-')

/** `l2r-face take-… l2r-… pass-…`: the runner's label, how a running pass's job is found again after a reload */
export const faceLabel = (takeId: string, renderId: string, passId: string) => `l2r-face ${takeId} ${renderId} ${passId}`
export const isFaceLabel = (label: string) => /^l2r-face take-[\w-]+ l2r-[\w-]+ pass-[\w-]+$/.test(label)

/**
 * The price on the button, rounded up. E143's ledger (tag E143): the Klein face redraw 3 cr; one 49-frame 1088² window arm
 * 3.5 cr warm, 8.5 cr cold (two arms per job: 7 and 17). So 3 + the cold arm scaled by frames (8.5 x frames / 49) = 12 cr at 49
 * frames, against E143's "about 7-12 cr per face". Held on that measured arm, not on the wide's seed curve (which was re-based up
 * from the app's own renders and would drag this up with it). No billed face-pass row from the app yet: re-base on the first.
 */
export const FACE_PASS_REDRAW_CR = 3
export const FACE_ARM_COLD_CR_49F = 8.5
export const facePassCredits = (frames: number) => Math.ceil(FACE_PASS_REDRAW_CR + (FACE_ARM_COLD_CR_49F * frames) / 49 - 1e-9)

export function faceDirs(publicDir: string, takeId: string, renderId: string) {
  const root = path.join(shotDirs(publicDir, takeId).l2r, 'face', renderId)
  return { root, subject: (s: string) => path.join(root, subjectDir(s)), pass: (passId: string) => path.join(root, passId) }
}
export const faceUrl = (takeId: string, renderId: string, ...parts: string[]) => publicUrl(takeId, 'l2r', ['face', renderId, ...parts].join('/'))
