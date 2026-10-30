// The brief's helpers: the @ menu (thumbnails), naming a dropped image and the chip popover.
import { useState } from 'react'
import type { PieceType } from './briefApi'
import type { ConceptQuality } from '../../shared/sceneContract'
import { cap, lookOf, pieceCredits, slug, TYPE_LABEL, type Piece } from './design/model'
import type { AtRow } from './design/routes'
import { Img } from './parts'

export function AtMenu({ rows, active, onPick }: { rows: AtRow[]; active: number; onPick: (r: AtRow) => void }) {
  return (
    <div className="sd-ac" role="listbox" data-testid="at-menu">
      {rows.map((r, n) => (
        <div key={r.tag} role="option" aria-selected={n === active} className={`sd-ar${n === active ? ' on' : ''}`} data-testid={`at-${r.tag}`}
          onMouseDown={(e) => { e.preventDefault(); onPick(r) }}>
          <span className="sd-at">{r.look ? <Img src={r.look} /> : null}</span>
          <span className="sd-an"><b>{r.name}</b><span className="sd-bdg">{TYPE_LABEL[r.type]}{r.draft ? ' · draft' : ''}{r.lib ? ' · yours' : ''}</span></span>
          <span className="sd-atag">@{r.tag}</span>
        </div>
      ))}
    </div>
  )
}

const DROP_TYPES: PieceType[] = ['person', 'creature', 'group', 'mood', 'material', 'prop']

/** "Name this reference": a dropped image becomes a tile of yours and its tag goes into the brief (free) */
export function DropAsk({ file, preview, onAdd, onCancel }: {
  file: File; preview: string | null; onAdd: (name: string, type: PieceType) => void; onCancel: () => void
}) {
  const first = cap(file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()) || 'Reference'
  const [name, setName] = useState(first)
  const [type, setType] = useState<PieceType>('person')
  return (
    <div className="sd-ask" role="dialog" aria-label="Name this reference" data-testid="drop-ask">
      <div className="sd-ah">
        {preview ? <img src={preview} alt="" /> : <span className="sd-at" />}
        <div>
          <div className="sd-lbl">Name this reference</div>
          <input className="sd-ain" value={name} onChange={(e) => setName(e.target.value)} data-testid="drop-name" />
          <div className="sd-atg">becomes <span className="sd-chip">@{slug(name || first)}</span></div>
        </div>
      </div>
      <div className="sd-apl">
        {DROP_TYPES.map((t) => <button type="button" key={t} className={t === type ? 'on' : ''} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>)}
      </div>
      <div className="sd-aft">
        <button type="button" className="sd-x" onClick={onCancel}>Cancel</button>
        <button type="button" className="st-btn st-primary" onClick={() => onAdd(name.trim() || first, type)} data-testid="drop-add">Add &amp; tag · free</button>
      </div>
    </div>
  )
}

/** a chip's piece that is not drawn yet */
export function ChipPop({ p, q, onClose }: { p: Piece; q: ConceptQuality; onClose: () => void }) {
  return (
    <div className="sd-pop" data-testid={`chip-pop-${p.tag}`} onClick={onClose}>
      <span className="sd-at">{lookOf(p) ? <Img src={lookOf(p)!} /> : null}</span>
      <div><b>{p.name}</b> <span className="sd-tagc">@{p.tag}</span>
        <div className="sd-atg">{TYPE_LABEL[p.type]} · {p.state === 'draft' ? `draft, not drawn yet · ≈ ${pieceCredits(p, q)} cr` : 'yours'}</div></div>
    </div>
  )
}
