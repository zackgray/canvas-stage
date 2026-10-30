// The Prompt box's @tags as coloured chips while it is a plain text box (owner 10-29: folded, the line showed @driver and @car2 as
// chips; open, the raw words). A copy of the words sits behind the textarea, the tags tinted as the folded line's chips are
// (CHIP_CLS, the same `runs` parse), and the textarea's own text is transparent over it, so typing, the caret, selection, the @ menu,
// paste, IME and resize stay the browser's own. The copy follows the box's font, padding, wrap and size as computed, and its scroll,
// so a long prompt lines up after scrolling. The chips here keep the text's own width (no padding, border or bold): a pill drawn
// round the letters, never a wider word that would push the copy out of line with the caret.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { runs } from '../scene/design/briefText'
import { CHIP_CLS } from '../scene/design/model'
import type { PieceType } from '../scene/briefApi'
import './tagHighlight.css'

/** what the copy takes from the textarea, so its lines wrap exactly where the box's do */
const COPIED = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch',
  'fontVariant', 'fontKerning', 'fontFeatureSettings', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform', 'tabSize',
  'whiteSpace', 'wordBreak', 'overflowWrap', 'direction'] as const

/** the copy over the box's own geometry: inside its border, its client size (no scrollbar), scrolled as it is */
export function syncCopy(ta: HTMLTextAreaElement, copy: HTMLElement): void {
  const cs = getComputedStyle(ta)
  const s = copy.style as unknown as Record<string, string>
  for (const k of COPIED) s[k] = (cs as unknown as Record<string, string>)[k]
  copy.style.left = `${ta.offsetLeft + ta.clientLeft}px`
  copy.style.top = `${ta.offsetTop + ta.clientTop}px`
  copy.style.width = `${ta.clientWidth}px`
  copy.style.height = `${ta.clientHeight}px`
  copy.scrollTop = ta.scrollTop
  copy.scrollLeft = ta.scrollLeft
}

export interface TagLook { type?: PieceType; gone: boolean }

/** the words as the copy shows them: text runs and tag chips; a closing newline gets a space so the last empty line has height */
export function TagRuns({ text, look }: { text: string; look: (tag: string) => TagLook }) {
  const shown = text.endsWith('\n') ? `${text} ` : text
  return (
    <>
      {runs(shown).map((m, i) => {
        if (!('tag' in m)) return <span key={i}>{m.text}</span>
        const l = look(m.tag)
        return <span key={i} className={`st-hl-tag ${l.type ? CHIP_CLS[l.type] : ''}${l.gone ? ' gone' : ''}`} data-testid="hl-tag" data-tag={m.tag}>@{m.tag}</span>
      })}
    </>
  )
}

/**
 * The chip copy for `ta`, its next sibling inside a `.st-hl-wrap` (after it, so the box's ref is set when the copy hooks its scroll); `fill` paints the box's own input fill behind the words, for a
 * textarea that carries it (the take's words); a box drawn on its card's fill (the scene brief) leaves it off.
 */
export function TagHighlight({ ta, text, look, fill = false }: { ta: RefObject<HTMLTextAreaElement | null>; text: string; look: (tag: string) => TagLook; fill?: boolean }) {
  const copy = useRef<HTMLDivElement>(null)
  // every render: the words, the auto-grow height and the box's width may all have changed
  useLayoutEffect(() => { if (ta.current && copy.current) syncCopy(ta.current, copy.current) })
  useLayoutEffect(() => {
    const t = ta.current
    if (!t) return
    const on = () => { if (copy.current) syncCopy(t, copy.current) }
    t.addEventListener('scroll', on)
    window.addEventListener('resize', on)
    // the resize handle and the auto-grow change the box's size without a render
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(on)
    ro?.observe(t)
    return () => { t.removeEventListener('scroll', on); window.removeEventListener('resize', on); ro?.disconnect() }
  }, [ta])
  return <div ref={copy} className={`st-hl${fill ? ' fill' : ''}`} aria-hidden="true" data-testid="hl-copy"><TagRuns text={text} look={look} /></div>
}
