/**
 * Load the clip library once: the canonical skeleton (subject 35) and every clip retargeted onto it and analysed.
 * (track D, live motion) the kept user moves listed by GET /__lab/motion/clips merge into the clip lookup under their gen:<motion-id>,
 * each a ClipDef-shaped clip.json with root 'pinned', in/out/hold/prop/phases and source generated (motion/userClips.ts). A folder
 * whose clip.json or clip.bvh does not load is left out of the lookup: the move compiles to standing still, with a warning naming it
 * (motion/moveAction.ts). The static CLIPS record and the ClipId type are untouched.
 */
import { CANON_URL, CLIPS, type ClipId } from '../clips.ts'
import { parseBvh } from './bvh.ts'
import { analyseClip, type Clip } from './clip.ts'
import { retarget } from './retarget.ts'
import { smoothBvh } from './smooth.ts'
import { skeletonOf, type Skeleton } from './skeleton.ts'
import { refOf, userClipDef, userClipJsonUrl, type UserClipRef } from './userClips.ts'

/** the clip lookup: every builtin by its ClipId, plus each kept user move by gen:<motion-id> (undefined when its files did not load) */
export type ClipLookup = Record<ClipId, Clip> & Record<string, Clip | undefined>

export type Library = {
  canon: Skeleton
  clips: ClipLookup
  /** (track D) the kept moves' own words (clip.json's note) by gen id, so a warning can name the move plainly */
  notes: Record<string, string>
}

/** `read` returns a clip file's text for its url (fetch in the browser, the disk in tests) */
export async function loadLibrary(read: (url: string) => Promise<string>, user: readonly UserClipRef[] = []): Promise<Library> {
  const urls = [...new Set([CANON_URL, ...Object.values(CLIPS).map((c) => c.url)])]
  const texts = Object.fromEntries(await Promise.all(urls.map(async (u) => [u, await read(u)] as const)))
  const bvhs = Object.fromEntries(urls.map((u) => [u, smoothBvh(parseBvh(texts[u]))])) // capture jitter low-passed (motion/smooth.ts)
  const canon = skeletonOf(bvhs[CANON_URL])
  const sources = Object.fromEntries(urls.map((u) => [u, retarget(bvhs[u], canon)]))
  const clips = Object.fromEntries((Object.keys(CLIPS) as ClipId[]).map((id) => [id, analyseClip(id, CLIPS[id], sources[CLIPS[id].url], canon)])) as Record<ClipId, Clip>
  const lib: Library = { canon, clips: clips as ClipLookup, notes: {} }
  await addUserClips(lib, read, user)
  return lib
}

/** read kept user moves into the lookup (each under its gen id); one whose files do not load is left out */
async function addUserClips(lib: Library, read: (url: string) => Promise<string>, user: readonly UserClipRef[]): Promise<void> {
  for (const ref of user) {
    lib.notes[ref.id] = ref.note ?? ''
    try {
      const def = userClipDef(ref.folder, JSON.parse(await read(userClipJsonUrl(ref.folder))))
      if (!def) throw new Error('clip.json is not a playable clip')
      Object.assign(lib.clips, { [ref.id]: analyseClip(ref.id, def, retarget(smoothBvh(parseBvh(await read(def.url))), lib.canon), lib.canon) })
    } catch {
      // left out of the lookup: the move compiles to standing still, with a warning naming it (motion/moveAction.ts)
    }
  }
}

/** the kept moves the dev server lists (GET /__lab/motion/clips); none when the plugin is not mounted or the list is not shaped */
async function fetchUserClips(): Promise<UserClipRef[]> {
  try {
    const r = await fetch('/__lab/motion/clips')
    if (!r.ok) return []
    const body = (await r.json()) as { clips?: unknown }
    return Array.isArray(body?.clips) ? body.clips.flatMap((c) => { const ref = refOf(c); return ref ? [ref] : [] }) : []
  } catch {
    return []
  }
}

const fetchText = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(`mocap clip ${u}: HTTP ${r.status}`); return r.text() }

let shared: Promise<Library> | null = null
/** the library over fetch, loaded once per page */
export function fetchLibrary(): Promise<Library> {
  shared ??= (async () => loadLibrary(fetchText, await fetchUserClips()))()
  shared.catch(() => { shared = null })
  return shared
}

/** made moves already asked for once: a move whose files are not on this machine is not asked for again on every build */
const asked = new Set<string>()
/**
 * The library with the made moves `ids` in it. A move kept after this page read the library (Make it, then Play here) is not
 * in it yet: its files are read in now, once, and merged into the shared lookup, so the audition plays the move instead of
 * standing still.
 */
export async function fetchLibraryWith(ids: readonly string[]): Promise<Library> {
  const lib = await fetchLibrary()
  const want = ids.filter((id) => !lib.clips[id] && !asked.has(id))
  if (!want.length) return lib
  for (const id of want) asked.add(id)
  await addUserClips(lib, fetchText, (await fetchUserClips()).filter((r) => want.includes(r.id)))
  return lib
}
