// @vitest-environment jsdom
// Pass 3: the Stage's Camera view shows no operator readouts over the picture (no "stabilised 0.50"); the controller lab keeps them.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OperatorEngine } from '../../../controller/engine/engine'
import { Hud } from '../../../controller/ui/Hud'
import { STAGE_RIGS } from '../../operator/link'

afterEach(cleanup)
const engine = () => new OperatorEngine({ rigs: STAGE_RIGS, rig: 'free', car: false })

describe("the Stage's viewfinder", () => {
  it('plain: lens and focus, no stabiliser readout', () => {
    const { container } = render(<Hud engine={engine()} plain />)
    expect(container.textContent).toMatch(/mm/)
    expect(container.textContent).not.toMatch(/stabilised|handheld/)
  })
  it('the controller lab keeps its readout', () => {
    render(<Hud engine={engine()} />)
    expect(screen.getByText(/stabilised|handheld/)).toBeTruthy()
  })
})
