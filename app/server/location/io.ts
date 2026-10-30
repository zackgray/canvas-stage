/**
 * Files of the Location flow, all under public/lab-assets/locations/ (gitignored, served from disk by plugin.ts):
 *   candidates/<batch>/c<k>.png + batch.json          one candidates job (prompt, seeds, job id)
 *   <loc>/raw/{depth.exr, valid.png, vfov.txt, points.glb}   MoGe-2's raw outputs (kept: they were paid for)
 *   <loc>/still.png  depth-moge-2.png  valid-moge-2.png  meta.json   the set, in E2's MoGe format
 *   manifest.json                                       every location as a shot; in engine/manifest.ts MANIFEST_URLS
 * The manifest is written last and atomically, so the lab never lists a shot whose files are not all there.
 */
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readPng } from '../../scripts/lib/png.ts'
import { readExr } from '../../experiments/lib/exr.ts'
import { writeGrey16 } from '../../experiments/lib/png16.ts'
import { readPoints } from '../settle/io.ts'
import { withShot, type MetricDepth, type MogeOutputs } from './process.ts'
import { BATCH_RE, LOCATION_RE } from './request.ts'
import type { CandidateBatch, LocationShot } from './types.ts'
import { replaceFile } from '../replace.ts'

export const LOCATIONS_URL = '/lab-assets/locations'
export const RAW = { depth: 'depth.exr', valid: 'valid.png', vfov: 'vfov.txt', points: 'points.glb' } as const

export class LocationFiles {
  readonly root: string

  constructor(publicDir: string) {
    this.root = path.join(publicDir, 'lab-assets', 'locations')
  }

  get manifest(): string {
    return path.join(this.root, 'manifest.json')
  }

  /** provenance registry (verify.ts) */
  get registry(): string {
    return path.join(this.root, '.outputs.json')
  }

  batchDir(id: string): string {
    if (!BATCH_RE.test(id)) throw new Error('bad batch id')
    return path.join(this.root, 'candidates', id)
  }

  candidate(id: string, k: number): { file: string; url: string } {
    return { file: path.join(this.batchDir(id), `c${k}.png`), url: `${LOCATIONS_URL}/candidates/${id}/c${k}.png` }
  }

  locationDir(id: string): string {
    if (!LOCATION_RE.test(id)) throw new Error('bad location id')
    return path.join(this.root, id)
  }

  rawDir(id: string): string {
    return path.join(this.locationDir(id), 'raw')
  }

  async saveBatch(b: CandidateBatch): Promise<void> {
    await mkdir(this.batchDir(b.id), { recursive: true })
    await writeFile(path.join(this.batchDir(b.id), 'batch.json'), JSON.stringify(b, null, 2) + '\n')
  }

  async readBatch(id: string): Promise<CandidateBatch | null> {
    const f = path.join(this.batchDir(id), 'batch.json')
    return existsSync(f) ? (JSON.parse(await readFile(f, 'utf8')) as CandidateBatch) : null
  }

  /** The newest candidates batch on disk (ids sort by time), so a restarted server still shows the last contact sheet. */
  async latestBatch(): Promise<CandidateBatch | null> {
    const dir = path.join(this.root, 'candidates')
    if (!existsSync(dir)) return null
    const ids = (await readdir(dir)).filter((n) => BATCH_RE.test(n)).sort().reverse()
    for (const id of ids) {
      const b = await this.readBatch(id)
      if (b && !b.source) return b // a footage frame's batch is not a contact sheet
    }
    return null
  }

  /** MoGe's raw outputs as process.ts inputs. */
  readRaw(rawDir: string): MogeOutputs {
    const render = readExr(path.join(rawDir, RAW.depth))
    const v = readPng(path.join(rawDir, RAW.valid))
    if (v.width !== render.width || v.height !== render.height) throw new Error(`MoGe mask ${v.width}x${v.height}, depth ${render.width}x${render.height}`)
    const valid = new Float32Array(v.width * v.height)
    for (let i = 0; i < valid.length; i++) valid[i] = v.data[i * 4] / v.maxValue
    const txt = path.join(rawDir, RAW.vfov)
    return { render, valid, points: readPoints(path.join(rawDir, RAW.points)), vfovText: existsSync(txt) ? readFileSync(txt, 'utf8') : null }
  }

  /** Still, depth, sky mask and meta.json of a new location (not yet listed: see appendManifest). */
  async writeLocation(id: string, still: string, d: MetricDepth, width: number, height: number, meta: Record<string, unknown>): Promise<void> {
    const dir = this.locationDir(id)
    await mkdir(dir, { recursive: true })
    await copyFile(still, path.join(dir, 'still.png'))
    writeGrey16(path.join(dir, 'depth-moge-2.png'), width, height, d.values)
    await copyFile(path.join(this.rawDir(id), RAW.valid), path.join(dir, 'valid-moge-2.png'))
    await writeFile(path.join(dir, 'meta.json'), JSON.stringify({
      kind: 'location', id, width, height,
      depth: { encoding: '16-bit linear metres, near-dark, 0 = invalid', metersPerUnit: d.metersPerUnit, validFraction: d.validFraction },
      lens: { vfovDeg: d.vfovDeg, from: d.vfovFrom }, mogeFit: d.fit, ...meta,
    }, null, 2) + '\n')
  }

  /** Append (or replace) a shot in manifest.json: write a temp file, then rename over the old one. */
  async appendManifest(shot: LocationShot): Promise<void> {
    await mkdir(this.root, { recursive: true })
    const old = existsSync(this.manifest) ? JSON.parse(await readFile(this.manifest, 'utf8')) : null
    const tmp = `${this.manifest}.tmp`
    await writeFile(tmp, JSON.stringify(withShot(old, shot), null, 2) + '\n')
    await replaceFile(tmp, this.manifest)
  }
}
