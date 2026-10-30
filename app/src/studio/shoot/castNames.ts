// Who a figure on the stage is, in the Bible's words: the hero is the cast element on the kit performance's card ("@aldric"),
// a creature the creature element of its kind. Read once per world (GET only); no Bible, or no match, = the plain fallback.
import { useEffect, useState } from 'react'
import type { BibleRecord } from '../../shared/bibleContract'
import { tagWords } from '../../shared/tagWords'
import { readBible } from '../stage/panels/blocking/bibleTags'

/** the Bible tag of whoever plays the hero: the cast element on `castId`'s card, else the Bible's only cast element; null = none */
export function heroTag(bible: BibleRecord | null, castId?: string | null): string | null {
  const cast = (bible?.elements ?? []).filter((e) => e.kind === 'cast')
  const on = castId ? cast.find((e) => e.cardId === castId) : undefined
  return on?.tag ?? (cast.length === 1 ? cast[0].tag : null)
}

/** a tag said as its plain name, never the @ syntax: the brief's name for it with the article English needs ("Maria", "the
 *  beekeeper"), else its own words ("old_mill" -> "the old mill"); `lead` = it starts a sentence */
export function tagSaid(bible: BibleRecord | null, tag: string, lead = false): string {
  const brief = bible?.brief?.elements ?? []
  // a cast member the brief does not name is said as a proper name from its tag ("aldric" -> "Aldric")
  const cast = (bible?.elements ?? []).filter((e) => e.kind === 'cast' && !brief.some((b) => b.tag === e.tag))
    .map((e) => { const w = e.tag.replace(/[_-]+/g, ' '); return { tag: e.tag, name: `${w.charAt(0).toUpperCase()}${w.slice(1)}`, type: 'person' } })
  const els = [...brief, ...cast]
  return lead ? tagWords(`@${tag}`, els) : tagWords(`x @${tag}`, els).slice(2)
}

/** a stage entity tag ('hero', 'creature:dragon', 'extra:2:1') as its plain name ('Aldric', 'The dragon'), or undefined (the caller falls back) */
export function entityName(bible: BibleRecord | null, castId: string | null | undefined, entity: string): string | undefined {
  if (entity === 'hero') { const t = heroTag(bible, castId); return t ? tagSaid(bible, t, true) : undefined }
  const creature = /^creature:(.+)$/.exec(entity)?.[1]
  const el = creature ? (bible?.elements ?? []).find((e) => e.kind === 'creature' && e.tag === creature) : undefined
  return el ? tagSaid(bible, el.tag, true) : undefined
}

/** the world's Bible, read once per world id (null while loading, with none, or with no world) */
export function useWorldBible(worldId: string | null | undefined): BibleRecord | null {
  const [got, setGot] = useState<{ id: string; bible: BibleRecord | null } | null>(null)
  useEffect(() => {
    if (!worldId) return
    let live = true
    readBible(worldId).then((b) => { if (live) setGot({ id: worldId, bible: b }) }, () => { if (live) setGot({ id: worldId, bible: null }) })
    return () => { live = false }
  }, [worldId])
  return got && got.id === worldId ? got.bible : null
}
