// The person card (object card wave): everything about the picked person lives in this one dialog, the same pattern as the prop.
//   Who plays them: the world's performer names a Cast card — their card, its per-scene looks (the Guided card's candidates: the
//     history strip reopens them on every click, nothing lost, the draft is the scene's own); a pick + Use this look is the one
//     free press (personLook.ts). Nobody yet: the maker of their look is right here, and 'Swap to a saved person' names a project
//     card the performer (free, playSubject). The 'Rules every look follows' box is gone from here and from the prompt (the legal
//     side is the user's); ADVANCED keeps 'How the picture is taken' and the short 'no logos or printed text' line, each Reset.
// (This module is the person side of ObjectCard.tsx; the old right-panel 'Who plays them' list and the left rail are retired.)
import { useEffect, useState } from 'react'
import type { KitWorld } from '../../../labs/projection/stage3d/kitApi'
import { useCastCards } from '../../scene/castCards'
import { castCard, freshGuided } from '../../scene/design/guided'
import { cardLook, useSheetElements } from '../scene/castPeople'
import { playSubject, takeLook } from '../scene/personLook'
import { useStageScene } from '../scene/StageScene'
import { Select } from '../../ui'
import { ObjectCard } from './ObjectCard'
import { PersonLookAdvanced, PersonLookMaker } from './PersonLookMaker'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** the one dialog for the picked person; null until the scene design (and so the person's card) exists. The outer only reads
 *  the scene context: everything else (the cast library, the sheet) needs the providers that come with it. */
export function PersonCard({ world, onClose }: { world: KitWorld | null; onClose: () => void }) {
  const st = useStageScene()
  if (!st || !world) return null
  return <PersonCardLive world={world} onClose={onClose} />
}

function PersonCardLive({ world, onClose }: { world: KitWorld; onClose: () => void }) {
  const st = useStageScene()!
  const worldId = world.id
  const bible = st.x.bible
  const { cards } = useCastCards()
  const sheet = useSheetElements(bible!, worldId) // the Stage's design copy always carries the sheet routes
  const [run, setRun] = useState<{ url: string; busy: boolean; error: string | null } | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const d = st.x.s.d
  const castId = world.perf.castId ?? null
  const playing = castId ? cards.find((k) => k.id === castId) ?? null : null
  // the Guided card this person is made through: the performer's own (its fixed.cardId); with nobody playing, the scene's first
  // person not used yet, else its last used one (a failed use keeps the card: Try again must find it, never a duplicate)
  let c = d?.guided?.cast.find((k) => castId && k.fixed?.cardId === castId) ?? null
  if (!c && d?.guided) {
    const people = d.guided.cast.filter((k) => k.type === 'person')
    c = people.find((k) => !k.fixed) ?? people.at(-1) ?? null
  }
  // the card is made the moment the dialog opens, so its looks persist per scene from the first click (nothing is lost by
  // closing) — but only once the scene's own draft has been read: writing earlier would clobber it with a blank card
  useEffect(() => {
    if (!d || c || !st.x.s.synced || !Array.isArray(sheet.elements)) return
    const el = castId ? sheet.elements.find((e) => e.kind === 'cast' && e.cardId === castId) : undefined
    const k = castCard(playing?.name ?? '', 'person', playing?.versions.at(-1)?.payload.description ?? '',
      el && castId ? { tag: el.tag, look: cardLook(playing ?? undefined), cardId: castId } : undefined)
    st.x.s.set((y) => ({ guided: y.guided ? { ...y.guided, cast: [...y.guided.cast, k] } : freshGuided([k]) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the card is created once per person, not per render
  }, [st, world, !!c, st.x.s.synced, sheet.elements, castId])
  if (!c || !st.x.s.synced) return null // the card pops in once the scene's own draft has been read
  const x = st.x
  const nobody = !castId
  /** Use this look (free): they play the subject when nobody does; a new look of the player saves the card's next version.
   *  Done, the card closes (the right panel's Who plays them shows them); a refusal stays here, said in a plain sentence. */
  const useLook = (url: string) => {
    setRun({ url, busy: true, error: null })
    takeLook(st, world.id, c!.id, url)
      .then(() => { setRun(null); onClose() }, (e: unknown) => setRun({ url, busy: false, error: message(e) }))
  }
  const swapTo = (cardId: string) => {
    setPickError(null)
    playSubject(st, world.id, cardId)
      .then(() => sheet.reread(), (e: unknown) => setPickError(`They were not made the subject: ${message(e)}`))
  }
  const others = cards.filter((k) => k.id !== castId)
  return (
    <ObjectCard kind="person" name={c.name} onRename={(v) => x.c.patchCard(c!.id, { name: v })} namePlaceholder="Their name"
      look={<>
        {nobody && (
          <p className="st-warn" role="alert" data-testid="look-nobody">Nobody plays the person yet: make their look here, or swap
            to a saved person below (free). The first frame and the render use whoever plays them.</p>
        )}
        <PersonLookMaker x={x} c={c} using={!!run?.busy} onUse={useLook}
          playsLook={castId && c.fixed?.cardId === castId ? c.fixed.look : null} />
        {others.length > 0 && (
          <div className="oc-field" style={{ marginTop: 14 }}>
            <Select label="Swap to a saved person" value="" testId="look-swap"
              onChange={(v) => v && swapTo(v)}
              options={[{ value: '', label: 'Choose from your cast…' }, ...others.map((k) => ({ value: k.id, label: k.name }))]} />
          </div>
        )}
        {pickError && <p className="st-warn" role="alert" data-testid="look-plays-error">{pickError}</p>}
        {run?.error && (
          <p className="st-warn" role="alert" data-testid="look-use-error">{run.error}{' '}
            <button type="button" className="st-btn" data-testid="look-retry" onClick={() => useLook(run.url)}>Try again</button>
          </p>
        )}
      </>}
      advanced={<PersonLookAdvanced x={x} c={c} />}
      onClose={onClose} />
  )
}
