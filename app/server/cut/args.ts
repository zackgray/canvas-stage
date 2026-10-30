/**
 * ffmpeg arguments for one cut: every segment is trimmed from its take by frame (take frame = performance frame -
 * sourceStart), scaled into the largest size used (letterboxed, never stretched), held at 24 fps and concatenated.
 * Sound, by `audio`:
 *   'performance'  the performance's own track (the approved take's dialogue, server/cut/audio.ts) for the cut's clock
 *                  range [first in, last out) / 24 s: one continuous trim, so it stays in sync across every cut whatever
 *                  window each take covers (render frame i = performance frame sourceStart + i, audio second = frame / 24).
 *   'take'         each segment's same time range of its own take (silence when that render has none), with a 15 ms
 *                  fade at each cut against clicks.
 * Pure.
 */
import { CUT_FPS, takeFrame, type CutSegment, type CutTake } from '../../src/labs/projection/cut/model.ts'

const FADE = 0.015
const AUDIO_OUT = 'aresample=48000,aformat=channel_layouts=stereo'

export interface ArgSegment { seg: CutSegment; take: CutTake; file: string }
/** `performance` carries the file whose audio track is the performance's sound. */
export type CutAudio = { mode: 'take' } | { mode: 'performance'; file: string }

export function buildCutArgs(parts: ArgSegment[], size: { width: number; height: number }, out: string, audio: CutAudio = { mode: 'take' }): string[] {
  const args: string[] = ['-hide_banner', '-loglevel', 'error', '-n']
  parts.forEach((p) => args.push('-i', p.file))
  const perf = audio.mode === 'performance' ? audio.file : null
  if (perf) args.push('-i', perf)
  const perTake = !perf && parts.some((p) => p.take.hasAudio)
  const f: string[] = []
  parts.forEach(({ seg, take }, i) => {
    const a = takeFrame(take, seg.in)
    const b = takeFrame(take, seg.out)
    const dur = (seg.out - seg.in) / CUT_FPS
    f.push(`[${i}:v]trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS,fps=${CUT_FPS},` +
      `scale=${size.width}:${size.height}:force_original_aspect_ratio=decrease,pad=${size.width}:${size.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`)
    if (!perTake) return
    const fade = Math.min(FADE, dur / 2)
    f.push(take.hasAudio
      ? `[${i}:a]atrim=start=${a / CUT_FPS}:end=${b / CUT_FPS},asetpts=PTS-STARTPTS,${AUDIO_OUT},` +
        `apad=whole_dur=${dur},atrim=end=${dur},afade=t=in:d=${fade},afade=t=out:st=${dur - fade}:d=${fade}[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=end=${dur},asetpts=PTS-STARTPTS[a${i}]`)
  })
  const pads = parts.map((_, i) => `[v${i}]${perTake ? `[a${i}]` : ''}`).join('')
  f.push(`${pads}concat=n=${parts.length}:v=1:a=${perTake ? 1 : 0}[v]${perTake ? '[a]' : ''}`)
  if (perf) {
    // performance frames -> seconds on the performance's own clock; padded so a short track never shortens the cut
    const from = parts[0].seg.in / CUT_FPS, to = parts[parts.length - 1].seg.out / CUT_FPS, dur = to - from
    f.push(`[${parts.length}:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,${AUDIO_OUT},apad=whole_dur=${dur},atrim=end=${dur}[a]`)
  }
  const withAudio = perTake || !!perf
  args.push('-filter_complex', f.join(';'), '-map', '[v]')
  if (withAudio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k')
  args.push('-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', String(CUT_FPS), '-movflags', '+faststart', out)
  return args
}
