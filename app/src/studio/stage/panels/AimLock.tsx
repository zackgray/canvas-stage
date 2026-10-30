// fly-with-aim-lock's picker on the Camera panel, under Fly it yourself and mounted only while flying (so unmounting clears the
// engine's lock: a hidden choice never acts on a preset move): what the hand-flown camera stays aimed at — the subject by default, any placed
// piece, or a point clicked on the ground — changeable mid-flight, while the position stays free (orbit, push, crane, strafe).
// The choice is the scene's Stage memory, so a tab switch keeps it; the aiming itself is the engine's (OperatorEngine.aimLock),
// registered here while this is mounted. DOM only: nothing here enters the lab scene.
import { useEffect, useState } from 'react'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import { heroTag, tagSaid, useWorldBible } from '../../shoot/castNames'
import { aimTargetOf } from '../aimLock'
import { setGroundDrawing } from '../groundDrawing'
import { setStageMemo, useStageMemo } from '../stageMemory'
import { useGroundClick } from './blocking/groundClick'

export function AimLock({ lab }: { lab: ProjectionLabState }) {
  const engine = lab.op.engine
  const aim = useStageMemo().aim
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    engine.aimLock = aim ? () => aimTargetOf(lab, aim) : null
    return () => { engine.aimLock = null }
  }, [engine, lab, aim])
  // the point pick: the next ground click is the aim point, not the pick's or the Add menu's (useStagePick reads this)
  useEffect(() => { setGroundDrawing(picking); return () => setGroundDrawing(false) }, [picking])
  useEffect(() => {
    if (!picking) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicking(false) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [picking])
  useGroundClick(picking ? lab.stage : null, (p) => { setPicking(false); setStageMemo({ aim: { kind: 'point', at: p } }) })
  const kit = lab.kit?.world?.plan.kit ?? []
  const bible = useWorldBible(lab.kit?.id)
  const heroT = heroTag(bible, lab.kit?.perf?.castId ?? null)
  const hero = heroT ? tagSaid(bible, heroT) : null
  const value = picking ? 'point:picking' : !aim ? 'off' : aim.kind === 'piece' ? `piece:${aim.index}` : aim.kind
  const pick = (v: string) => {
    if (v === 'off') setStageMemo({ aim: null })
    else if (v === 'subject') setStageMemo({ aim: { kind: 'subject' } })
    else if (v.startsWith('point')) setPicking(true)
    else setStageMemo({ aim: { kind: 'piece', index: Number(v.slice('piece:'.length)) } })
  }
  const pointLabel = picking ? 'click the ground… (Esc cancels)' : aim?.kind === 'point' ? 'the clicked point' : 'a point: click the ground'
  return (
    <label className="st-field-hint" data-testid="aim-lock" title="Only while you fly it yourself: the camera turns to keep this centred and you still fly where it goes">
      While you fly, keep aimed at:{' '}
      <select className="st-select" data-testid="aim-lock-pick" value={value} onChange={(e) => pick(e.target.value)}>
        <option value="off">nothing (you aim)</option>
        <option value="subject">{hero ?? 'the subject'}</option>
        {kit.map((it, i) => (
          <option key={i} value={`piece:${i}`}>{it.label || it.kind}</option>
        ))}
        <option value="point">{pointLabel}</option>
      </select>
    </label>
  )
}
