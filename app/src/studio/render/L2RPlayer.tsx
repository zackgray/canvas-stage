import { useRef, useState } from 'react'
import type { L2RRender } from '../../shared/shotContract'
import { Seg } from '../Seg'

type Cut = 'finished' | 'raw'

/** One L2R render's video with a Finished / Raw toggle; the play position carries across the toggle. */
export function L2RPlayer({ render, testId = 'l2r-player' }: { render: L2RRender; testId?: string }) {
  const [picked, setPicked] = useState<Cut | null>(null)
  const el = useRef<HTMLVideoElement>(null)
  const at = useRef(0)
  const cut: Cut = picked === 'raw' || !render.finished ? 'raw' : 'finished'
  // a finish again writes the same file name: the time it landed keeps the player from showing the old cut
  const url = cut === 'finished' ? render.finished && `${render.finished}${render.finishedAt ? `?v=${Date.parse(render.finishedAt)}` : ''}` : render.raw
  if (!url) return null
  return (
    <div className="st-l2r-player" data-testid={testId}>
      <video ref={el} key={url} src={url} autoPlay loop muted playsInline controls data-testid={`${testId}-video`}
        onLoadedMetadata={(e) => { if (at.current) e.currentTarget.currentTime = at.current }} />
      <Seg label="Render cut" small value={cut} testId={`${testId}-cut`}
        items={[{ id: 'finished', label: 'Finished', disabled: !render.finished, title: render.finished ? undefined : 'not finished yet' }, { id: 'raw', label: 'Raw' }]}
        onChange={(v) => { at.current = el.current?.currentTime ?? 0; setPicked(v) }} />
    </div>
  )
}
