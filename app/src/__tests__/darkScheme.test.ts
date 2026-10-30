// native-dropdowns-dark: the dark colour scheme lives at the app root (index.css) so the browser paints every
// native select, option list, date and number control dark; the option colours are pinned because the Windows
// dropdown popup follows the OS, not the page.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

describe('dark native controls at the app root', () => {
  it('declares the dark colour scheme on :root', () => {
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark/)
  })

  it('pins dark option colours (incl. disabled rows) for the native dropdown popup', () => {
    expect(css).toMatch(/option\s*\{[^}]*background-color/)
    expect(css).toMatch(/option:disabled\s*\{/)
  })
})
