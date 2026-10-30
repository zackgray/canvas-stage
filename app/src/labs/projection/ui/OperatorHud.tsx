import '../../controller/ui/lab.css'
import { Hud } from '../../controller/ui/Hud'
import { useTicker } from '../../controller/ui/useTicker'
import type { StageOperatorEngine } from '../operator/stageEngine'

/** The controller lab's viewfinder over the viewport, below the angle badge. */
export function OperatorHud({ engine }: { engine: StageOperatorEngine }) {
  useTicker(15)
  const reticle = engine.rigId === 'orbit' && engine.pivot.mode === 'manual'
  return (
    <div className="pl-op-hud">
      <Hud engine={engine} plain />
      {reticle && <div className="pl-reticle" data-testid="pivot-reticle" title="C / R3: pivot on what is here" />}
    </div>
  )
}
