import { useEffect, useState } from 'react'

/** A picture that may not be there (an opening still that was never approved): a plain line in its place, never a broken-image icon. */
export function SafeImg({ src, alt, line, className = 'st-l2r-gap', testId }: { src: string; alt: string; line: string; className?: string; testId?: string }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [src])
  return bad
    ? <div className={className} role="img" aria-label={alt} data-testid={testId ? `${testId}-missing` : 'picture-missing'}>{line}</div>
    : <img src={src} alt={alt} data-testid={testId} onError={() => setBad(true)} />
}
