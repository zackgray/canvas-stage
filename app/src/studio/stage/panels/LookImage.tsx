// The object card's one picture (object card wave): a look or a prop picture never shows as a blank flat card while its file is
// still writing or a cached empty frame arrived first (blank-look-thumbnail). Until the image has loaded it shows a busy shimmer;
// a failed load retries once with the cache skipped (the file may land a moment later), and only then says the picture is missing.
import { useEffect, useRef, useState } from 'react'

export function LookImage({ src, alt = '', className, testId }: { src: string; alt?: string; className?: string; testId?: string }) {
  const [state, setState] = useState<'loading' | 'error' | 'ok'>('loading')
  const attempt = useRef(0)
  useEffect(() => {
    attempt.current = 0
    setState('loading')
    let live = true
    const load = () => {
      const img = new Image()
      img.onload = () => { if (live) setState('ok') }
      img.onerror = () => {
        if (!live) return
        if (attempt.current === 0) { attempt.current = 1; setTimeout(() => live && load(), 600) } // one retry: the file may still be writing
        else setState('error')
      }
      img.src = attempt.current === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=1`
    }
    load()
    return () => { live = false }
  }, [src])
  if (state === 'ok') return <img src={src} alt={alt} className={className} data-testid={testId} draggable={false} />
  return (
    <span className={`oc-imgwait${state === 'error' ? ' oc-imgbad' : ''}`} data-testid={testId ? `${testId}-wait` : undefined}
      role={state === 'error' ? 'img' : undefined} aria-label={state === 'error' ? `${alt} did not load` : undefined}>
      {state === 'error' && <span className="oc-imgbad-note">This picture did not load.</span>}
    </span>
  )
}
