// The one tab bar: ‹ Home · Stage · Render · Export, plain links. A scene's stages link into that scene.
import { HOME_HASH, sceneHash } from '../route'
import { STEPS, STEP_LABEL, type Step } from './steps'

interface Props {
  current: Step
  scene: string | null
}

export function Stepper({ current, scene }: Props) {
  return (
    <nav className="st-steps" aria-label="Steps" data-testid="stepper">
      <a className="st-home-link" href={HOME_HASH} data-testid="home-link" title="Back to your scenes">‹ Home</a>
      <ol className="st-step-list">
        {STEPS.map((s) => (
          <li key={s}><a className={`st-step${s === current ? ' on' : ''}`} href={scene ? sceneHash(scene, s) : undefined} data-testid={`step-${s}`}
            {...(s === current ? { 'aria-current': 'step' as const } : {})}>{STEP_LABEL[s]}</a></li>
        ))}
      </ol>
    </nav>
  )
}
