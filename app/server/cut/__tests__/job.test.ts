import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CutError, CutJob, FFMPEG_MISSING, type CutDeps } from '../job.ts'
import { DRAFT_A, DRAFT_B, FINISHED_B, PACK, rig } from './rig.ts'

afterEach(() => vi.useRealTimers())

const SEGS = [{ takeId: DRAFT_A, in: 12, out: 40 }, { takeId: FINISHED_B, in: 40, out: 70 }]

/** An ffmpeg that writes its output file when released. */
function gated() {
  let release = () => {}
  const gate = new Promise<void>((r) => { release = r })
  const calls: string[][] = []
  const run: CutDeps['run'] = async (args) => { calls.push(args); await gate; writeFileSync(args[args.length - 1], 'mp4') }
  return { run, release, calls }
}
const cutsDir = (publicDir: string) => path.join(publicDir, 'lab-assets', 'cuts', PACK)
const expectCode = async (p: Promise<unknown>, status: number) => {
  const e = await p.then(() => null, (x: unknown) => x)
  expect(e).toBeInstanceOf(CutError)
  expect((e as CutError).status).toBe(status)
  return (e as CutError).message
}

describe('CutJob', () => {
  it('exports to cuts/<pack>/cut-<stamp>.mp4 + .json with the segment list; status is on disk, so another instance sees it and 409s', async () => {
    const { publicDir, probe } = rig()
    const g = gated()
    const a = new CutJob(publicDir, { run: g.run, probe, ffmpegOk: async () => true })
    const { status, done } = await a.start(PACK, SEGS)
    expect(status).toMatchObject({ state: 'running', packId: PACK })

    const b = new CutJob(publicDir, { run: g.run, probe, ffmpegOk: async () => true }) // a refresh / second module instance
    expect(b.status()).toMatchObject({ state: 'running', id: status.id })
    await expectCode(b.start(PACK, SEGS), 409)
    expect(g.calls).toHaveLength(1)

    g.release(); await done
    expect(b.status()).toMatchObject({ state: 'done', output: `/lab-assets/cuts/${PACK}/${status.id}.mp4` })
    const meta = JSON.parse(readFileSync(path.join(cutsDir(publicDir), `${status.id}.json`), 'utf8'))
    expect(meta).toMatchObject({ complete: true, frames: 58, width: 1920, height: 1088, fps: 24 })
    expect(meta.segments).toEqual([
      { takeId: DRAFT_A, in: 12, out: 40, kind: 'draft', file: 'warp-2026-10-19T10-00-00/crossview-2026-10-19T10-05-00-000.mp4', sourceStart: 0 },
      { takeId: FINISHED_B, in: 40, out: 70, kind: 'finished', file: 'warp-2026-10-19T11-00-00/finished-src1-2026-10-19T11-40-00-000.mp4', sourceStart: 12 },
    ])
    expect(existsSync(path.join(cutsDir(publicDir), `${status.id}.part.mp4`))).toBe(false)
    expect(b.cuts()).toMatchObject([{ packId: PACK, id: status.id, segments: 2, frames: 58 }])
    await b.start(PACK, SEGS).then((r) => r.done) // idle again: another export is allowed
  })

  it('never overwrites: the same stamp gets a new name and the first export is untouched', async () => {
    const { publicDir, probe } = rig()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T20:00:00.000Z'))
    const run: CutDeps['run'] = async (args) => writeFileSync(args[args.length - 1], `video-${args.length}`)
    const job = new CutJob(publicDir, { run, probe, ffmpegOk: async () => true })
    const first = await job.start(PACK, SEGS); await first.done
    const firstBytes = readFileSync(path.join(cutsDir(publicDir), `${first.status.id}.mp4`), 'utf8')
    const second = await job.start(PACK, [SEGS[0]]); await second.done
    expect(second.status.id).not.toBe(first.status.id)
    expect(readFileSync(path.join(cutsDir(publicDir), `${first.status.id}.mp4`), 'utf8')).toBe(firstBytes)
    // a reserved name (json, no video yet) is not reusable either
    writeFileSync(path.join(cutsDir(publicDir), 'cut-2026-10-19T20-00-00-000-2.json'), 'reserved')
    const reserved = await job.start(PACK, [SEGS[0]]); await reserved.done
    expect(reserved.status.id).toBe('cut-2026-10-19T20-00-00-000-3')
    expect(readFileSync(path.join(cutsDir(publicDir), 'cut-2026-10-19T20-00-00-000-2.json'), 'utf8')).toBe('reserved')
    // a stray video that has no json is somebody's file too
    writeFileSync(path.join(cutsDir(publicDir), 'cut-2026-10-19T20-00-00-000-4.mp4'), 'keep')
    const third = await job.start(PACK, [SEGS[0]]); await third.done
    expect(third.status.id).toBe('cut-2026-10-19T20-00-00-000-5')
    expect(readFileSync(path.join(cutsDir(publicDir), 'cut-2026-10-19T20-00-00-000-4.mp4'), 'utf8')).toBe('keep')
  })

  it('refuses before writing anything: no ffmpeg 503, bad cut 400, unknown performance 404', async () => {
    const { publicDir, probe } = rig()
    const run = vi.fn()
    expect(await expectCode(new CutJob(publicDir, { run, probe, ffmpegOk: async () => false }).start(PACK, SEGS), 503)).toBe(FFMPEG_MISSING)
    const ok = new CutJob(publicDir, { run, probe, ffmpegOk: async () => true })
    expect(await expectCode(ok.start(PACK, [SEGS[0], { takeId: FINISHED_B, in: 45, out: 70 }]), 400)).toMatch(/starts at 45/)
    expect(await expectCode(ok.start(PACK, [{ takeId: DRAFT_B, in: 0, out: 20 }]), 400)).toMatch(/outside the take \(12-109\)/)
    await expectCode(ok.start('nobody', SEGS), 404)
    expect(run).not.toHaveBeenCalled()
    expect(existsSync(path.join(publicDir, 'lab-assets', 'cuts'))).toBe(false)
  })

  it('a failed encode leaves no half export and reports the error; a dead owner is interrupted and does not block', async () => {
    const { publicDir, probe } = rig()
    const bad = new CutJob(publicDir, { run: async (args) => { writeFileSync(args[args.length - 1], 'half'); throw new Error('boom') }, probe, ffmpegOk: async () => true })
    await (await bad.start(PACK, SEGS)).done
    expect(bad.status()).toMatchObject({ state: 'error', error: 'boom' })
    expect(readdirSync(cutsDir(publicDir))).toEqual([])

    mkdirSync(path.join(publicDir, 'lab-assets', 'cuts'), { recursive: true })
    writeFileSync(path.join(publicDir, 'lab-assets', 'cuts', 'status.json'), JSON.stringify({ state: 'running', packId: PACK, id: 'cut-x', pid: 424242 }))
    const next = new CutJob(publicDir, { run: async (a) => writeFileSync(a[a.length - 1], 'v'), probe, ffmpegOk: async () => true, alive: () => false })
    expect(next.status().state).toBe('interrupted')
    await (await next.start(PACK, SEGS)).done
    expect(next.status().state).toBe('done')
  })
})
