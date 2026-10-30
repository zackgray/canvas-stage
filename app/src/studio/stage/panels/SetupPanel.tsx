// The Setup panel (stage-only plan, section 1): the Stage's right panel while the scene has no set yet. Top to bottom: the first
// prompt, the scene words as written (no AI step develops them); "In this scene",
// the people and the props (SetupCards); Build the set, the one primary press (the planner, priced; it asks first when the scene
// already has a set). The scene words themselves are in the drawer under the viewport. Everything reads and writes through the
// Stage's one design copy; Build the set approves the set it makes (free) and the Stage becomes the normal Stage by itself.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { plannerCredits } from '../../../shared/bibleContract'
import { BriefEditor } from '../../scene/BriefEditor'
import { BuildAsk, useSetFacts } from '../../scene/SetGuards'
import { SCENE_BOX_PLACEHOLDER } from '../../scene/SceneBox'
import { buildBlock } from '../../scene/design/buildCheck'
import type { SceneCtx } from '../../scene/sceneCtx'
import { Elapsed, PriceButton } from '../../ui'
import { useStageScene } from '../scene/StageScene'
import { SetupCards } from './SetupCards'
import './setup.css'

/** the viewport's one line while there is no set: drawn over the shell's viewport (its slot is the shell's), or nothing without one */
export function SetupViewportLine() {
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => { setHost(document.querySelector('[data-testid="studio-viewport"]')) }, [])
  return host ? createPortal(<p className="st-setup-vp" data-testid="setup-viewport">The set appears here once it is built</p>, host) : null
}

export function SetupPanel() {
  const st = useStageScene()
  return (
    <div className="st-scene st-setup" data-testid="setup-panel">
      {st ? <Setup x={st.x} /> : <p className="st-muted">Opening the scene…</p>}
    </div>
  )
}

function Setup({ x }: { x: SceneCtx }) {
  const { s, c } = x
  const g = s.d.guided
  return (<>
    <SetupWords x={x} />
    {g && <SetupCards x={x} g={g} />}
    <SetupBuild x={x} />
    {c.error && <p className="st-warn" role="alert" data-testid="setup-error">{c.error}</p>}
  </>)
}

/** the first prompt: the scene words, exactly as written (the drawer's own editor; no AI step reads them) */
function SetupWords({ x }: { x: SceneCtx }) {
  return (
    <section className="st-scene-card" data-testid="setup-develop">
      <h2>Your scene</h2>
      <BriefEditor x={x} testId="setup-brief" placeholder={SCENE_BOX_PLACEHOLDER} />
    </section>
  )
}

function SetupBuild({ x }: { x: SceneCtx }) {
  const { s, set } = x
  const { setBuilt } = useSetFacts()
  const [asking, setAsking] = useState(false)
  const cr = plannerCredits(1)
  const why = set.building ? null : buildBlock(s.d, s.board)
  const go = () => { setAsking(false); void set.build() }
  return (
    <section className="st-scene-card" data-testid="setup-build">
      <h2>The set</h2>
      {asking ? <BuildAsk cr={cr} onYes={go} onNo={() => setAsking(false)} /> : (
        <div className="st-actions">
          <PriceButton primary verb={set.building ? 'Building…' : 'Build the set'} price={cr} disabled={!!why || set.building} testId="setup-build-press"
            title={why ?? `The planner lays out the set from the scene words (${cr} cr; twice that if it has to try again)`} onClick={() => (setBuilt ? setAsking(true) : go())} />
          {set.since ? <Elapsed since={set.since} /> : null}
        </div>
      )}
      <p className="st-muted" data-testid="setup-build-why">{set.phase ?? why ?? 'The set is laid out from the scene words in the drawer below, with a stand-in for each prop.'}</p>
      {set.error && <p className="st-warn" role="alert" data-testid="setup-build-error">{set.error}</p>}
    </section>
  )
}
