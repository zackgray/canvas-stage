/**
 * The scene Bible store (bibleContract.ts): bible.json plus an append-only history under
 * public/lab-assets/locations/<loc-…>/bible/{bible.json, versions/v<N>.json, master/, elements/}.
 * Every change writes the next version: v<N>.json is created exclusively (never overwritten), then bible.json is replaced
 * atomically. A change that alters nothing writes nothing. Writes to one world are serialised.
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SetApproval } from '../../src/shared/setApproval.ts'
import { biblePaths, type BibleElement, type BibleMaster, type BibleRecord } from '../../src/shared/bibleContract.ts'
import { flatLines } from './briefLines.ts'
import { readSetApproval, SET_APPROVAL_FILE } from './read.ts'
import { approvedSetKeys, keysAfterApproving } from './setKeys.ts'
import { LOCATION_RE } from '../location/request.ts'
import { replaceFile } from '../replace.ts'
import { BibleError, checkDesign, text, validBrief, validElement, validMaster, validSheet, LIMITS, type SaveFields } from './validate.ts'

export { BibleError } from './validate.ts'

const blank = (worldId: string, now: string): BibleRecord => ({
  worldId, version: 0, prompt: '', master: null, candidates: [], lighting: '', materials: '',
  elements: [], extrasSheet: null, grade: null, createdAt: now, updatedAt: now,
})
const fingerprint = (b: BibleRecord) => JSON.stringify({ ...b, version: 0, updatedAt: '', createdAt: '' })

export class BibleStore {
  private chains = new Map<string, Promise<unknown>>()

  private publicDir: string
  private now: () => Date
  constructor(publicDir: string, now: () => Date = () => new Date()) { this.publicDir = publicDir; this.now = now }

  worldDir(worldId: string): string {
    if (typeof worldId !== 'string' || !LOCATION_RE.test(worldId)) throw new BibleError(400, 'bad world id')
    return path.join(this.publicDir, 'lab-assets', 'locations', worldId)
  }
  private dir(worldId: string) { this.worldDir(worldId); return path.join(this.publicDir, biblePaths(worldId).root) }

  /** The current Bible; with `bible.json` lost or unreadable, the newest `versions/v<N>.json` (m6: one bad write never kills Scene). */
  async get(worldId: string): Promise<BibleRecord | null> {
    const dir = this.dir(worldId)
    try { return JSON.parse(await readFile(path.join(dir, 'bible.json'), 'utf8')) as BibleRecord } catch (e) {
      if (!(e instanceof SyntaxError) && (e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      const newest = await this.newestVersion(dir)
      if (newest) return newest
      if (e instanceof SyntaxError) throw new BibleError(500, `bible.json for ${worldId} is unreadable and no saved version is left: ${e.message}`)
      return null
    }
  }

  private async newestVersion(dir: string): Promise<BibleRecord | null> {
    const names = await readdir(path.join(dir, 'versions')).catch(() => [] as string[])
    const ns = names.flatMap((n) => { const m = /^v(\d+)\.json$/.exec(n); return m ? [Number(m[1])] : [] }).sort((a, b) => b - a)
    for (const n of ns) {
      try { return JSON.parse(await readFile(path.join(dir, 'versions', `v${n}.json`), 'utf8')) as BibleRecord } catch { /* next older */ }
    }
    return null
  }

  /** Run `change` on the current Bible (a blank one if none) and write the next version when it altered something. */
  private update(worldId: string, change: (b: BibleRecord) => void): Promise<BibleRecord | null> {
    const run = async (): Promise<BibleRecord | null> => {
      if (!existsSync(this.worldDir(worldId))) throw new BibleError(404, 'world not found')
      const was = await this.get(worldId)
      const next: BibleRecord = structuredClone(was ?? blank(worldId, this.now().toISOString()))
      change(next)
      if (was && fingerprint(was) === fingerprint(next)) return was
      next.version = (was?.version ?? 0) + 1
      next.updatedAt = this.now().toISOString()
      const dir = this.dir(worldId)
      await mkdir(path.join(dir, 'versions'), { recursive: true })
      const body = JSON.stringify(next, null, 2) + '\n'
      try { await writeFile(path.join(dir, 'versions', `v${next.version}.json`), body, { flag: 'wx' }) } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new BibleError(409, `version ${next.version} already exists`)
        throw e
      }
      const tmp = path.join(dir, 'bible.json.tmp')
      await writeFile(tmp, body)
      await replaceFile(tmp, path.join(dir, 'bible.json'))
      return next
    }
    const prior = this.chains.get(worldId) ?? Promise.resolve()
    const result = prior.then(run, run)
    this.chains.set(worldId, result.catch(() => {}))
    return result
  }

  /**
   * The lines, the extras sheet and (prompt wave) the v2 brief. A saved brief derives `lighting`, `materials` and `background` unless
   * the same save writes them; `brief: null` removes it (the lines stay). Old Bibles without a brief are untouched until one is saved.
   */
  save(worldId: string, r: SaveFields) {
    const brief = r.brief === undefined || r.brief === null ? r.brief : validBrief(r.brief)
    const derived = brief ? flatLines(brief) : null
    const prompt = r.prompt === undefined ? undefined : text(r.prompt, 'prompt', LIMITS.prompt)
    const lighting = r.lighting === undefined ? derived?.lighting : text(r.lighting, 'lighting', LIMITS.lighting)
    const materials = r.materials === undefined ? derived?.materials : text(r.materials, 'materials', LIMITS.materials)
    const sheet = r.extrasSheet === undefined ? undefined : validSheet(r.extrasSheet)
    const background = r.background === undefined ? derived?.background : text(r.background, 'background', LIMITS.background)
    return this.update(worldId, (b) => {
      if (brief) b.brief = brief
      else if (brief === null) delete b.brief
      if (prompt !== undefined) b.prompt = prompt
      if (lighting !== undefined) b.lighting = lighting
      if (materials !== undefined) b.materials = materials
      if (sheet !== undefined) b.extrasSheet = sheet
      // S2: optional and add-only; an old Bible without the field is unchanged until a line is written (no empty version)
      if (background !== undefined && (background || b.background !== undefined)) b.background = background
    })
  }

  /** Free and writes nothing (wave 3 M1): what the save and element routes would refuse for this design (validate.ts checkDesign). */
  check(r: SaveFields & { elements?: unknown }): string[] { return checkDesign(r) }

  upsertElement(worldId: string, element: unknown) {
    const el: BibleElement = validElement(element)
    return this.update(worldId, (b) => {
      const i = b.elements.findIndex((x) => x.tag === el.tag)
      if (i >= 0) b.elements[i] = el; else b.elements.push(el)
    })
  }

  removeElement(worldId: string, tag: string) {
    return this.update(worldId, (b) => {
      if (!b.elements.some((x) => x.tag === tag)) throw new BibleError(404, `no element @${tag}`)
      b.elements = b.elements.filter((x) => x.tag !== tag)
    })
  }

  /** Drawn masters (the paid route's result): appended, never replacing an earlier one. */
  addCandidates(worldId: string, masters: BibleMaster[]) {
    masters.forEach(validMaster)
    return this.update(worldId, (b) => {
      for (const m of masters) {
        if (b.candidates.some((c) => c.id === m.id)) throw new BibleError(409, `master ${m.id} already exists`)
        b.candidates.push(m)
      }
    })
  }

  /** Approve the set at `key` (free): bible/set-approval.json, beside the sheet and not in it, so approving never bumps the sheet's version (setApproval.ts). */
  /** `scene: false` (review F1): `key` is a locked take's own set, not the scene's: it joins `keys` only, and the scene's `key`/`at`
   *  stay as they were (approving a take's set never moves the scene's approval). Returns the scene's approval (null = none). */
  approveSet(worldId: string, key: string, o: { scene?: boolean } = {}): Promise<SetApproval | null> {
    const scene = o.scene !== false
    const run = async (): Promise<SetApproval | null> => {
      if (!existsSync(this.worldDir(worldId))) throw new BibleError(404, 'world not found')
      const was = readSetApproval(this.publicDir, worldId)
      if (scene ? was?.key === key : approvedSetKeys(this.publicDir, worldId).includes(key)) return was
      const next: SetApproval | null = scene ? { key, at: this.now().toISOString() } : was
      const keys = keysAfterApproving(this.publicDir, worldId, key) // every key approved so far (setKeys.ts), read before the write
      const dir = this.dir(worldId)
      await mkdir(dir, { recursive: true })
      const tmp = path.join(dir, 'set-approval.json.tmp')
      await writeFile(tmp, JSON.stringify({ ...(next ?? {}), keys }, null, 2) + '\n')
      await replaceFile(tmp, path.join(dir, SET_APPROVAL_FILE))
      return next
    }
    const prior = this.chains.get(worldId) ?? Promise.resolve()
    const result = prior.then(run, run)
    this.chains.set(worldId, result.catch(() => {}))
    return result
  }

  /** Approve a candidate as the master; the grade target follows it (reinhard-lab to the approved master). */
  approve(worldId: string, masterId: string) {
    return this.update(worldId, (b) => {
      const m = b.candidates.find((c) => c.id === masterId)
      if (!m) throw new BibleError(404, `no master candidate ${masterId}`)
      b.master = m
      b.grade = { target: m.png, method: 'reinhard-lab' }
    })
  }
}
