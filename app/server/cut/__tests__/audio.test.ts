// Cut's sound from the performance: renders are video-only, so a cut carries the approved Perform take's track over the
// cut's clock range. The sync test runs the real export (CutJob -> buildCutArgs -> ffmpeg) on a click track: a click at
// every whole performance second must land where that performance frame lands in the cut, whichever take (and window
// offset) shows it. Skipped when ffmpeg is not on PATH.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { CutTake } from '../../../src/labs/projection/cut/model.ts'
import { buildCutArgs } from '../args.ts'
import { performanceAudio, performanceAudioCandidates } from '../audio.ts'
import { CutJob } from '../job.ts'
import { parseCutRequest } from '../request.ts'
import { ffmpegAvailable, ffprobeProbe, type Prober } from '../takes.ts'

const SID = 'perf-2026-10-21T09-00-00-000Z'
const PACK = 'perf-2026-10-21t09-00-00-000z-b1-t1-lift'
const take = (o: Partial<CutTake>): CutTake => ({ id: 'a', warpFolder: 'warp-a', kind: 'final', file: 'a.mp4', url: '', width: 64, height: 36, frames: 49, sourceStart: 0, hasAudio: false, stamp: '1', ...o })
const roots: string[] = []
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }) })

/** a public dir with the pack (video-only source clip) and its Perform session's approved take */
function performance(): { pub: string; takeClip: string; packClip: string } {
  const pub = mkdtempSync(path.join(tmpdir(), 'cut-audio-'))
  roots.push(pub)
  const pack = path.join(pub, 'lab-assets', 'performances', PACK)
  const takes = path.join(pub, 'lab-assets', 'perform', SID, 'takes')
  mkdirSync(pack, { recursive: true }); mkdirSync(takes, { recursive: true })
  writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify({ id: PACK, sourceClip: 'source.mp4' }))
  writeFileSync(path.join(pack, 'lift.json'), JSON.stringify({ clip: 'b1-t1.mp4' }))
  return { pub, takeClip: path.join(takes, 'b1-t1.mp4'), packClip: path.join(pack, 'source.mp4') }
}

describe('where the performance sound is', () => {
  it('the pack clip first, then the approved take of the session the pack id names (case-insensitive)', async () => {
    const p = performance()
    expect(performanceAudioCandidates(p.pub, PACK)).toEqual([p.packClip, p.takeClip])
    writeFileSync(p.packClip, 'v'); writeFileSync(p.takeClip, 'av')
    const probe: Prober = async (f) => ({ width: 64, height: 36, frames: 97, hasAudio: readFileSync(f, 'utf8') === 'av' })
    expect(await performanceAudio(p.pub, PACK, probe)).toBe(p.takeClip) // the lifted pack clip is video-only
    expect(await performanceAudio(p.pub, 'perf-other-b1-t1-lift', probe)).toBeNull()
    expect(performanceAudioCandidates(p.pub, '../x')).toEqual([])
  })

  it('a request may ask for either; nothing else', () => {
    const seg = [{ takeId: 'warp-a/final-x', in: 0, out: 24 }]
    expect(parseCutRequest({ packId: PACK, segments: seg, audio: 'performance' }).audio).toBe('performance')
    expect(parseCutRequest({ packId: PACK, segments: seg }).audio).toBeUndefined()
    expect(() => parseCutRequest({ packId: PACK, segments: seg, audio: 'loud' })).toThrow(/audio/)
  })
})

