// @vitest-environment jsdom
// A write of the take's own words (the take list) reads the still list again at once: the first frame the server now calls stale
// is badged with its reason, exactly as after a Bible write (the drawer's words). Fake server, nothing paid.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSceneJobs } from '../../jobs/sceneJobs'
import { TAKE_WORDS_CHANGED } from '../../shared/takeWordsContract'
import type {} from '../../shared/stillBible'
import { resetCurrentTake, setCurrentTake } from './currentTake'
import { HeroStillBlock } from './HeroStillBlock'
import { base, lab, serve, still } from './__tests__/heroStillHarness'
import { resetStillRecipe } from './stillRecipe'
import { resetClayStore } from './takeClay'

beforeEach(() => { resetCurrentTake(); resetClayStore(); setCurrentTake('take-1'); sessionStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetCurrentTake(); resetClayStore(); resetSceneJobs(); resetStillRecipe() })

describe("the take's words and its first frame", () => {
  it('a take words write reads the list again: the still is badged with the reason the server gives', async () => {
    const s = base({ opening: { present: true, startKey: 'aaaa0001' }, stills: [still('hero-a1', { approved: true })] }); serve(s)
    render(<HeroStillBlock lab={lab} capture={async () => new Blob(['x'])} />)
    await screen.findByTestId('hero-still-hero-a1')
    expect(screen.queryByTestId('hero-stale-hero-a1')).toBeNull()
    s.stills = [still('hero-a1', { approved: true, bibleWhy: 'The scene prompt changed after this still was drawn' })]
    window.dispatchEvent(new CustomEvent(TAKE_WORDS_CHANGED, { detail: 'take-1' }))
    const badge = await screen.findByTestId('hero-stale-hero-a1', {}, { timeout: 1500 })
    expect(badge.getAttribute('title')).toBe('The scene prompt changed after this still was drawn')
  })
})
