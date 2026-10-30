import { Seg } from '../Seg'
import { SHOT_LENGTHS, type ShotLengthState } from './useShotLength'

/**
 * The Camera panel's Shot length row (wave A, S7): the one length of the shot, used by the hero's motion, the preset camera move and
 * the render (a new set starts at 6 s). A refused save shows the server's own sentences.
 */
export function ShotLength({ shot }: { shot: ShotLengthState }) {
  return (
    <section className="st-shotlength" data-testid="shot-length-row">
      <Seg label="Shot length" small value={shot.value === null ? null : String(shot.value)} testId="shot-length"
        onChange={(v) => { void shot.pick(Number(v)) }}
        items={SHOT_LENGTHS.map((s) => ({ id: String(s), label: `${s} s`, disabled: shot.saving,
          title: shot.kit ? `The shot lasts ${s} s: the action, the camera move and the render` : `The camera move lasts ${s} s` }))} />
      {shot.over && <p className="st-warn" data-testid="shot-over">{shot.over}</p>}
      {shot.errors && (
        <ul className="st-warn" data-testid="shot-refused">{shot.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
    </section>
  )
}
