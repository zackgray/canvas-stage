// A press refused because the set is not approved (or changed since): the plain reason with its one-press fallback, Approve the
// set (free, the same route as the set panel's press). Once approved it says so; pressing the refused press again goes on.
// (review F1) While a locked take with its own set is on show, the still is drawn on that set: the press approves it by its key and
// names it by the take ("Approve Take 2's set"), never the scene's set unseen.
import { useState } from 'react'
import { ownSetOnShow, sceneSetOf, useTakeOnShow } from '../../../labs/projection/stage3d/takeOnShow'
import { SET_CHANGED } from '../../../shared/setApproval'
import { bibleApi } from '../../scene/bibleApi'
import { useOwnSetName } from './OwnSetApprove'

const api = bibleApi()

export function SetRefusal({ text, worldId, approve = (id, key) => api.approveSet(id, key) }: { text: string; worldId: string | null; approve?: (worldId: string, setKey?: string) => Promise<unknown> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | string>('idle')
  const own = ownSetOnShow(sceneSetOf(worldId), useTakeOnShow(), worldId)
  const key = own?.setKey ?? undefined
  const whose = useOwnSetName(worldId, key ? own!.takeId : null)
  if (state === 'done') return <p className="st-muted" role="status" data-testid="set-refusal-done">{whose ? `${whose} is approved.` : 'The set is approved.'} Press it again to go on.</p>
  return (
    <p className="st-warn" role="alert" data-testid="set-refusal">
      {text}{' '}
      {worldId && (
        <button type="button" className="st-btn" data-testid="set-refusal-approve" disabled={state === 'busy'}
          onClick={() => { setState('busy'); (key ? approve(worldId, key) : approve(worldId)).then(() => setState('done'), (e: unknown) => setState(`The set was not approved: ${e instanceof Error ? e.message : String(e)}`)) }}>{whose ? `Approve ${whose}` : text === SET_CHANGED ? 'Approve the changed set' : 'Approve the set'}</button>
      )}
      {state !== 'idle' && state !== 'busy' && <span data-testid="set-refusal-error"> {state}</span>}
    </p>
  )
}
