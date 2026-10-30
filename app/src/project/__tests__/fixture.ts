// A small project: one location, one look at v1, one cast member; shot A follows latest and has a still, a clip from
// that still and a finish from that clip, all made from v1; shot B pins the look at v1 and has a still.
import { addVersion, emptyProject, type Artefact, type LookPayload, type MadeFrom, type Project } from '../model.ts'

export const T = '2026-10-18T12:00:00.000Z'
export const LOOK: LookPayload = { mood: 'wet, quiet', timeOfDay: 'night', atmosphere: 'fog', references: ['ref-1.jpg'] }
export const STILL = '/lab-assets/renders/view-a/stills/render-1.png'
export const CLIP = '/lab-assets/renders/video-a/clip-1.mp4'

export const V1: MadeFrom = { location: { id: 'loc-1', version: 1 }, look: { id: 'loc-1', version: 1 }, cast: [{ id: 'mara', version: 1 }], props: [] }
const art = (path: string, from?: string): Artefact => ({ path, created: T, madeFrom: V1, ...(from ? { from } : {}) })

export function project(): Project {
  let p = emptyProject('test', 'Test', T)
  p = addVersion(p, 'location', 'loc-1', { shot: 'loc-1', prompt: 'Photo of an alley.' }, T, 'Alley')
  p = addVersion(p, 'look', 'loc-1', LOOK, T, 'Wet night')
  p = addVersion(p, 'cast', 'mara', { name: 'Mara', description: 'jeans, blue hair', references: [], sheets: [] }, T)
  return {
    ...p,
    shots: [
      {
        id: 'a', name: 'A', order: 1,
        uses: { location: { id: 'loc-1', version: 'latest' }, look: { id: 'loc-1', version: 'latest' }, cast: [{ id: 'mara', version: 'latest' }], props: [] },
        take: { path: '/lab-assets/renders/video-a' },
        still: art(STILL), clip: art(CLIP, STILL), finish: art('/lab-assets/renders/video-a/finish-clip-1-film.mp4', CLIP),
      },
      {
        id: 'b', name: 'B', order: 2,
        uses: { location: { id: 'loc-1', version: 'latest' }, look: { id: 'loc-1', version: 1 }, cast: [{ id: 'mara', version: 1 }], props: [] },
        still: art('/lab-assets/renders/view-b/stills/render-2.png'),
      },
    ],
  }
}
