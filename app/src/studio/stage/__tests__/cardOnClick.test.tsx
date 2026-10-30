// @vitest-environment jsdom
// Card-on-click (owner 2026-10-29): a left click or a drag on a figure only picks or moves it. A drag asks for no card at all;
// a pure click asks with 'click', which opens the card only for a person nobody plays yet (the prompt to make their look); a
// double-click asks with 'open', which always opens it; a prop's click never opens its card. Drag and select are unchanged.
import { cleanup, render, screen } from '@testing-library/react'
import { PerspectiveCamera, Vector3 } from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProjectionLabState } from '../../../labs/projection/useProjectionLab'
import type { PlaceApi } from '../../scene/setPlaceApi'
import { asksCard, useStagePick, type CardAsk } from '../useStagePick'
import { api, clickAt, CRATES, disposeRig, dragBy, letGo, screenOf, stageLab } from './stagePickRig'
import { fireEvent } from '@testing-library/react'

afterEach(() => { cleanup(); disposeRig() })

function AskProbe({ lab, api: a }: { lab: ProjectionLabState; api: PlaceApi }) {
  const s = useStagePick(lab, a, () => true)
  return <><div data-testid="ask">{JSON.stringify(s.cardAsk)}</div><div data-testid="pick">{JSON.stringify(s.pick)}</div></>
}
const askOf = () => JSON.parse(screen.getByTestId('ask').textContent || 'null') as CardAsk | null
const pickOf = () => JSON.parse(screen.getByTestId('pick').textContent || 'null') as CardAsk['pick'] | null

describe('a click or a drag on a figure', () => {
  it('a drag on the person moves them and asks for no card; a pure click asks; a double-click asks to open', () => {
    const { lab, canvas, view, layer } = stageLab()
    const a = api()
    render(<AskProbe lab={lab} api={a} />)
    const mark = layer.group.children.find((c) => c.name === 'mark-figure')!
    const at = mark.position.clone().add(new Vector3(0, 1.2, 0))
    const to = dragBy(view, layer, canvas, mark, at, 0, 1)
    letGo(canvas, to)
    expect(a.mark).toHaveBeenCalledTimes(1) // the drag still saves the mark
    expect(pickOf()).toEqual({ t: 'mark' })
    expect(askOf()).toBeNull() // and asks for nothing
    expect(asksCard(askOf(), pickOf(), true)).toBe(false) // nobody cast: still no card after a drag
    const on = screenOf(view as PerspectiveCamera, mark.position.clone().add(new Vector3(0, 1.2, 0)))
    clickAt(canvas, on)
    expect(askOf()).toMatchObject({ pick: { t: 'mark' }, why: 'click' })
    expect(asksCard(askOf(), pickOf(), true)).toBe(true) // nobody cast: the generate box opens
    expect(asksCard(askOf(), pickOf(), false)).toBe(false) // someone cast: a click only selects
    fireEvent.doubleClick(canvas, { ...on, button: 0 })
    expect(askOf()).toMatchObject({ pick: { t: 'mark' }, why: 'open' })
    expect(asksCard(askOf(), pickOf(), false)).toBe(true) // a double-click opens it whoever plays
  })

  it('a prop: a drag asks nothing, a click never opens its card, a double-click does', () => {
    const { lab, canvas, view, layer } = stageLab()
    render(<AskProbe lab={lab} api={api()} />)
    const crates = CRATES.clone().add(new Vector3(0, 0.4, 0))
    const root = layer.group.children.find((c) => c.userData.kitIndex === 0)!
    letGo(canvas, dragBy(view, layer, canvas, root, crates, 1, 0))
    expect(askOf()).toBeNull()
    const on = screenOf(view as PerspectiveCamera, root.position.clone().add(new Vector3(0, 0.4, 0)))
    clickAt(canvas, on)
    expect(pickOf()).toEqual({ t: 'piece', index: 0 })
    expect(asksCard(askOf(), pickOf(), true)).toBe(false)
    fireEvent.doubleClick(canvas, { ...on, button: 0 })
    expect(asksCard(askOf(), pickOf(), true)).toBe(true)
  })

  it('a request for another pick opens nothing', () => {
    const ask: CardAsk = { pick: { t: 'piece', index: 1 }, why: 'open', n: 1 }
    expect(asksCard(ask, { t: 'piece', index: 0 }, true)).toBe(false)
    expect(asksCard(ask, { t: 'mark' }, true)).toBe(false)
    expect(asksCard(null, { t: 'mark' }, true)).toBe(false)

  })
})
