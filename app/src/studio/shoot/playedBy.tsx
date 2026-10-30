// Who plays the 3D performer. The hero still and the render refuse until the world's performance names a cast card (Blocking >
// Played by), and Quick never asked. So: a scene with exactly one cast character has it picked here, once, free; a scene with
// several asks right above the still's button instead of leaving the refusal to appear below the fold.
import { useEffect, useRef, useState } from 'react'
import type { KitPerformance } from '../../../server/stage3d/types'
import { getKitWorld, saveKitPerformance } from '../../labs/projection/stage3d/kitApi'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { BIBLE_CHANGED } from '../scene/bibleApi'
import { Select } from '../ui'
import { readBible, tagOptions, type TagOption } from '../stage/panels/blocking/bibleTags'

export interface PlayedBy {
  /** the cast characters the scene's Bible holds (those with a card), when the performer has no one yet; else empty */
  options: TagOption[]
  pick: (cardId: string) => Promise<void>
  error: string | null
}

/** who could play the performer on the world on the set: nothing to offer once someone is named (or the world is not loaded) */
export function usePlayedBy(lab: ProjectionLabState): PlayedBy {
  const world = lab.kit?.world ?? null
  const named = !!world?.perf.castId
  const [cast, setCast] = useState<{ id: string; options: TagOption[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tried = useRef<string | null>(null)
  const id = world?.id ?? null
  useEffect(() => {
    if (!id || named) return
    let live = true
    const read = () => readBible(id).then((b) => { if (live) setCast({ id, options: tagOptions(b, 'cast') }) }, () => { if (live) setCast({ id, options: [] }) })
    void read()
    const on = () => void read() // a Bible write (a cast tile approved) may have just given the scene its character
    window.addEventListener(BIBLE_CHANGED, on)
    return () => { live = false; window.removeEventListener(BIBLE_CHANGED, on) }
  }, [id, named])
  const options = !world || named || cast?.id !== id ? [] : cast.options
  /** the pick goes onto the world as the server has it now, never the copy this page loaded (a Blocking save meanwhile stays, m-5) */
  const pick = async (cardId: string, auto = false) => {
    if (!world) return
    setError(null)
    try {
      const fresh = await getKitWorld(world.id)
      if (auto && fresh.perf.castId) return // someone was named meanwhile (Blocking, another tab): theirs stands
      const plan: KitPerformance = { ...fresh.perf, castId: cardId } // the card only: one neutral figure, never a costume
      await saveKitPerformance(world.id, plan)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  // exactly one character: it plays the performer, once per world (a refused save is not retried in a loop)
  useEffect(() => {
    if (world && options.length === 1 && tried.current !== world.id) { tried.current = world.id; void pick(options[0].cardId!, true) }
  }) // eslint-disable-line react-hooks/exhaustive-deps
  return { options, pick, error }
}

/** several characters and no one named: the ask, next to the button that needs the answer */
export function PlayedByAsk({ lab }: { lab: ProjectionLabState }) {
  const p = usePlayedBy(lab)
  if (p.options.length < 2) return p.error ? <p className="st-warn" data-testid="played-by-error">{p.error}</p> : null
  return (
    <section data-testid="played-by-ask">
      <p className="st-warn">Pick who plays the performer before drawing a frame.</p>
      <Select label="Played by" value="" testId="played-by" onChange={(v) => v && void p.pick(v)}
        options={[{ value: '', label: 'choose a character' }, ...p.options.map((o) => ({ value: o.cardId!, label: o.label }))]} />
      {p.error && <p className="st-warn" data-testid="played-by-error">{p.error}</p>}
    </section>
  )
}
