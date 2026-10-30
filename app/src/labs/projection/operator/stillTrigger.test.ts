import { describe, expect, it } from 'vitest'
import { STILL_KEY_ENABLED, STILL_KEY_OFF, stillTrigger } from './stillTrigger'
import { FRAME, ASPECT, scriptedEngine } from './testRig'

/** A take() that stays pending until released, counting submissions. */
function cloud() {
  const calls: number[] = []
  let release: () => void = () => {}
  const take = () => { calls.push(calls.length); return new Promise<void>((res) => { release = res }) }
  return { calls, take, finish: async () => { release(); for (let i = 0; i < 4; i++) await Promise.resolve() } }
}

/** Wave A: the T / Cross key takes no still. These guard that: the key does nothing, whatever the lab says. */
describe('operator still button is off (Wave A)', () => {
  it('the switch is off', () => expect(STILL_KEY_ENABLED).toBe(false))

  it('a press never submits, however free the lab is, and repeats never submit either', () => {
    const c = cloud()
    const press = stillTrigger({ blocked: () => null, take: c.take, price: () => 'Quality, ~14 credits' })
    for (let i = 0; i < 5; i++) expect(press()).toEqual({ taken: false, message: STILL_KEY_OFF })
    expect(c.calls).toHaveLength(0)
  })

  it('through the engine: T / Cross pressed on consecutive frames submits nothing and logs no still', () => {
    const c = cloud()
    const { engine, input } = scriptedEngine({ onStill: stillTrigger({ blocked: () => null, take: c.take }) })
    for (let i = 0; i < 10; i++) {
      input.actions.add('still')
      engine.tick(FRAME, ASPECT)
    }
    expect(c.calls).toHaveLength(0)
    expect(engine.stills).toHaveLength(0)
    expect(engine.message).toBe(STILL_KEY_OFF)
  })
})

/**
 * The old behaviour, kept under test for the day the key is switched back on (run with the switch flipped by hand): when
 * the key is off these describe-blocks are skipped, not deleted.
 */
describe.skipIf(!STILL_KEY_ENABLED)('operator still button (key enabled)', () => {
  it('one press = one submission; presses while it runs never submit', async () => {
    const c = cloud()
    const press = stillTrigger({ blocked: () => null, take: c.take })
    expect(press()).toEqual({ taken: true, message: 'Taking still…' })
    for (let i = 0; i < 5; i++) expect(press().taken).toBe(false)
    expect(c.calls).toHaveLength(1)
    await c.finish()
    expect(press().taken).toBe(true)
    expect(c.calls).toHaveLength(2)
  })

  it('the flash names the mode and rough price', () => {
    const c = cloud()
    const press = stillTrigger({ blocked: () => null, take: c.take, price: () => 'Quality, ~14 credits' })
    expect(press()).toEqual({ taken: true, message: 'Taking still (Quality, ~14 credits)…' })
  })

  it('shows the blocked reason instead of submitting', () => {
    const c = cloud()
    const press = stillTrigger({ blocked: () => 'Load a bank shot to take a still', take: c.take })
    expect(press()).toEqual({ taken: false, message: 'Load a bank shot to take a still' })
    expect(c.calls).toHaveLength(0)
  })

  it('a failed still frees the button again', async () => {
    let n = 0
    const press = stillTrigger({ blocked: () => null, take: () => { n++; return Promise.reject(new Error('cloud down')) } })
    press()
    for (let i = 0; i < 4; i++) await Promise.resolve()
    press()
    expect(n).toBe(2)
  })

  it('through the engine: Cross / T pressed on consecutive frames submits once and logs one still', () => {
    const c = cloud()
    const { engine, input } = scriptedEngine({ onStill: stillTrigger({ blocked: () => null, take: c.take }) })
    for (let i = 0; i < 10; i++) {
      input.actions.add('still')
      engine.tick(FRAME, ASPECT)
    }
    expect(c.calls).toHaveLength(1)
    expect(engine.stills).toHaveLength(1)
    expect(engine.message).toBe('A still is already running')
  })

  it('through the engine: a blocked press flashes the reason and logs nothing', () => {
    const c = cloud()
    const { engine, input } = scriptedEngine({ onStill: stillTrigger({ blocked: () => 'Auto-fill is running…', take: c.take }) })
    input.actions.add('still')
    engine.tick(FRAME, ASPECT)
    expect(c.calls).toHaveLength(0)
    expect(engine.stills).toHaveLength(0)
    expect(engine.message).toBe('Auto-fill is running…')
  })
})
