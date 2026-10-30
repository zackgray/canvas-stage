// @vitest-environment jsdom
// The notices beside the paid Render press (QA run 5): a black render is said from its record with the price of another try,
// once; an approved still that failed the layout check is flagged before the press; nothing shows while a render runs.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { blankNotice, layoutNotice, RenderNotices } from './renderNotices'

const BLACK = 'The render came back black. Nothing usable was saved. You were billed 20.2 cr.'
const st = (over: Record<string, unknown> = {}, status: Record<string, unknown> = {}) => ({
  price: 28,
  state: { posting: false, error: null, ...over, status: { renders: [{ id: 'r1', status: 'failed', blank: true, error: BLACK }], still: { id: 's', layout: { score: 0.27, ok: false } }, ...status } },
}) as unknown as Parameters<typeof RenderNotices>[0]['l']

afterEach(cleanup)

describe('render notices', () => {
  it('a black newest render: the record\'s line and the price of another try', () => {
    expect(blankNotice(st())).toBe(`${BLACK} To try again, press Render (≈ 28 cr).`)
  })
  it('the still that failed the layout check is flagged with its score', () => {
    expect(layoutNotice(st())).toMatch(/does not match the set's frames \(it scored 0\.27 against the set\)\. .*render anyway\.$/)
    expect(layoutNotice(st({}, { still: { id: 's', layout: { score: 0.5, ok: true } } }))).toBeNull()
    expect(layoutNotice(st({}, { still: { id: 's' } }))).toBeNull()
  })
  it('a done render or a plain failure says nothing; a run in flight hides both', () => {
    expect(blankNotice(st({}, { renders: [{ id: 'r', status: 'done' }] }))).toBeNull()
    expect(blankNotice(st({}, { renders: [{ id: 'r', status: 'failed', error: 'x' }] }))).toBeNull()
    render(<RenderNotices l={st({}, { running: { since: 'now' } })} />)
    expect(screen.queryByTestId('render-blank')).toBeNull()
    expect(screen.queryByTestId('render-layout-warn')).toBeNull()
  })
  it('the Render page already shows the fresh error: the black line is not said twice there', () => {
    render(<RenderNotices l={st({ error: BLACK })} quietOnError />)
    expect(screen.queryByTestId('render-blank')).toBeNull()
    expect(screen.getByTestId('render-layout-warn')).toBeTruthy()
    cleanup()
    render(<RenderNotices l={st({ error: BLACK })} />)
    expect(screen.getByTestId('render-blank').textContent).toContain('You were billed 20.2 cr.')
  })
})
