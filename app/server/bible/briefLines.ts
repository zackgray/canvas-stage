/**
 * The flat Bible lines derived from a v2 brief (briefContract.ts), so every reader of `lighting / materials / background` keeps
 * working before it reads `bible.brief` itself (prompt wave, tracks C and D). Light follows the contract's order: source ->
 * direction -> height -> quality -> colour -> effect, then any other light. Materials are each element's own, named. Pure.
 */
import type { BriefBeat, BriefElementV2, BriefLight, SceneBriefV2 } from '../../src/shared/briefContract.ts'

export const LINE_MAX = 400
const cap = (s: string) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s)
const has = (text: string, word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
const stop = (s: string) => s.replace(/[\s,;:.]+$/, '')
/** a direction that reads on from the source with no comma ("… sun from behind her") */
const PREP = /^(from|behind|above|over|below|under|beside|through|across|in front|to the|at|on|overhead|straight|high|low)\b/i

/** at most `max` characters, cut at the last clause break that fits */
export function clip(s: string, max = LINE_MAX): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const at = Math.max(cut.lastIndexOf('; '), cut.lastIndexOf(', '))
  return `${stop(at > max / 3 ? cut.slice(0, at) : cut)}.`
}

/** One sentence from the light fields; '' when the brief names no key light. */
export function lightingLine(l: BriefLight): string {
  const key = stop(l.key.trim())
  if (!key) return ''
  const dir = stop(l.direction.trim())
  const head = dir ? `${cap(key)}${PREP.test(dir) ? ' ' : ', '}${dir}` : cap(key)
  const said = `${key} ${dir}`
  const kind = [l.height, l.quality, stop(l.colour.trim())].filter((w) => w && !has(said, w))
  const parts = [head, kind.length ? `${kind.join(' ')} light` : '', stop(l.effect.trim())].filter(Boolean)
  const others = stop(l.others.trim())
  return clip(`${parts.join(', ')}${others ? `; ${others}` : ''}.`)
}

/** Each element's materials (and condition, when the idea implied one), named: "Kick wheel: oiled olive wood, worn smooth; …". */
export function materialsLine(elements: readonly BriefElementV2[]): string {
  const parts = elements.flatMap((e) => {
    const m = stop(e.materials.trim())
    const c = stop(e.condition.trim())
    return m || c ? [`${e.name}: ${[m, c].filter(Boolean).join(', ')}`] : []
  })
  let out = ''
  for (const p of parts) { const next = out ? `${out}; ${p}` : p; if (next.length + 1 > LINE_MAX) break; out = next }
  return out ? `${out}.` : ''
}

/** a beat as a plain sentence ("Potter kicks the flywheel."): the flat brief's story beats */
export function beatLine(b: BriefBeat): string {
  const who = b.who.replace(/^@/, '').replace(/[_-]+/g, ' ')
  return `${cap(`${who} ${stop(b.does.trim())}`.trim())}.`
}

/** the flat lines a Bible stores beside the brief */
export const flatLines = (b: SceneBriefV2) => ({ lighting: lightingLine(b.light), materials: materialsLine(b.elements), background: clip(b.background.trim(), 300) })
