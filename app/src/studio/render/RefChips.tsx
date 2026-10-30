import type { LightboxItem } from '../ui'
import type { RefChip } from './l2rExtra'
import { SafeImg } from './SafeImg'

/** the chips the lightbox walks: every picture (the layout chip is a video and stays a thumbnail) */
export const pictureChips = (chips: RefChip[] | undefined): RefChip[] => (chips ?? []).filter((c) => c.role !== 'layout')
export const chipItem = (c: RefChip): LightboxItem => ({ src: c.url, label: `${c.label}${c.sent ? '' : ' · not sent'}` })

/**
 * Every image this Render uses. Sent chips are the graph's own binds (the server builds the strip from the list it submits, so it
 * cannot claim more); the others are the Bible's references the stills were drawn from, shown dimmed and marked "in the stills".
 * A picture opens full size (`onOpen` with its index among pictureChips).
 */
export function RefChips({ chips, onOpen }: { chips: RefChip[] | undefined; onOpen?: (i: number) => void }) {
  if (!chips?.length) return null
  const pics = pictureChips(chips)
  return (
    <div className="st-chips" data-testid="l2r-chips">
      {chips.map((c, i) => (
        <figure key={`${c.role}-${i}`} className={`st-chip${c.sent ? '' : ' st-chip-ref'}`} data-testid={`l2r-chip-${c.role}`} data-sent={c.sent}>
          {c.role === 'layout' ? <video src={c.url} muted playsInline preload="metadata" />
            : <button type="button" className="st-chip-open" title="Open full size" data-testid={`l2r-chip-open-${c.role}`} onClick={() => onOpen?.(pics.indexOf(c))}><SafeImg src={c.url} alt={c.label} className="st-l2r-gap st-chip-gap" line="Not available yet" /></button>}
          <figcaption>{c.label}{c.sent ? '' : ' · not sent'}</figcaption>
        </figure>
      ))}
    </div>
  )
}
