// @vitest-environment jsdom
// Wave A (S4): the mark's facing as an arrowhead in a top view; it points along the yaw and takes no clicks.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkFacing } from '../MarkFacing'

afterEach(cleanup)
const tipOf = (el: Element) => (el.getAttribute('points') ?? '').split(' ')[0].split(',').map(Number)
const flat: [number, number, number, number] = [-3, -16, 3, 8]

describe('MarkFacing', () => {
  it('points along the saved yaw from the mark', () => {
    const { getByTestId } = render(<svg><MarkFacing plan={{ flat, mark: { at: [2, -9], yawDeg: 90 } }} /></svg>)
    const [x, z] = tipOf(getByTestId('mark-facing'))
    expect(x).toBeCloseTo(3); expect(z).toBeCloseTo(-9)
    expect(getByTestId('mark-facing').getAttribute('pointer-events')).toBe('none')
  })
  it('with no saved facing it points at the nearest prop; a pose overrides the plan', () => {
    const plan = { flat, mark: { at: [0, 0] as [number, number] }, kit: [{ kind: 'tree', at: [0, -5] as [number, number], pieceTag: 'prop:t' }] }
    const a = render(<svg><MarkFacing plan={plan} /></svg>)
    expect(tipOf(a.getByTestId('mark-facing'))[1]).toBeCloseTo(-1)
    a.unmount()
    const b = render(<svg><MarkFacing plan={plan} pose={{ at: [1, 1], yaw: 0 }} /></svg>)
    expect(tipOf(b.getByTestId('mark-facing'))).toEqual([1, 2])
  })
})
