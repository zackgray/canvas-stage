// @vitest-environment jsdom
// The Stage's view switch (merge step 5): Camera / Free view / Top View toggles. One on fills the lab viewport, several
// split it (engine/panes.ts); the choice persists under canvas-stage.panes and at least one pane always stays on, so the
// viewport never goes blank.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { markStageVisited, PANES_KEY, readPanes, stageArrival, ViewSwitch } from '../ViewSwitch'

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })

describe('ViewSwitch', () => {
  it('shows the three panes; the stored choice is the pressed one', () => {
    localStorage.setItem(PANES_KEY, JSON.stringify(['camera', 'top']))
    render(<ViewSwitch value={readPanes()} onChange={vi.fn()} />)
    expect(screen.getByTestId('stage-panes-camera').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('stage-panes-free').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('stage-panes-top').getAttribute('aria-pressed')).toBe('true')
  })

  it('a toggle adds or removes a pane, persists the choice and never lets the last pane go off', () => {
    const onChange = vi.fn()
    const { rerender } = render(<ViewSwitch value={['camera']} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('stage-panes-free'))
    expect(onChange).toHaveBeenLastCalledWith(['camera', 'free'])
    expect(JSON.parse(localStorage.getItem(PANES_KEY)!)).toEqual(['camera', 'free'])
    rerender(<ViewSwitch value={['camera', 'free']} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('stage-panes-camera'))
    expect(onChange).toHaveBeenLastCalledWith(['free'])
    expect(JSON.parse(localStorage.getItem(PANES_KEY)!)).toEqual(['free'])
    rerender(<ViewSwitch value={['free']} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('stage-panes-free')) // the only one on: it stays on
    expect(onChange).toHaveBeenLastCalledWith(['free'])
    expect(JSON.parse(localStorage.getItem(PANES_KEY)!)).toEqual(['free'])
  })

  it('readPanes falls back to the Free view on nothing stored, garbage, or no known pane', () => {
    expect(readPanes()).toEqual(['free'])
    localStorage.setItem(PANES_KEY, '{oops')
    expect(readPanes()).toEqual(['free'])
    localStorage.setItem(PANES_KEY, JSON.stringify(['nope']))
    expect(readPanes()).toEqual(['free'])
  })
})

describe('arriving at the Stage', () => {
  it('a fresh arrival opens on the Free view whatever was saved; a reload of a Stage visited this session keeps the saved choice', () => {
    localStorage.setItem(PANES_KEY, JSON.stringify(['camera'])) // saved on an earlier walk
    expect(stageArrival('sc-1', true)).toEqual(['free']) // a reload, but this Stage was never visited in this session
    markStageVisited('sc-1')
    expect(stageArrival('sc-1', true)).toEqual(['camera']) // still inside it: a reload keeps the choice
    expect(stageArrival('sc-1', false)).toEqual(['free']) // coming from Set & master or the Board: always the Free view
    expect(stageArrival('sc-2', true)).toEqual(['free']) // another scene's Stage, not visited
  })
})
