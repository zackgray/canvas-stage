/**
 * The default project, built read-only from what the labs have written so far (never modifies a file):
 *   every shot of locations/manifest.json        -> a location ingredient v1
 *   every looks/<key>/look.json (+ ref-N files)  -> a look ingredient v1, id = the folder key ("/" written "@")
 *   every renders/view-* export shot in one of those locations that has a still or a clip -> a shot, made from v1
 * A shot's still is the first frame its newest clip was made from (else its newest still), its clip the newest clip
 * started from that export, its finish the newest Finish of that clip, its take that clip's folder.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { addVersion, DEFAULT_PROJECT, emptyProject, type Artefact, type MadeFrom, type Project, type Shot, type Uses } from '../../src/project/model.ts'

const RENDERS = '/lab-assets/renders'

type Json = Record<string, unknown>
type Dated = { output: string; createdAt: string }

async function readJson(file: string): Promise<Json | null> {
  try {
    const v = JSON.parse(await readFile(file, 'utf8')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null
  } catch { return null }
}

async function list(dir: string, re: RegExp): Promise<string[]> {
  return existsSync(dir) ? (await readdir(dir)).filter((n) => re.test(n)).sort() : []
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const newest = <T extends { createdAt: string }>(xs: T[]) => xs.reduce<T | null>((a, b) => (!a || b.createdAt >= a.createdAt ? b : a), null)
const isDated = (r: Json | null): r is Json & Dated =>
  !!r && typeof r.output === 'string' && r.output.startsWith('/lab-assets/') && typeof r.createdAt === 'string'
const nameOf = (s: string, max = 48) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

/** Records (*.json with an output URL) in a folder, matching `re`. */
async function records(dir: string, re: RegExp): Promise<(Json & Dated)[]> {
  const out: (Json & Dated)[] = []
  for (const f of await list(dir, re)) {
    const r = await readJson(path.join(dir, f))
    if (isDated(r)) out.push(r)
  }
  return out
}

export async function buildDefaultProject(publicDir: string, now: string): Promise<Project> {
  const assets = path.join(publicDir, 'lab-assets')
  let p = emptyProject(DEFAULT_PROJECT, 'Project', now)

  const manifest = await readJson(path.join(assets, 'locations', 'manifest.json'))
  const shots = Array.isArray(manifest?.shots) ? (manifest.shots as Json[]) : []
  for (const s of shots) {
    if (typeof s.id !== 'string' || !/^[\w.@-]{1,120}$/.test(s.id)) continue
    p = addVersion(p, 'location', s.id, { shot: s.id, prompt: text(s.prompt) }, now, nameOf(text(s.description) || s.id))
  }

  const looksDir = path.join(assets, 'looks')
  for (const key of await list(looksDir, /^[\w.@-]{1,120}$/)) {
    const look = await readJson(path.join(looksDir, key, 'look.json'))
    if (!look) continue
    const refs = await list(path.join(looksDir, key), /^ref-[12]\.(jpg|png)$/)
    p = addVersion(p, 'look', key, {
      mood: text(look.mood), timeOfDay: typeof look.timeOfDay === 'string' ? look.timeOfDay : null,
      atmosphere: text(look.atmosphere) || 'none', references: refs,
    }, text(look.updatedAt) || now, nameOf(text(look.mood) || key))
  }

  const rendersDir = path.join(assets, 'renders')
  // every clip and its newest finish, by the export its first frame came from
  const clipsByView = new Map<string, { clip: Json & Dated; finish: (Json & Dated) | null }[]>()
  for (const folder of await list(rendersDir, /^video-[\w-]+$/)) {
    const dir = path.join(rendersDir, folder)
    const finishes = await records(dir, /^finish-clip-[\w.-]+\.json$/)
    for (const clip of await records(dir, /^clip-[\w-]+\.json$/)) {
      const view = text(clip.first).split('/')[0]
      if (!view) continue
      const finish = newest(finishes.filter((f) => f.clip === clip.id))
      clipsByView.set(view, [...(clipsByView.get(view) ?? []), { clip: { ...clip, folder }, finish }])
    }
  }

  const located = new Set(p.ingredients.locations.map((l) => l.id))
  const counts = new Map<string, number>()
  for (const view of await list(rendersDir, /^view-[\w-]+$/)) {
    const meta = await readJson(path.join(rendersDir, view, 'meta.json'))
    const loc = text(meta?.source).split('#')[0]
    if (!located.has(loc)) continue
    const stills = (await records(path.join(rendersDir, view, 'stills'), /^[\w-]+\.json$/)).filter((r) => !r.output.endsWith('.fill.png'))
    const clip = newest((clipsByView.get(view) ?? []).map((c) => ({ ...c, createdAt: c.clip.createdAt })))
    if (!clip && stills.length === 0) continue

    const look = p.ingredients.looks.find((l) => l.id === loc.replace('/', '@'))
    const uses: Uses = { location: { id: loc, version: 'latest' }, ...(look ? { look: { id: look.id, version: 'latest' } } : {}), cast: [], props: [] }
    const madeFrom: MadeFrom = { location: { id: loc, version: 1 }, ...(look ? { look: { id: look.id, version: 1 } } : {}), cast: [], props: [] }
    const art = (r: Dated, from?: string): Artefact => ({ path: r.output, created: r.createdAt, madeFrom, ...(from ? { from } : {}) })

    const n = (counts.get(loc) ?? 0) + 1
    counts.set(loc, n)
    const locName = p.ingredients.locations.find((l) => l.id === loc)?.name ?? loc
    const shot: Shot = { id: view, name: `${locName} · ${n}`, order: p.shots.length + 1, uses }
    if (clip) {
      const first = text(clip.clip.firstUrl) || `${RENDERS}/${text(clip.clip.first)}`
      const madeStill = stills.find((s) => s.output === first)
      shot.still = art({ output: first, createdAt: madeStill?.createdAt ?? clip.clip.createdAt })
      shot.take = { path: `${RENDERS}/${text(clip.clip.folder)}` }
      shot.clip = art(clip.clip, first)
      if (clip.finish) shot.finish = art(clip.finish, clip.clip.output)
    } else {
      const still = newest(stills)
      if (still) shot.still = art(still)
    }
    p = { ...p, shots: [...p.shots, shot] }
  }
  return p
}
