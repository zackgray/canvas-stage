// The v2 scene brief on the Scene design: what the Bible save carries (the logline read from the brief's text, tag stubs), the
// field-edit helper the tests of the sheet's staleness use (editAt), and the brief's own check (the server's is
// server/planner/briefV2.ts). Pure.
import type { BriefElementType } from '../../../shared/bibleContract'
import type { SceneBriefV2 } from '../../../shared/briefContract'
import { biblePrompt } from './briefText'
import type { Piece } from './model'

const parts = (path: string) => path.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k))
function put(node: unknown, ks: (string | number)[], value: unknown): unknown {
  if (!ks.length) return value
  const [k, ...rest] = ks
  if (Array.isArray(node)) return node.map((x, i) => (i === k ? put(x, rest, value) : x))
  const o = (node ?? {}) as Record<string, unknown>
  return { ...o, [k]: put(o[k as string], rest, value) }
}
/** the brief with one field set; its path joins `user` (once). Used by the sheet-staleness tests' edits; the page saves whole briefs */
export function editAt(v: SceneBriefV2, path: string, value: unknown): SceneBriefV2 {
  const next = put(v, parts(path), value) as SceneBriefV2
  return { ...next, user: [...new Set([...(v.user ?? []), path])] }
}

/** the lines the Bible derives from the brief (server/bible/briefLines.ts) are stale once one of these was in the user's list */
export const flatTouched = (v: SceneBriefV2) => !!v.user?.some((p) => /^(light|elements|background)(\.|$)/.test(p))

const ELEMENT_TYPES: readonly string[] = ['person', 'creature', 'group', 'prop']
/** the server's logline cap (server/planner/briefV2.ts V2_LIMITS.logline) */
export const LOGLINE_MAX = 1500
/**
 * The brief as the Bible saves it: the logline is the design's brief text (look tags as their words, whole sentences within the
 * logline's 1500, the server's cap: Develop's paragraph is the full developed brief), and a tag in it with no element gets a plain
 * stub so the saved brief stays consistent.
 */
export function bibleBrief(v: SceneBriefV2 | null | undefined, brief: string, pieces: readonly Piece[]): SceneBriefV2 | undefined {
  if (!v) return undefined
  const text = brief.trim() ? biblePrompt(brief, pieces).replace(/\s+/g, ' ').trim() : v.logline
  const logline = text.length > LOGLINE_MAX ? (text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text]).reduce((a, s) => ((a + s).trim().length <= LOGLINE_MAX ? a + s : a), '').trim() || text.slice(0, LOGLINE_MAX) : text
  const have = new Set(v.elements.map((e) => e.tag))
  const stubs = [...logline.matchAll(/(?<![A-Za-z0-9_])@([a-z][a-z0-9_-]*)/g)].map((m) => m[1]).filter((t, i, all) => !have.has(t) && all.indexOf(t) === i)
    .map((tag) => {
      const p = pieces.find((q) => q.tag === tag)
      const type = (ELEMENT_TYPES.includes(p?.type ?? '') ? p!.type : 'person') as BriefElementType
      return { name: p?.name ?? tag, tag, type, look: p?.line ?? '', supported: true, materials: '', condition: '', face: '' }
    })
  if (logline === v.logline && !stubs.length) return v
  return { ...v, logline, elements: [...v.elements, ...stubs], user: logline === v.logline ? v.user : [...new Set([...(v.user ?? []), 'logline'])] }
}

/** a tag renamed on the board, followed through the brief (logline, elements, beats) */
export function renameTag(v: SceneBriefV2, from: string, to: string): SceneBriefV2 {
  const re = new RegExp(`@${from}(?![a-z0-9_-])`, 'g')
  return { ...v, logline: v.logline.replace(re, `@${to}`), elements: v.elements.map((e) => (e.tag === from ? { ...e, tag: to } : e)),
    beats: v.beats.map((b) => ({ ...b, who: b.who.replace(re, `@${to}`), does: b.does.replace(re, `@${to}`) })) }
}

/** a brief the server's check will take: its three hard minimums (logline length, an element, a beat) */
export const savable = (v: SceneBriefV2) => v.logline.trim().length >= 20 && v.elements.length > 0 && v.beats.length > 0
