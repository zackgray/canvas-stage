/**
 * A prop's or material's line as the OBJECT's own words, for the swap of its @tag in the render and the first-frame draw (owner
 * 10-29: "@grandstand" came out "a straight on photo of a race track grand stand stadium"). The line is stored as the concept draw's
 * words, so it may open with how it was pictured ("A straight on photo of …", "A product photograph of …") or carry a view
 * ("seen from the side"); the render and the draw choose their own camera, so none of that goes in. The shared detectors do the
 * work: VIEW / SIDE (scene/conceptText.ts) for views, MEDIUM (prompt/style.ts) for a stated medium. Nothing left: the piece's
 * label. Pure.
 */
import { SIDE, VIEW } from '../scene/conceptText.ts'

const KIND = String.raw`(?:photos?|photographs?|pictures?|images?|renders?|renderings?|shots?|views?|drawings?|illustrations?|paintings?|sketch(?:es)?)`
/** "A straight on photo of", "A product photograph of", "A close-up picture showing": the way it was pictured, not the object */
const OPENER = new RegExp(String.raw`^\s*(?:an?|the)?\s*(?:[\w/-]+\s+){0,4}?${KIND}\s+(?:of|showing|depicting)\s+`, 'i')
const PHOTO = /\b(?:(?:an?|the)\s+)?(?:(?:straight[- ]on|real)\s+)?photo(?:graph(?:ic|ed|y)?)?s?(?:\s+of)?\b/gi

const global = (r: RegExp) => new RegExp(r.source, 'gi')

export function objectWords(line: string, label = ''): string {
  let d = (line ?? '').replace(/\s+/g, ' ').trim()
  d = d.replace(OPENER, '')
  // a view phrase goes with the comma that sets it off
  for (const r of [global(VIEW), global(SIDE)]) d = d.replace(r, (m) => (/^[.,;:]/.test(m) ? m : ''))
  d = d.replace(PHOTO, '').replace(/\s+([,.;:!?])/g, '$1').replace(/(?:,\s*)+([.!?]|$)/g, '$1').replace(/^[\s,;:]+/, '').replace(/\s{2,}/g, ' ').trim()
  const words = d.replace(/[.!?]+$/, '').trim()
  if (!words) return label.replace(/[_-]+/g, ' ').trim()
  // an opener cut off the article ("a race track grand stand"): put one back
  const out = /^(?:an?|the|his|her|their|its|some|two|three|four|five|six|several|many)\b/i.test(words) ? words : `a ${words}`
  return /[.!?]$/.test(d) ? `${out}.` : out
}
