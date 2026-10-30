import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Advanced, Field, formatElapsed, formatPrice, PriceButton, Progress, readAdvancedOpen, Select, Toggle, writeAdvancedOpen } from '.'

const noop = () => {}

describe('Advanced', () => {
  let store: Map<string, string>
  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('remembers the open state per stage', () => {
    expect(readAdvancedOpen('world')).toBe(false)
    expect(readAdvancedOpen('world', true)).toBe(true)
    writeAdvancedOpen('world', true)
    writeAdvancedOpen('shoot', false)
    expect(readAdvancedOpen('world')).toBe(true)
    expect(readAdvancedOpen('shoot', true)).toBe(false)
    expect(store.get('canvas.studio.advanced.world')).toBe('1')
  })

  it('renders open from storage, closed by default', () => {
    expect(renderToStaticMarkup(<Advanced stage="cast"><p>x</p></Advanced>)).toMatch(/^<details class="st-adv" data-testid="advanced-cast"><summary>Advanced<\/summary>/)
    writeAdvancedOpen('cast', true)
    expect(renderToStaticMarkup(<Advanced stage="cast" label="More"><p>x</p></Advanced>)).toContain('<details class="st-adv" open=""')
  })

  it('falls back when storage throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    expect(readAdvancedOpen('world', true)).toBe(true)
    expect(() => writeAdvancedOpen('world', true)).not.toThrow()
  })
})

describe('PriceButton', () => {
  it('formats the price', () => {
    expect(formatPrice(32)).toBe('≈ 32 cr')
    expect(formatPrice(7.25)).toBe('≈ 7.3 cr')
    expect(formatPrice(0)).toBe('free')
    expect(formatPrice('≈ 9–17 cr')).toBe('≈ 9–17 cr')
    expect(formatPrice(null)).toBeNull()
  })

  it('puts the grey price beside the verb', () => {
    const html = renderToStaticMarkup(<PriceButton verb="Render 2 takes" price={32} primary testId="go" />)
    expect(html).toBe('<span class="st-pricebtn"><button type="button" class="st-btn st-primary" data-testid="go">Render 2 takes</button><span class="st-price">≈ 32 cr</span></span>')
    expect(renderToStaticMarkup(<PriceButton verb="Close" price={null} />)).not.toContain('class="st-price"')
  })
})

describe('Progress', () => {
  it('formats elapsed time', () => {
    expect(formatElapsed(7_400)).toBe('0:07')
    expect(formatElapsed(272_000)).toBe('4:32')
    expect(formatElapsed(3_729_000)).toBe('1:02:09')
    expect(formatElapsed(-5)).toBe('0:00')
  })

  it('shows the stage label and elapsed; indeterminate without a value', () => {
    const html = renderToStaticMarkup(<Progress label="harmonising" startedAt={1_000} now={66_000} />)
    expect(html).toContain('st-progress st-indeterminate')
    expect(html).toContain('<span class="st-progress-label">harmonising</span><span class="st-progress-time">1:05</span>')
    const half = renderToStaticMarkup(<Progress label="upscaling" value={0.5} startedAt="2026-10-22T00:00:00Z" now={Date.parse('2026-10-22T00:00:09Z')} />)
    expect(half).not.toContain('st-indeterminate')
    expect(half).toContain('aria-valuenow="50"')
    expect(half).toContain('width:50%')
    expect(renderToStaticMarkup(<Progress label="depth" />)).not.toContain('st-progress-time')
  })
})

describe('Field / Select / Toggle', () => {
  it('render styled controls with their labels', () => {
    expect(renderToStaticMarkup(<Field label="Describe the place" value="a warehouse" onChange={noop} multiline hint="one line" />))
      .toBe('<label class="st-field">Describe the place<textarea class="st-input" rows="3">a warehouse</textarea><span class="st-field-hint">one line</span></label>')
    expect(renderToStaticMarkup(<Field label="Height" value="1.75" onChange={noop} type="number" />)).toContain('<input class="st-input" type="number" value="1.75"/>')
    const sel = renderToStaticMarkup(<Select label="Camera" value="eye" onChange={noop} options={[{ value: 'chest', label: 'Chest 1.2 m' }, { value: 'eye', label: 'Eye 1.6 m' }]} />)
    expect(sel).toContain('<select class="st-select">')
    expect(sel).toContain('<option value="eye" selected="">Eye 1.6 m</option>')
    expect(renderToStaticMarkup(<Toggle label="Mirror" checked onChange={noop} />)).toBe('<label class="st-toggle"><input type="checkbox" checked=""/>Mirror</label>')
  })
})
