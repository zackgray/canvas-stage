/**
 * The still judge (troubleshooting item 2): before a still is approved, every STAGED person (the hero, played by the performance's
 * castId card, and each extra bound to a Bible tag) at 100 % beside their cast card, with a plain verdict on whether the still has
 * them where the clay puts them, plus the set pieces in view that have a board tile (what a prop redraw can work on). Free and local:
 * the clay's ID pass at the still's frame (figures.ts for the boxes, idMask.ts for the outlines), outlineMatch.ts for the verdict.
 * Read-only. A take on a panorama world has no clay: the judge says so and flags nothing.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { ClayExport, TakeRecord } from '../../src/shared/shotContract.ts'
import type { KitWorld } from '../stage3d/types.ts'
import { readBibleFile } from '../bible/read.ts'
import { stagedPeople } from '../stage3d/stagedPeople.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { castFace } from './castCard.ts'
import { countFaces, type FaceDeps } from './faceCount.ts'
import { figuresAt, type Figure } from './figures.ts'
import { boundsOf, colourMask, faceOval, padBox, readPng, scaleMask, sharedColour, type Mask, type Rgba } from './idMask.ts'
import { bibleFile, cameraAt, clayDirOf, startOf } from './kitInputs.ts'
import type { KitStill } from './kitSpec.ts'
import { elementOf } from './kitStillPrompt.ts'
import { outlineMatch } from './outlineMatch.ts'
import { FACE_REDRAW_CR, PERSON_MIN_MATCH, PROP_REDRAW_CR, type StagedPerson, type StillJudge, type StillPiece } from './redrawSpec.ts'
import { heroDirOf, HeroHttpError } from './store.ts'

/** fewer ID pixels than this is a speck at the frame's edge, not a person or a piece to redraw */
const MIN_PERSON_PX = 40
const MIN_PIECE_PX = 400

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }
const urlOf = (publicDir: string, file: string) => `/${path.relative(publicDir, file).split(path.sep).join('/')}`

/** who is staged (the one definition, stage3d/stagedPeople.ts), with the name a person with no card is shown by */
export const stagedOf = (kit: KitWorld, bible: BibleRecord | null): { entity: string; cardId: string | null; fallback: string }[] =>
  stagedPeople(kit.perf, bible).map((s) => ({ entity: s.subject, cardId: s.cardId, fallback: s.tag ? `@${s.tag}` : 'The performer' }))

/** the clay's ID frame at `frame` with its colour table, or null when the take's clay has none there */
export function idFrameAt(publicDir: string, take: Pick<TakeRecord, 'id' | 'startKey'>, frame: number): { img: Rgba; colors: Record<string, [number, number, number]> } | null {
  const dir = clayDirOf(publicDir, take.id)
  const clay = readJson<ClayExport>(path.join(dir, 'clay.json'))
  const id = clay?.idPass
  const file = path.join(dir, `id_${String(frame).padStart(3, '0')}.png`)
  if (!clay || clay.startKey !== take.startKey || !id || !id.frames.includes(frame) || !existsSync(file)) return null
  return { img: readPng(file), colors: id.colors }
}

/** one entity's mask on the still's pixels; null = its colour is not in the table or another tag wears it */
export function entityMask(idf: NonNullable<ReturnType<typeof idFrameAt>>, entity: string, w: number, h: number): Mask | null {
  if (sharedColour(idf.colors, entity)) return null
  return scaleMask(colourMask(idf.img, idf.colors[entity]), w, h)
}

const boxOfFigure = (f: Figure, w: number, h: number) =>
  padBox({ x0: Math.max(0, f.x0 * w), y0: Math.max(0, f.top * h), x1: Math.min(w - 1, f.x1 * w - 1), y1: Math.min(h - 1, f.bottom * h - 1) }, w, h, 0.25, 64)

/** `faceDeps` absent = no face count (faces: null) */
export async function judgeStill(publicDir: string, take: TakeRecord, still: KitStill, faceDeps?: FaceDeps): Promise<StillJudge> {
  const file = path.join(heroDirOf(publicDir, take.id), `${still.id}.png`)
  if (!existsSync(file)) throw new HeroHttpError(404, `${still.id} has no picture on disk`, 'not_found')
  const img = readPng(file), W = img.width, H = img.height
  const frame = still.frame ?? 0
  const layout = still.layout ?? null
  const base = { stillId: still.id, frame, width: W, height: H, layout, prices: { face: FACE_REDRAW_CR, prop: PROP_REDRAW_CR } }
  const kit = takeKitWorldFor(publicDir, take)
  if (!kit) return { ...base, kit: false, people: [], pieces: [], faces: null, flagged: !!layout && !layout.ok }
  const bible = readBibleFile(publicDir, take.worldId)
  const idf = idFrameAt(publicDir, take, frame)
  const figures = figuresAt(clayDirOf(publicDir, take.id), frame, startOf(kit), cameraAt(publicDir, take, frame)) ?? []
  const people: StagedPerson[] = []
  for (const s of stagedOf(kit, bible)) {
    const card = await castFace(publicDir, s.cardId ?? undefined)
    const who = { entity: s.entity, name: card?.name || s.fallback, cardId: s.cardId, cardUrl: card ? urlOf(publicDir, card.faceFile) : null }
    const fig = figures.find((f) => f.tag === s.entity)
    const m = idf ? entityMask(idf, s.entity, W, H) : null
    const b = m ? boundsOf(m) : null
    // the ID pass drew everyone in view: no colour for them, or too few pixels, is "not in this frame"
    if (idf && (!idf.colors[s.entity] || (m && (!b || b.n < MIN_PERSON_PX)))) { people.push({ ...who, box: null, face: null, status: 'offscreen', match: null }); continue }
    if (!m || !b) { people.push({ ...who, box: fig ? boxOfFigure(fig, W, H) : null, face: null, status: 'unknown', match: null }); continue }
    const box = fig ? boxOfFigure(fig, W, H) : padBox(b, W, H, 0.25, 64)
    const match = outlineMatch(img, m, box, b.y1 - b.y0 + 1)
    people.push({ ...who, box, face: faceOval(m), status: match === null ? 'unknown' : match >= PERSON_MIN_MATCH ? 'ok' : 'off', match })
  }
  const pieces: StillPiece[] = []
  if (idf) for (const tag of Object.keys(idf.colors)) {
    if (!tag.startsWith('prop:')) continue
    const el = elementOf(bible, { kind: tag.slice(5), pieceTag: tag })
    const tile = el?.refs.find((r) => !!bibleFile(publicDir, r))
    const m = tile ? entityMask(idf, tag, W, H) : null
    const b = m ? boundsOf(m) : null
    if (!el || !tile || !b || b.n < MIN_PIECE_PX) continue
    pieces.push({ tag: el.tag, line: el.line, tileUrl: tile.startsWith('/') ? tile : `/${tile}`, box: padBox(b, W, H, 0.1, 64) })
  }
  const expected = people.filter((p) => p.status !== 'offscreen').length
  const counted = faceDeps ? await countFaces(faceDeps, file) : null
  const faces = counted && { ...counted, expected }
  const flagged = people.some((p) => p.status === 'off' || p.status === 'unknown') || (!!faces && faces.seen > expected) || (!!layout && !layout.ok)
  return { ...base, kit: true, people, pieces, faces, flagged }
}
