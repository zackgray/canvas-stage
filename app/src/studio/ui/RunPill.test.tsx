// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PIECE_ESTIMATE, RunPill, renderEstimate } from '.'

afterEach(cleanup)

describe('RunPill', () => {
  it('shows the label, the clock from `since`, the estimate, a moving bar and the price spent', () => {
    render(<RunPill label="Drawing the look" since={1_000} now={66_000} estimate="about 2 minutes" price={24} />)
    const pill = screen.getByTestId('run-pill')
    expect(screen.getByRole('progressbar', { name: 'Drawing the look' }).className).toContain('st-indeterminate')
    expect(pill.querySelector('.st-progress-time')?.textContent).toBe('1:05')
    expect(screen.getByTestId('run-pill-estimate').textContent).toBe('about 2 minutes')
    expect(screen.getByTestId('run-pill-spent').textContent).toBe('≈ 24 cr spent')
  })
  it('the clock advances with `now`', () => {
    const { rerender } = render(<RunPill label="x" since={0} now={5_000} estimate={PIECE_ESTIMATE} />)
    expect(document.querySelector('.st-progress-time')?.textContent).toBe('0:05')
    rerender(<RunPill label="x" since={0} now={12_000} estimate={PIECE_ESTIMATE} />)
    expect(document.querySelector('.st-progress-time')?.textContent).toBe('0:12')
  })
  it('without a start time the clock starts at 0:00 when the pill appears; no price, no "spent"', () => {
    render(<RunPill label="x" estimate="about a minute" />)
    expect(document.querySelector('.st-progress-time')?.textContent).toMatch(/^0:0[0-1]$/)
    expect(screen.queryByTestId('run-pill-spent')).toBeNull()
  })
})

describe('renderEstimate (from the ledger: 97 frames took 118 s, 145 frames took 219 s)', () => {
  it('reads about 2 minutes up to 97 frames, 3 to 4 minutes up to 145', () => {
    expect(renderEstimate(49)).toBe('about 2 minutes')
    expect(renderEstimate(97)).toBe('about 2 minutes')
    expect(renderEstimate(98)).toBe('about 3 to 4 minutes')
    expect(renderEstimate(145)).toBe('about 3 to 4 minutes')
  })
  it('goes on at the measured rate beyond it, and is vague with no length', () => {
    expect(renderEstimate(193)).toBe('about 5 minutes') // 219 + 48 * 2.104 = 320 s
    expect(renderEstimate(null)).toBe('a few minutes')
  })
})
