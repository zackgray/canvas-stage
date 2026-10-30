// Home's front door: the brand, one line on what this is, and the one primary press: Start a new scene. It makes the scene and
// opens its Stage, where the first prompt is written (nothing is typed or paid for here, and no AI step reads the words: they
// are the scene words exactly as written). `latest` adds a quiet second way in: carry on with the newest scene.
import type { SceneSummary } from '../../shared/libraryContract'
import { sceneHash } from '../route'
import './homeBox.css'

interface Props {
  onStart: () => void
  /** a start already under way */
  starting: boolean
  /** the newest scene with work in it, for the quiet "Continue" link */
  latest?: SceneSummary
}

export function HomeBox({ onStart, starting, latest }: Props) {
  return (
    <section className="st-hbox" data-testid="home-box">
      <p className="st-hbox-eyebrow"><i className="st-hbox-mark" aria-hidden="true" />Canvas Stage</p>
      <h1>Build the set.<br />Direct the shot.</h1>
      <p className="st-hbox-sub">Write the scene in your own words, then place the camera, the people and the props on a stage you can walk around.</p>
      <div className="st-hbox-acts">
        <button type="button" className="st-btn st-primary st-hbox-start" disabled={starting} data-testid="home-box-start" onClick={onStart}>
          {starting ? 'Opening the Stage…' : 'Start a new scene'}
        </button>
        {latest && <a className="st-hbox-continue" href={sceneHash(latest.id)} data-testid="home-box-continue">Continue <b>{latest.name}</b></a>}
      </div>
    </section>
  )
}