describe('buildCutArgs with the performance track', () => {
  it('one continuous trim of the performance clock, never the takes\' own (offset) audio', () => {
    const args = buildCutArgs([
      { seg: { takeId: 'a', in: 20, out: 40 }, take: take({ sourceStart: 12 }), file: 'A.mp4' },
      { seg: { takeId: 'b', in: 40, out: 60 }, take: take({ id: 'b', hasAudio: true }), file: 'B.mp4' },
    ], { width: 64, height: 36 }, 'o.mp4', { mode: 'performance', file: 'P.mp4' })
    const fc = args[args.indexOf('-filter_complex') + 1]
    expect(args.filter((a) => a === '-i')).toHaveLength(3)
    expect(args[args.lastIndexOf('-i') + 1]).toBe('P.mp4')
    expect(fc).toContain('[0:v]trim=start_frame=8:end_frame=28') // take frame = performance frame - sourceStart
    expect(fc).toContain(`[2:a]atrim=start=${20 / 24}:end=${60 / 24},asetpts=PTS-STARTPTS`)
    expect(fc).toContain('concat=n=2:v=1:a=0[v]')
    expect(fc).not.toMatch(/\[[01]:a\]/)
    expect(args).toContain('aac')
  })
})

const has = await ffmpegAvailable()
const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
const video = (file: string, n: number) => ff(['-f', 'lavfi', '-i', 'testsrc=size=64x36:rate=24', '-frames:v', String(n), '-pix_fmt', 'yuv420p', '-an', file])

/** Onsets (seconds) of the 1 kHz bursts in a file's audio. */
function clicks(file: string): number[] {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '48000', '-'], { maxBuffer: 1 << 26 })
  const pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1)
  const out: number[] = []
  let quiet = 4800
  for (let i = 0; i < pcm.length; i++) {
    if (Math.abs(pcm[i]) > 6000) { if (quiet >= 4800) out.push(i / 48000); quiet = 0 } else quiet++
  }
  return out
}

describe.skipIf(!has)('a cut of video-only renders plays the performance in sync (real ffmpeg)', () => {
  it('a click at every performance second lands at (frame - cut start) / 24 across two takes with different windows', async () => {
    const p = performance()
    // the approved take: 96 frames with a 10 ms 1 kHz burst at t = 0, 1, 2, 3 s (performance frames 0, 24, 48, 72)
    ff(['-f', 'lavfi', '-i', 'testsrc=size=64x36:rate=24', '-f', 'lavfi', '-i', "aevalsrc=exprs='if(lt(mod(t,1),0.01),0.8*sin(6283.185*t),0)':s=48000:d=4",
      '-frames:v', '96', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p.takeClip])
    video(p.packClip, 96)
    expect(clicks(p.takeClip).map((t) => Math.round(t * 1000))).toEqual([0, 1000, 2000, 3000])
    // two camera moves of the performance, video only: A starts at performance frame 12, B at 0
    const renders = path.join(p.pub, 'lab-assets', 'renders')
    for (const [warp, start, n] of [['warp-2026-10-21T10-00-00', 12, 49], ['warp-2026-10-21T11-00-00', 0, 73]] as const) {
      mkdirSync(path.join(renders, warp), { recursive: true })
      writeFileSync(path.join(renders, warp, 'cameras.json'), JSON.stringify({ packId: PACK, sourceStart: start }))
      video(path.join(renders, warp, 'final-2026-10-21T12-00-00-000.mp4'), n)
    }
    const job = new CutJob(p.pub, { probe: ffprobeProbe })
    const { done } = await job.start(PACK, [
      { takeId: 'warp-2026-10-21T10-00-00/final-2026-10-21T12-00-00-000', in: 20, out: 40 },
      { takeId: 'warp-2026-10-21T11-00-00/final-2026-10-21T12-00-00-000', in: 40, out: 60 },
    ])
    await done
    const st = job.status()
    expect(st).toMatchObject({ state: 'done' })
    const out = path.join(p.pub, st.output!.replace(/^\//, ''))
    const meta = JSON.parse(readFileSync(out.replace(/\.mp4$/, '.json'), 'utf8'))
    expect(meta.audio).toEqual({ mode: 'performance', file: `lab-assets/perform/${SID}/takes/b1-t1.mp4` })
    // performance frames 24 and 48 -> cut seconds (24-20)/24 and (48-20)/24; a take-relative trim would be 0.5 s off
    const got = clicks(out)
    expect(got).toHaveLength(2)
    expect(Math.abs(got[0] - 4 / 24)).toBeLessThan(0.01)
    expect(Math.abs(got[1] - 28 / 24)).toBeLessThan(0.01)
  }, 120_000)
})
