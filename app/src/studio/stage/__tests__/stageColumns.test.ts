// The Stage's columns, pinned by structure (the words drawer, F14; the clipped right panel, F10): on the Stage the stage slot is a
// grid — the viewport over the drawer in the left column, the right panel the full height of its fixed track — and in the right
// panel the steps block gives way before the upper card, each scrolling on its own. Screenshots at 1280x720, 1600x900 and
// 1920x1080 settled the numbers; these keep the rules that make them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = (file: string) => readFileSync(file, 'utf8')
const rule = (file: string, sel: string) => {
  const esc = sel.replace(/[.>]/g, (c) => `\\${c}`)
  return css(file).match(new RegExp(`(^|\\n)${esc} \\{[^}]*\\}`))?.[0] ?? ''
}
const SCREENS = 'src/studio/screens/screens.css', STAGE = 'src/studio/stage/stage.css'

describe('the Stage columns', () => {
  it('the slot is a grid on the Stage: the viewport over the drawer on the left, the panel full height on the right track', () => {
    const grid = rule(SCREENS, '.st-stage.st-stage-on')
    expect(grid).toContain('grid-template-columns: minmax(0, 1fr) var(--st-shoot-w, 340px)')
    expect(grid).toContain('grid-template-rows: minmax(0, 1fr) auto')
    expect(rule(SCREENS, '.st-stage-on > .st-vp')).toContain('grid-row: 1;')
    expect(rule(SCREENS, '.st-stage-on > .st-drawer')).toContain('grid-row: 2;')
    expect(rule(SCREENS, '.st-stage-on > .st-screen-stage')).toContain('grid-row: 1 / span 2')
  })

  it('the stepper row is the pill alone: no leftover list rules pad the tab bar', () => {
    expect(css(SCREENS)).not.toMatch(/\n\.st-steps li \{/)
    expect(css(SCREENS)).not.toMatch(/\n\.st-steps \{/)
  })

  it('the right panel: the steps block gives way first, down to a floor, then the card; both scroll', () => {
    expect(rule(STAGE, '.st-ws > .st-scene')).toContain('flex: 1 1 auto')
    const steps = rule(STAGE, '.st-ws > .st-shot-steps')
    expect(steps).toContain('flex: 0 1000 auto')
    expect(steps).toContain('min-height: min(200px, 40%)')
    expect(steps).toContain('overflow-y: auto')
    expect(css(STAGE)).toContain('animation-timeline: scroll(self)') // the fade while there is more below
  })
})
