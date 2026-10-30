/**
 * The chip strip: every image a Render uses, built from the SAME list `binds` is built from, so the strip cannot say a thing
 * is sent when it is not. `sent` chips are the graph's binds (the clay, the opening still, the mid / end keyframes). The
 * Bible's references (master, face, gear, creature sheet, extras sheet) are drawn into the stills, not sent to the video
 * model: they are listed with `sent: false` so the owner sees what the look descends from, and the master is also the grade target.
 */
import type { BibleRecord } from '../../src/shared/bibleContract.ts'
import type { RefChip } from '../../src/studio/render/l2rExtra.ts'
import { l2rBinds } from './graph.ts'

export interface SentRefs { clay: string; opening: string; mid?: string; end?: string }

/** the binds the render submits, as [node, field, source] with the public URLs as sources (run.ts swaps in the files) */
export const sentChips = (r: SentRefs, frames: { mid?: number; end?: number } = {}): RefChip[] => {
  const labels: RefChip[] = []
  const binds = l2rBinds(r.clay, r.opening, { mid: r.mid, end: r.end })
  // binds are [clay, opening, mid?, end?] in order; an empty opening (none approved) is not an image Render uses: no chip
  const roleOf: RefChip['role'][] = ['layout', 'opening', ...(r.mid ? ['mid' as const] : []), ...(r.end ? ['end' as const] : [])]
  binds.forEach(([node, field, url], i) => {
    const role = roleOf[i]
    if (!url) return
    const label = role === 'layout' ? 'Layout · 3D set preview' : role === 'opening' ? 'Look · opening still' : `${role === 'mid' ? 'Mid' : 'End'} keyframe · frame ${role === 'mid' ? frames.mid : frames.end}`
    labels.push({ role, label, url, sent: true, bind: `${node}.${field}` })
  })
  return labels
}

const ELEMENT_ROLE = { cast: ['face', 'gear'], creature: ['creature'], extras: ['extras'], prop: ['prop'], material: ['material'] } as const

/** the Bible's reference images (never sent as binds; grade target first) */
export function bibleChips(bible: BibleRecord | null): RefChip[] {
  if (!bible) return []
  const out: RefChip[] = []
  if (bible.master) out.push({ role: 'master', label: 'Master · grade target and source of the stills', url: bible.master.png, sent: false })
  for (const e of bible.elements) {
    const roles = ELEMENT_ROLE[e.kind]
    e.refs.forEach((url, i) => out.push({ role: roles[Math.min(i, roles.length - 1)], label: `@${e.tag} · ${roles[Math.min(i, roles.length - 1)]} (in the stills)`, url, sent: false }))
  }
  if (bible.extrasSheet && !out.some((c) => c.url === bible.extrasSheet!.png)) out.push({ role: 'extras', label: 'Extras sheet (in the stills)', url: bible.extrasSheet.png, sent: false })
  return out
}
