// (tidy wave) The files a kit clay writes do not change when the encode moves off the main thread and the depth is read back
// packed: on a tiny scene, the old path (float read-back -> metresToUnits -> 16-bit PNG; RGBA -> RGB PNG, on the main thread) and
// the new one (RGBA8-packed depth as the shader writes it -> unpack -> PNG, through the worker pool) give the same bytes. The
// WebGL half (the shader really writing those bytes) is a human gate: jsdom has no GPU.
import { describe, expect, it } from 'vitest'
import { CLAY_DEPTH_UNIT_M } from '../../../shared/shotContract'
import { decodePng, encodePng } from '../math/png'
import { openEncodePool, type WorkerLike } from './encodePool'
import { encodeJob, packMetresRgba8, rgbaBottomUpToRgb, unpackDepthRgba8 } from './framePack'
import { encodeDepthPng, metresToUnits } from './kitDepth'

const W = 5, H = 3
/** planar metres as the old float target read back (bottom row first, metres in R): nothing drawn, near, ties, far, past the cap */
const METRES = [0, 0.004, 0.005, 0.026, 1, 2.345, 12.345, 50.125, 99.99, 300, 655.34, 655.35, 900, Number.NaN, Number.POSITIVE_INFINITY]
const floatReadback = () => { const px = new Float32Array(W * H * 4); METRES.forEach((m, i) => { px[i * 4] = m; px[i * 4 + 3] = 1 }); return px }
const colourReadback = () => Uint8Array.from({ length: W * H * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256))

describe('the packed depth read-back', () => {
  it('unpacks to exactly the units the float read-back gave, and the zdepth PNG is byte for byte the same', async () => {
    const f = floatReadback()
    const before = await encodeDepthPng(metresToUnits(f, W, H), W, H)
    const after = await encodeJob({ kind: 'depth16', px: packMetresRgba8(f, W, H), width: W, height: H })
    expect([...after]).toEqual([...before])
    expect([...unpackDepthRgba8(packMetresRgba8(f, W, H), W, H)]).toEqual([...metresToUnits(f, W, H)])
    // decoded both ways: 16-bit grey, 1 cm units, top row first, 0 = nothing drawn, capped at 65535
    const img = await decodePng(after)
    expect([img.width, img.height, img.channels, img.bitDepth]).toEqual([W, H, 1, 16])
    expect(CLAY_DEPTH_UNIT_M).toBe(0.01)
    expect([...img.data.slice(0, 5)]).toEqual([65534, 65535, 65535, 0, 0]) // the top row = the read-back's last: capped; NaN and infinity = nothing drawn
    expect([...img.data.slice(10)]).toEqual([0, 1, 1, 3, 100]) // nothing drawn; 4 mm and 5 mm -> at least 1; 2.6 cm -> 3
  })

  it('carries every unit through the two bytes (high in R, low in G)', () => {
    const units = [0, 1, 255, 256, 257, 4095, 32768, 65534, 65535]
    const px = new Uint8Array(units.length * 4)
    units.forEach((u, i) => { px[i * 4] = u >> 8; px[i * 4 + 1] = u & 0xff })
    expect([...unpackDepthRgba8(px, units.length, 1)]).toEqual(units)
  })

  it('refuses a read-back of the wrong size instead of writing a broken frame', async () => {
    await expect(encodeJob({ kind: 'rgb', px: new Uint8Array(7), width: W, height: H })).rejects.toThrow(/60 bytes, got 7/)
  })
})

/** a worker in this thread: the message seam of encode.worker.ts around the same encodeJob */
function fakeWorker(log: { posted: unknown[]; transfers: Transferable[][] }, crash = false): WorkerLike {
  const w: WorkerLike = {
    onmessage: null, onerror: null, terminate: () => {},
    postMessage(m, transfer = []) {
      log.posted.push(m); log.transfers.push(transfer)
      if (crash) return void setTimeout(() => w.onerror?.(new Error('module failed to load')))
      const { id, job } = m as { id: number; job: Parameters<typeof encodeJob>[0] }
      void encodeJob(job).then((png) => w.onmessage?.({ data: { id, png, ms: 1 } }))
    },
  }
  return w
}

describe('the encode pool', () => {
  it('a worker gives the same colour and depth bytes as the main thread, the read-back transferred, not copied', async () => {
    const log = { posted: [] as unknown[], transfers: [] as Transferable[][] }
    const pool = openEncodePool(2, () => fakeWorker(log))
    const rgba = colourReadback(), packed = packMetresRgba8(floatReadback(), W, H)
    const mainRgb = await encodePng({ width: W, height: H, channels: 3, bitDepth: 8, data: rgbaBottomUpToRgb(rgba, W, H) })
    const mainZ = await encodeDepthPng(metresToUnits(floatReadback(), W, H), W, H)
    const buf = packed.buffer
    const [c, z] = await Promise.all([pool.encode({ kind: 'rgb', px: rgba, width: W, height: H }), pool.encode({ kind: 'depth16', px: packed, width: W, height: H })])
    expect([...c.png]).toEqual([...mainRgb])
    expect([...z.png]).toEqual([...mainZ])
    expect([c.on, z.on, pool.where()]).toEqual(['worker', 'worker', 'worker'])
    expect(log.transfers.some((t) => t.includes(buf))).toBe(true)
    expect((log.posted[0] as { id: number }).id).toBe(-1) // each worker proves itself on a 1x1 before it holds a real frame
    expect(log.posted.filter((m) => (m as { id: number }).id === -1)).toHaveLength(2) // the second job went to a second worker
    pool.dispose()
  })

  it('a worker that never comes up: the frame is encoded here instead, same bytes, and no real frame was ever sent to it', async () => {
    const log = { posted: [] as unknown[], transfers: [] as Transferable[][] }
    const pool = openEncodePool(2, () => fakeWorker(log, true))
    const rgba = colourReadback()
    const main = await encodeJob({ kind: 'rgb', px: rgba.slice(), width: W, height: H })
    const e = await pool.encode({ kind: 'rgb', px: rgba, width: W, height: H })
    expect([...e.png]).toEqual([...main])
    expect([e.on, pool.where()]).toEqual(['main', 'main'])
    expect(log.posted.every((m) => (m as { id: number }).id === -1)).toBe(true)
    pool.dispose()
  })

  it('no Worker at all (tests, old browsers): the main thread, as before', async () => {
    const pool = openEncodePool(2, null)
    expect((await pool.encode({ kind: 'rgb', px: colourReadback(), width: W, height: H })).on).toBe('main')
    pool.dispose()
    await expect(pool.encode({ kind: 'rgb', px: colourReadback(), width: W, height: H })).rejects.toThrow(/closed/)
  })
})
