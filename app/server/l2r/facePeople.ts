/**
 * Who a face pass can fix on a render: every STAGED person of a kit take, the hero (played by perf.castId's card) and each extra
 * bound to a Bible cast element (`tag`), with the face they must end up wearing (their card's face) and how big their head is in
 * the clay's ID pass (top 13 % of the silhouette, E143). A face that is already big (FACE_SMALL_PX) is listed but not offered.
 * Read-only: the ID pass, the Bible, the project's cards.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { ClayExport, TakeRecord } from '../../src/shared/shotContract.ts'
import type { FacePersonView } from '../../src/studio/render/FacePassTypes.ts'
import { castFace, type CastFace } from '../hero/castCard.ts'
import { figuresFromId } from '../hero/figures.ts'
import type { ExtraPlan } from '../../src/stage3d/contract.ts'
import { stagedPeople } from '../stage3d/stagedPeople.ts'
import { takeKitWorldFor } from '../stage3d/takeKitWorldFor.ts'
import { FACE_MIN_PX, FACE_SMALL_PX } from './faceSpec.ts'
import { bibleOf } from './keyframes.ts'
import { shotDirs } from './spec.ts'

type Rgb = [number, number, number]
/** what the pass needs beyond the view: the card face file and the ID colour */
export interface FacePerson extends Omit<FacePersonView, 'track'> { cardId: string | null; faceFile: string | null; color: Rgb | null; description: string }

/** the share of a silhouette the head is (E143 track: top 13 %) */
const HEAD_SHARE = 0.13

export interface PeopleInput {
  castId?: string | null
  extras: ExtraPlan[]
  bible: BibleRecord | null
  /** ID-pass colour per entity tag (ClayIdPass.colors); null = the clay has no ID pass */
  colors: Record<string, Rgb> | null
  /** each figure's largest head height in px, over the ID keyframes */
  heads: Record<string, number>
  faces: Record<string, CastFace | null>
  /** the clay kept metric depth for every frame */
  depth: boolean
}

/** pure: the people and why each can or cannot be fixed */
export function peopleFrom(i: PeopleInput): FacePerson[] {
  // the one definition (stage3d/stagedPeople.ts): the hero and every tagged extra; an unbound extra is a background figure
  const staged = stagedPeople({ castId: i.castId, extras: i.extras }, i.bible)
  const shared = (c: Rgb | undefined) => !!c && Object.entries(i.colors ?? {}).filter(([, o]) => o.join() === c.join()).length > 1
  return staged.map((s) => {
    const face = s.cardId ? i.faces[s.cardId] ?? null : null
    const color = i.colors?.[s.subject] ?? null
    const headPx = i.heads[s.subject] ?? null
    const small = headPx !== null && headPx < FACE_SMALL_PX
    const why = !i.colors ? 'The 3D set preview has no ID pass: press Prepare the frames under the locked take on the Stage (free).'
      : !i.depth ? 'The 3D set preview kept no depth: press Prepare the frames under the locked take on the Stage (free).'
        : !color || headPx === null ? 'Not seen in the 3D set preview\'s ID pass.'
          : shared(color) ? 'Shares its ID colour with another figure, so the two cannot be told apart.'
            : !face ? (s.cardId ? 'Their cast card has no face image.' : s.tag ? `@${s.tag} is not a cast card in the scene sheet.` : 'No cast card plays the performer: pick one in the subject panel on the Stage.')
              : headPx < FACE_MIN_PX ? 'Too small to rescue: under the pass\'s smallest face.'
                : !small ? 'Big enough already: the render draws this face itself.' : null
    return { subject: s.subject, name: face?.name || (s.tag ? `@${s.tag}` : 'the performer'), headPx: headPx === null ? null : Math.round(headPx), small, why,
      cardId: s.cardId, faceFile: face?.faceFile ?? null, color, description: face?.description ?? '' }
  })
}

const readJson = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return null } }

/** the people of a take's render; [] for a panorama take (no staged cast) */
export async function facePeople(publicDir: string, take: TakeRecord): Promise<FacePerson[]> {
  const kit = takeKitWorldFor(publicDir, take)
  if (!kit) return []
  const clayDir = shotDirs(publicDir, take.id).clay
  const clay = readJson<ClayExport>(path.join(clayDir, 'clay.json'))
  const idp = clay?.idPass ?? null
  const heads: Record<string, number> = {}
  for (const f of idp?.frames ?? []) {
    const file = path.join(clayDir, `id_${String(f).padStart(3, '0')}.png`)
    if (!existsSync(file)) continue
    for (const g of figuresFromId(file, idp!.colors)) {
      const px = HEAD_SHARE * (Math.min(1, g.bottom) - Math.max(0, g.top)) * 1088
      heads[g.tag] = Math.max(heads[g.tag] ?? 0, px)
    }
  }
  const bible = bibleOf(publicDir, take.worldId)
  const extras = kit.perf.extras ?? []
  const ids = new Set([kit.perf.castId, ...extras.map((x) => bible?.elements.find((e) => e.tag === x.tag)?.cardId)].filter((x): x is string => !!x))
  const faces: Record<string, CastFace | null> = {}
  for (const id of ids) faces[id] = await castFace(publicDir, id)
  return peopleFrom({ castId: kit.perf.castId, extras, bible, colors: idp?.colors ?? null, heads, faces, depth: !!clay?.depth })
}
