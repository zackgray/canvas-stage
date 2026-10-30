import { MAX_MATERIAL_REFS } from '../../../server/hero/kitSpec'
import { LOCK_PRESETS } from '../../../server/hero/lockPresets'
import { LOCK_PRESET_IDS, type StillPreviewResponse } from '../../shared/stillPressContract'
import { SafeImg } from '../render/SafeImg'
import '../render/render.css'
import { Seg } from '../Seg'
import type { LightboxItem } from '../ui'
import type { PressChoice } from './useStillPreview'

const LOCKS = LOCK_PRESET_IDS.map((id) => ({ id, label: LOCK_PRESETS[id].label, title: LOCK_PRESETS[id].title }))

/**
 * The press preview under "Draw this frame" (troubleshooting review item 1; Render's PromptBox is the pattern): the depth image the draw is held to
 * beside the 3D set frame, the lock as two named presets (numbers only in the tooltip), and the board tiles going to the finish as material references, each droppable (or added back, at most two).
 * Free: nothing here spends.
 */
export function StillPreview({ preview, error, choice, onChoice, clay, disabled }: {
  preview: StillPreviewResponse | null; error: string | null; choice: PressChoice; onChoice: (c: PressChoice) => void; clay?: LightboxItem; disabled?: boolean
}) {
  const sent = (preview?.refs ?? []).filter((r) => r.sent).map((r) => r.tag)
  return (
    <div className="st-still-preview" data-testid="still-preview" style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
      <div style={{ display: 'flex', gap: 8 }} data-testid="still-depth">
        <figure className="st-chip" style={{ width: 168 }}>
          {clay ? <SafeImg src={clay.src} alt="The 3D set frame" line="Not prepared yet" className="st-l2r-gap st-chip-gap" /> : <div className="st-l2r-gap st-chip-gap">Not prepared yet</div>}
          <figcaption>The 3D set frame</figcaption>
        </figure>
        <figure className="st-chip" style={{ width: 168 }}>
          {preview?.depthUrl ? <SafeImg src={preview.depthUrl} alt="The depth the draw is held to" line="Not available yet" className="st-l2r-gap st-chip-gap" testId="still-depth-img" />
            : <div className="st-l2r-gap st-chip-gap">No depth yet: the frames are prepared first</div>}
          <figcaption title="Near is bright, far is dark: the draw keeps these shapes where they are">The depth the draw is held to</figcaption>
        </figure>
      </div>
      <Seg label="Lock" small value={choice.preset} items={LOCKS} testId="still-lock" onChange={(preset) => onChoice({ ...choice, preset })} />
      {preview && (
        <div className="st-chips" data-testid="still-refs">
          {preview.refs.length === 0 && <span className="st-muted">No board tiles to send as material references.</span>}
          {preview.refs.map((r) => (
            <figure key={r.tag} className={`st-chip${r.sent ? '' : ' st-chip-ref'}`} data-testid={`still-ref-${r.tag}`} data-sent={r.sent}>
              <SafeImg src={r.url} alt={r.label} line="Not available" className="st-l2r-gap st-chip-gap" />
              <figcaption>{r.label}{r.sent ? '' : ' · not sent'}</figcaption>
              {r.sent
                ? <button type="button" className="st-btn st-btn-quiet" disabled={disabled} data-testid={`still-ref-drop-${r.tag}`} onClick={() => onChoice({ ...choice, refs: sent.filter((t) => t !== r.tag) })}>Drop</button>
                : <button type="button" className="st-btn st-btn-quiet" disabled={disabled || sent.length >= MAX_MATERIAL_REFS} data-testid={`still-ref-add-${r.tag}`}
                  title={sent.length >= MAX_MATERIAL_REFS ? `At most ${MAX_MATERIAL_REFS} references: drop one first` : undefined} onClick={() => onChoice({ ...choice, refs: [...sent, r.tag] })}>Send</button>}
            </figure>
          ))}
        </div>
      )}
      {error && <p className="st-warn" data-testid="still-preview-error">{error}</p>}
    </div>
  )
}
