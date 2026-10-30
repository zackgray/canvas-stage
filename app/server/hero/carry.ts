/**
 * Carry the approved opening still across a re-lock (troubleshooting review item 7). A pose or blocking fix gives the take a new id,
 * which stales every still; when the new take's frame 0 shows exactly what the old one's did (equal frame-0 keys, src/studio/shoot/
 * frame0Key.ts, plus the same world, camera start, focal, aspect, lens and Bible), the old take's APPROVED opening still is copied into
 * the new take's hero folder with its takeId and startKey rewritten and `carriedFrom` recorded, so it reads as fresh everywhere
 * (listStills, approve, Render's readiness) without any of them knowing about carrying. Mid / end stills never carry: the motion
 * between frame 0 and their frame differs. When anything is unsure, nothing is carried (today's behaviour). Free; nothing submits.
 */
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { carryRefusal, type CarriedStill } from '../../src/shared/carryContract.ts'
import type { HeroStill, TakeRecord } from '../../src/shared/shotContract.ts'
import { STILL_ID_RE } from './spec.ts'
import { heroDirOf, heroUrl, readJson, stillFile, writeJson } from './store.ts'

export { carryRefusal }

/** `take`'s approved opening still drawn on its current start (the newest, if ever several), or null */
export async function approvedOpening(publicDir: string, take: TakeRecord): Promise<HeroStill | null> {
  const dir = heroDirOf(publicDir, take.id)
  if (!existsSync(dir)) return null
  const out: HeroStill[] = []
  for (const f of await readdir(dir)) {
    const m = /^(hero-[\w-]+)\.json$/.exec(f)
    if (!m || !STILL_ID_RE.test(m[1]) || !existsSync(path.join(dir, `${m[1]}.png`))) continue
    const s = await readJson<HeroStill>(path.join(dir, f))
    if (s?.id === m[1] && s.takeId === take.id && s.approved === true && (s.role ?? 'opening') === 'opening' && s.startKey === take.startKey) out.push(s)
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

/**
 * After a lock that made a new take: the newest earlier take of the same world whose frame 0 matches hands over its approved opening
 * still. `takes` is every take on disk (any order). Returns what was carried, or null.
 */
export async function carryOpening(publicDir: string, next: TakeRecord, takes: TakeRecord[]): Promise<CarriedStill | null> {
  if (!next.frame0Key) return null
  const prev = takes.filter((t) => t.id !== next.id && carryRefusal(t, next) === null)
    .sort((a, b) => b.lockedAt.localeCompare(a.lockedAt) || b.id.localeCompare(a.id))[0]
  if (!prev) return null
  const still = await approvedOpening(publicDir, prev)
  if (!still) return null
  const from = heroDirOf(publicDir, prev.id), to = heroDirOf(publicDir, next.id)
  await mkdir(to, { recursive: true })
  // the files the still is made of: its png, a kit still's draw (Finish again reads it), and the frame-0 capture when the new take has none
  for (const f of [`${still.id}.png`, `${still.id}-draw.png`, 'opening.png', 'opening.json']) {
    const src = path.join(from, f), dst = path.join(to, f)
    if (existsSync(src) && !(f.startsWith('opening') && existsSync(dst))) await copyFile(src, dst)
  }
  const { png: _png, ...kept } = still
  // its json LAST: a still exists once its json does (store.ts); it cost nothing on this take
  await writeJson(stillFile(to, still.id), { ...kept, takeId: next.id, startKey: next.startKey, png: heroUrl(next.id, `${still.id}.png`), credits: 0, jobId: null, carriedFrom: prev.id } satisfies HeroStill)
  return { stillId: still.id, from: prev.id }
}
