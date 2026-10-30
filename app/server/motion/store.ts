/**
 * On-disk state for labMotion, all under public/lab-assets/motions/ (gitignored like the rest of lab-assets, so user
 * moves never reach the public repo). Two things live here:
 *   .in-flight.json  the record of the one in-flight make; a dev-server restart re-attaches from it
 *   <motion-id>/     a kept move: clip.bvh, clip.json (ClipDef-shaped, plan 1.5), strip.png
 * Nothing is held in memory only.
 */
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { InFlight, UserClip } from './types.ts'

const IN_FLIGHT = '.in-flight.json'

export class MotionStore {
  readonly dir: string
  constructor(dir: string) {
    this.dir = dir
  }

  private inFlightPath(): string {
    return path.join(this.dir, IN_FLIGHT)
  }

  async inFlight(): Promise<InFlight | null> {
    try {
      return JSON.parse(await readFile(this.inFlightPath(), 'utf8')) as InFlight
    } catch {
      return null
    }
  }

  /** atomic-ish: write beside, then rename, so a restart never sees a half-written record. */
  async saveInFlight(rec: InFlight): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const tmp = this.inFlightPath() + '.tmp'
    await writeFile(tmp, JSON.stringify(rec))
    await rename(tmp, this.inFlightPath())
  }

  async clearInFlight(): Promise<void> {
    await rm(this.inFlightPath(), { force: true })
  }

  /** a motion-id from the user's label: lowercase words, deduped against the clips already kept. */
  async motionId(label: unknown): Promise<string> {
    const base = (typeof label === 'string' && label.trim() ? label : 'move')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'move'
    let id = base
    for (let i = 2; await this.clipFolderExists(id); i++) id = `${base}-${i}`
    return id
  }

  private async clipFolderExists(id: string): Promise<boolean> {
    try {
      await readdir(path.join(this.dir, id))
      return true
    } catch {
      return false
    }
  }

  /** writes a kept move's folder; clip.json is the caller's ClipDef-shaped record. */
  async keepClip(id: string, bvh: Buffer, strip: Buffer, clipJson: unknown): Promise<void> {
    const dir = path.join(this.dir, id)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'clip.bvh'), bvh)
    await writeFile(path.join(dir, 'strip.png'), strip)
    await writeFile(path.join(dir, 'clip.json'), JSON.stringify(clipJson, null, 2))
  }

  /** the user clips the library loader merges in, by id gen:<motion-id>. */
  async clips(): Promise<UserClip[]> {
    let names: string[]
    try {
      names = await readdir(this.dir)
    } catch {
      return []
    }
    const out: UserClip[] = []
    for (const name of names.sort()) {
      if (name.startsWith('.')) continue
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(await readFile(path.join(this.dir, name, 'clip.json'), 'utf8')) as Record<string, unknown>
      } catch {
        continue // a folder without a clip.json is not a kept move
      }
      out.push({
        id: `gen:${name}`,
        folder: name,
        note: typeof parsed.note === 'string' ? parsed.note : '',
        seconds: typeof parsed.out === 'number' ? parsed.out : null,
        date: typeof parsed.date === 'string' ? parsed.date : null,
      })
    }
    return out
  }
}
