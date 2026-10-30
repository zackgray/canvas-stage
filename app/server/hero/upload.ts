/**
 * POST /__lab/hero/opening?take=&key= : the take's frame 0 (world + performer, 1920x1088 PNG) from the browser, streamed to
 * shots/<takeId>/hero/opening.png. Checked while it streams (size cap) and after (PNG signature, IHDR size) before it
 * replaces the file; the take id is the only name the client supplies and it must be take-… and on disk.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { HERO_H, HERO_W, MAX_OPENING_BYTES } from './spec.ts'
import { heroDirOf, HeroHttpError, readTake, takeIdOf, writeJson } from './store.ts'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** The PNG's width and height from its first 24 bytes, or null when it is not a PNG. */
export async function pngSize(file: string): Promise<{ width: number; height: number } | null> {
  const fh = await open(file, 'r')
  try {
    const b = Buffer.alloc(24)
    const { bytesRead } = await fh.read(b, 0, 24, 0)
    if (bytesRead < 24 || !b.subarray(0, 8).equals(SIGNATURE) || b.toString('ascii', 12, 16) !== 'IHDR') return null
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  } finally { await fh.close() }
}

export async function saveOpening(publicDir: string, req: IncomingMessage, rawTake: unknown, rawKey: string | null): Promise<{ bytes: number; startKey: string | null }> {
  const takeId = takeIdOf(rawTake)
  const take = await readTake(publicDir, takeId)
  if (rawKey !== null && !/^[0-9a-f]{8}$/.test(rawKey)) throw new HeroHttpError(400, 'key must be the take\'s 8-digit start key', 'bad_request')
  if (rawKey !== null && rawKey !== take.startKey) throw new HeroHttpError(409, 'that opening frame is for an older start of this take', 'stale_opening')
  const dir = heroDirOf(publicDir, takeId)
  await mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `opening.png.${process.pid}.tmp`)
  let bytes = 0
  const cap = new Transform({ transform(chunk: Buffer, _enc, cb) {
    bytes += chunk.length
    cb(bytes > MAX_OPENING_BYTES ? new HeroHttpError(413, 'the opening frame is too large', 'too_large') : null, chunk)
  } })
  try {
    await pipeline(req, cap, createWriteStream(tmp))
    const size = await pngSize(tmp)
    if (!size) throw new HeroHttpError(400, 'the body is not a PNG', 'bad_request')
    if (size.width !== HERO_W || size.height !== HERO_H) throw new HeroHttpError(400, `the opening frame must be ${HERO_W}x${HERO_H}, this one is ${size.width}x${size.height}`, 'bad_request')
    await rename(tmp, path.join(dir, 'opening.png'))
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
  await writeJson(path.join(dir, 'opening.json'), { startKey: rawKey ?? take.startKey, bytes, savedAt: new Date().toISOString() })
  return { bytes, startKey: rawKey ?? take.startKey }
}
