import { useEffect } from 'react'
import { publishHero, type HeroPublished } from './heroPublished'

/**
 * Renders nothing: publishes the still block's press and awaiting still (heroPublished.ts) for the
 * viewport overlay, and clears them when the block goes (no take, another screen). Re-publishing the same models wakes nobody.
 */
export function HeroPublisher({ model }: { model: HeroPublished }) {
  useEffect(() => { publishHero(model) })
  useEffect(() => () => publishHero(null), [])
  return null
}
