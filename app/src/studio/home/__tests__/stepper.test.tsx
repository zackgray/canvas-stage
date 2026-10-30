// @vitest-environment jsdom
// The tab bar: Home, Stage, Render, Export in order as plain links, the current stage marked, Home one press away; the Resume labels.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Stepper } from '../Stepper'
import { reachedLabel, STEP_LABEL, STEPS } from '../steps'

afterEach(cleanup)
const SC = 'sc-20261025120000-cccc'

describe('tab bar', () => {
  it('is exactly Home, Stage, Render, Export, and marks the current stage', () => {
    for (const cur of STEPS) {
      const { container, unmount } = render(<Stepper current={cur} scene={SC} />)
      expect([...container.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['‹ Home', 'Stage', 'Render', 'Export'])
      expect(container.querySelectorAll('button')).toHaveLength(0)
      expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1)
      expect(container.querySelector('[aria-current="step"]')!.textContent).toBe(STEP_LABEL[cur])
      unmount()
    }
  })

  it('links the stages and Home into the scene and out of it; no Brief or Board tab', () => {
    render(<Stepper current="stage" scene={SC} />)
    expect(screen.getByTestId('home-link').getAttribute('href')).toBe('#/studio')
    expect(screen.getByTestId('step-stage').getAttribute('href')).toBe(`#/studio/${SC}/stage`)
    expect(screen.getByTestId('step-render').getAttribute('href')).toBe(`#/studio/${SC}/render`)
    expect(screen.getByTestId('step-export').getAttribute('href')).toBe(`#/studio/${SC}/export`)
    expect(screen.queryByTestId('nav-brief')).toBeNull()
    expect(screen.queryByTestId('nav-board')).toBeNull()
  })

  it("Home's Resume list words: Brief and Board scenes are not built yet, set/shoot reached the Stage", () => {
    expect(reachedLabel('brief')).toBe('Not built yet')
    expect(reachedLabel('board')).toBe('Not built yet')
    expect(reachedLabel('set')).toBe('Stage')
    expect(reachedLabel('shoot')).toBe('Stage')
    expect(reachedLabel('render')).toBe('Render')
  })
})
