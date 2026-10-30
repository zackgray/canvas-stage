// Track C: the planner's system prompt carries the general density rule (a place named as many things is many pieces) and the Props
// list rule (one tagged, labelled piece per entry); both read the same marker the browser writes (planProps.ts PROPS_MARK).
import { describe, expect, it } from 'vitest'
import { planSystemPrompt } from '../../../server/planner/planText.ts'
import { PROPS_MARK } from '../planProps.ts'

describe('plan prompt: density and props', () => {
  const p = planSystemPrompt()
  it('says a place named as many things is many pieces, with no concept of its own in the rule', () => {
    const rule = p.slice(p.indexOf('MANY THINGS ARE MANY PIECES'), p.indexOf('THE PROPS LIST'))
    expect(rule).toMatch(/orchard, a market, a forest/)
    expect(rule).toMatch(/at least 8/)
    expect(rule).not.toMatch(/beekeeper|hive|bee/i)
    expect(p.slice(p.indexOf('THE PROPS LIST'))).not.toMatch(/beekeeper|hive|bee/i)
  })
  it('asks for one labelled, tagged piece per Props entry, under the marker the browser writes', () => {
    const rule = p.slice(p.indexOf('THE PROPS LIST'))
    expect(rule).toContain(`\`${PROPS_MARK} [tag] name: words`)
    expect(rule).toMatch(/pieceTag.*prop:/)
    expect(rule).toMatch(/ONE item of its own/)
  })
  it('does not ask for a head covering or any cloth', () => {
    expect(p).not.toMatch(/\b(veil|hat|hood|scarf|cloth)\b/i)
  })
})
