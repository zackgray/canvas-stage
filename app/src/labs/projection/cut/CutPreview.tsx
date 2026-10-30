import { useEffect, useRef, useState } from 'react'
import { CUT_FPS, locate, type CutSegment, type CutTake } from './model'

/**
 * Plays the segment list in one <video> by seeking: the take of the segment under the playhead is loaded and put at
 * that clock frame; when the playhead leaves the segment the next take is loaded. Picture only (the export carries the
 * audio); seeking is approximate to a frame.
 */
export function CutPreview({ takes, segs, playhead, setPlayhead }: { takes: CutTake[]; segs: CutSegment[]; playhead: number; setPlayhead: (f: number) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const at = locate(segs, takes, playhead)
  const clipUrl = at?.take.url
  const end = segs.length ? segs[segs.length - 1].out : 0
  const last = useRef({ playhead, playing })
  last.current = { playhead, playing }

  // A new take under the playhead: load it and park on the right frame.
  useEffect(() => {
    const v = video.current
    if (!v || !clipUrl || !at) return
    const seek = () => { v.currentTime = (at.frame + 0.5) / CUT_FPS; if (last.current.playing) void v.play().catch(() => setPlaying(false)) }
    if (!v.src.endsWith(clipUrl)) { v.src = clipUrl; v.addEventListener('loadedmetadata', seek, { once: true }) }
    else if (!last.current.playing) seek()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipUrl, at?.index, playing === false ? playhead : 0])

  // While playing, the video's time is the clock.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const v = video.current
      const cur = locate(segs, takes, last.current.playhead)
      if (v && cur) {
        const f = cur.take.sourceStart + Math.floor(v.currentTime * CUT_FPS)
        if (f >= end) { setPlaying(false); v.pause(); return }
        if (f !== last.current.playhead) setPlayhead(Math.max(f, cur.take.sourceStart))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, segs, takes, end, setPlayhead])

  useEffect(() => { if (!playing) video.current?.pause() }, [playing])

  return (
    <div className="cut-preview">
      <video ref={video} muted playsInline data-testid="cut-preview" />
      <div className="pl-buttons">
        <button onClick={() => {
          const v = video.current
          if (playing) { setPlaying(false); return }
          const from = playhead >= end - 1 ? segs[0].in : playhead
          if (from !== playhead) setPlayhead(from)
          setPlaying(true)
          // start the video here, inside the click: nothing else calls play() unless the take under the playhead changes
          const cur = locate(segs, takes, from)
          if (v && cur && v.src.endsWith(cur.take.url)) { v.currentTime = (cur.frame + 0.5) / CUT_FPS; void v.play().catch(() => setPlaying(false)) }
        }} data-testid="cut-play">{playing ? 'Pause' : 'Play cut'}</button>
        <span className="pl-note">clock frame {playhead}{at ? ` · segment ${at.index + 1}` : ''}</span>
      </div>
    </div>
  )
}
