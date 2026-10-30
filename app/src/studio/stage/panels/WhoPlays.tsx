// The right panel's "Who plays them" (who-plays-shown): the person the world's performer names, their face and name, so a Use
// this look in the card shows here at once. The scene's own Guided card that made them is read first (it holds the picked look
// the moment the card is saved, before the project's card library is read again); a saved person swapped in from the cast
// falls back to their project card. Nobody yet: a plain line and the press that opens the card. Free, reads only.
import { lookOf } from '../../scene/design/model'
import { useStageScene } from '../scene/StageScene'
import { LookImage } from './LookImage'

/** the performer's name and look: the scene's Guided card for that cast id, else its person tile, else the project's saved card
 *  (the Stage's one design copy holds the cast library; no read of its own) */
export function usePlayer(castId: string | null | undefined): { name: string; look: string | null } | null {
  const st = useStageScene()
  if (!castId) return null
  const d = st?.x.s.d
  const g = d?.guided?.cast.find((k) => k.fixed?.cardId === castId)
  const tile = d?.pieces.find((p) => p.type === 'person' && p.cardId === castId)
  const saved = st?.x.lib.find((k) => k.cardId === castId)
  const name = g?.name.trim() || tile?.name.trim() || saved?.name.trim() || 'Someone from your cast'
  return { name, look: g?.fixed?.look ?? (tile ? lookOf(tile) : null) ?? saved?.look ?? null }
}

export function WhoPlays({ castId, onOpenCard }: { castId: string | null | undefined; onOpenCard?: () => void }) {
  const who = usePlayer(castId)
  return (
    <section className="st-scene-card" data-testid="person-who">
      <h2>Who plays them</h2>
      {who ? (
        <div className="oc-who" data-testid="person-who-plays">
          {who.look && <span className="oc-who-face"><LookImage src={who.look} alt={who.name} testId="person-who-look" /></span>}
          <strong data-testid="person-who-name">{who.name}</strong>
        </div>
      ) : (
        <span className="st-field-hint" data-testid="person-who-nobody">Nobody plays them yet: make their look in their card.</span>
      )}
      {onOpenCard && <button type="button" className="st-btn" data-testid="person-open-card" onClick={onOpenCard}>Their look</button>}
    </section>
  )
}
