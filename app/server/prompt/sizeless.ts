/**
 * A piece's words without its measurements (review F13). A stand-in's label is its prop's own line, and that line may carry sizes
 * ("1.2 m tall", "40 x 50 cm", "a 3-metre pole"); the size already shaped the clay piece, so an image prompt naming it only adds
 * measurement text the model cannot use. Every clause keeps its words; a clause that was nothing but a size is dropped. Pure, general.
 */

const NUM = String.raw`\d+(?:[.,]\d+)?`
const UNIT = String.raw`(?:mm|cm|m|km|metres?|meters?|millimet(?:re|er)s?|centimet(?:re|er)s?|ft|feet|foot|inch(?:es)?|")` // never a bare "in": "2 in a row" is not a size
const DIM = String.raw`(?:tall|high|long|wide|deep|across|thick|around|in (?:diameter|height|length|width)|high at the shoulder)`
const APPROX = String.raw`(?:about|around|roughly|some|nearly|almost|over|under|up to|just over|just under|approximately|approx\.?|~)`
/** "about 1.2 m tall", "40 x 50 cm", "1.2-metre-tall", "2 by 3 m", "6 ft" */
const SIZE = new RegExp(
  String.raw`(?:\b${APPROX}\s+)?${NUM}(?:\s*${UNIT})?(?:\s*(?:x|×|by)\s*${NUM})*\s*-?\s*${UNIT}(?![a-z])(?:\s*-?\s*${DIM}\b)?`, 'gi')

/** the text without size phrases; tidy commas and spaces; a clause left empty (or only "and", "tall"…) goes */
export function sizeless(text: string | undefined | null): string {
  if (!text) return ''
  const one = new RegExp(SIZE.source, 'i')
  const cut = text.replace(/\(\s*[^()]*\d[^()]*\)/g, (m) => (one.test(m) ? ' ' : m)).replace(SIZE, ' ')
  const clauses = cut.split(/\s*,\s*/).map((c) => c.replace(/\s+/g, ' ').trim())
    .map((c) => c.replace(/^(?:and|with|of)\s+(?=$)/i, '').replace(new RegExp(String.raw`^${DIM}$`, 'i'), ''))
    .filter((c) => c && !/^(?:and|with|of|a|an|the)$/i.test(c))
  return clauses.join(', ').replace(/\s+([.;:])/g, '$1').trim()
}
