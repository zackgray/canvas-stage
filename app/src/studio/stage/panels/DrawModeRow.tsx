// The quiet row under "Draw the first frame" (draw-from-master): shown only while the scene has an approved look frame. A two-way
// switch (from words and the set / from the approved frame), the look frame's thumbnail, the one-line cue with the price from the
// press preview, a stale note when the frame the owner picked is gone, and the free "Use this frame as the scene's look" on the
// take's own approved first frame. The model is the still block's published press (useDrawMode.ts); nothing here prices or draws.
import { useState } from 'react'
import type { HeroDrawModeModel, HeroOverlayModel } from '../../shoot/heroPublished'
import { Seg } from '../../Seg'
import { DRAW_NUDGE } from '../../shoot/useDrawMode'

/** the one quiet line near "Draw the first frame" while no frame of the scene is approved */
export const DrawNudge = () => <p className="st-muted" data-testid="draw-nudge">{DRAW_NUDGE}</p>

export function DrawModeRow({ model, overlay }: { model: HeroDrawModeModel; overlay: HeroOverlayModel | null }) {
  const [said, setSaid] = useState<{ id: string; text: string; ok: boolean } | null>(null)
  const still = overlay?.approved && !overlay.still.stale ? overlay.still : null
  const use = async () => {
    if (!still) return
    try { await model.onUseLook(still.takeId, still.id); setSaid({ id: still.id, text: 'This frame is now the scene\'s look.', ok: true }) }
    catch (e) { setSaid({ id: still.id, text: e instanceof Error ? e.message : String(e), ok: false }) }
  }
  const note = said && said.id === still?.id ? said : null
  return (
    <div className="st-draw-mode" data-testid="draw-mode">
      <Seg label="Draw" small value={model.mode} testId="draw-mode-switch" onChange={model.onMode}
        items={[{ id: 'depth', label: 'From words', title: 'Draws the frame from the words and the 3D set' },
          { id: 'edit', label: 'From approved frame', title: 'Draws the frame from the empty set and the approved frame, so the clothes and the place stay the same' }]} />
      <div className="st-draw-mode-look">
        <img src={model.lookUrl} alt="The approved frame the next angle takes from" width={64} data-testid="draw-mode-look" />
        <p className="st-muted st-step-cue" data-testid="draw-mode-cue">{model.cue}</p>
      </div>
      {model.stale && <p className="st-muted" data-testid="draw-mode-stale">{model.stale}</p>}
      {still && <button type="button" className="st-btn" data-testid="draw-mode-use-look" title="Free. The next angles take their look from this frame" onClick={() => void use()}>Use this frame as the scene's look</button>}
      {note && <p className={note.ok ? 'st-muted' : 'st-warn'} role="status" data-testid="draw-mode-said">{note.text}</p>}
    </div>
  )
}
