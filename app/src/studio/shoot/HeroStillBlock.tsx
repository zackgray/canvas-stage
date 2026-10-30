import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KitStill } from '../../../server/hero/kitSpec'
import { kitFinishCredits, kitStillCredits } from '../../../server/hero/kitSpec'
import { heroCredits } from '../../../server/hero/spec'
import type { ClayExport, KeyframeRole } from '../../shared/shotContract'
import { NOBODY_IN_SHOT } from '../../shared/stillPressContract'
import type { ProjectionLabState } from '../../labs/projection/useProjectionLab'
import { worldMismatch } from '../../labs/projection/clay/exportClay'
import { RowHead, Seg } from '../Seg'
import { PriceButton, RunPill, STILL_ESTIMATE } from '../ui'
import type { GroundTrack } from '../../stage3d/performer'
import { entityName, useWorldBible } from './castNames'
import { closePassHint } from './closePassHint'
import { captureOpening, openingBlock } from './heroCapture'
import { clayFrameItem } from './clayFrame'
import { HeroPublisher } from './HeroPublisher'
import { HeroStrip } from './HeroStrip'
import { StillPreview } from './StillPreview'
import { countLabel, STILL_COUNTS, useStillCount, type StillCount } from './stillCount'
import { newestBatch, useStageStillPress } from './stageStillPress'
import { PREP_FAILED, PREP_FIRST, useStillPrep } from './stillPrep'
import { framesBehindSet, SET_BEHIND } from './takeClay'
import { useDrawMode } from './useDrawMode'
import { useHeroStill, type CaptureOpening, type RenderOpts } from './useHeroStill'
import { FIRST_CHOICE, useStillPreview } from './useStillPreview'
import { useStillRecipe } from './stillRecipe'
import { useSentEdits } from '../stage/sentEdits'
import { drawAddsField, useDrawAdds } from '../stage/drawAddSwitches'

/** the still is in while its job still finishes: the working state is over, this quiet line stays until the job ends */
export const STILL_LANDED = 'The first frame is in. The last checks finish in the background.'
/** the pill while the press updates the take's frames from the set (free) before the paid draw */
export const PREPPING = 'Updating the frames…'

const ROLES = [
  { id: 'opening', label: 'Opening', title: 'Frame 0: the still the final render starts from' },
  { id: 'mid', label: 'Mid', title: "The middle frame: a keyframe guide, drawn on the 3D set's depth there" },
  { id: 'end', label: 'End', title: "The last frame: a keyframe guide, drawn on the 3D set's depth there" },
] as const

/**
 * "Render this frame" on the locked take's opening (Wave B, docs/wave-b-contract.md, owner T2): one distilled Klein 4B still
 * from the take's frame 0 + the cast face card, a strip of the recent stills, Approve (one per take), a stale badge.
 * Works only on the take Shoot's lock block holds for the world on the set; otherwise it says to lock one. `capture` is for tests.
 * A kit world (track B): the still is drawn by Qwen-Image 2512 locked to the clay's depth, then finished by Klein (~21 cr shown), for
 * the opening, mid or end keyframe; the strip shows the picked keyframe's stills, and a still whose layout check failed says so.
 * `kit` forces the kit controls (tests); otherwise they show when the stage holds a kit world. A kit press prepares the take's 3D set
 * frames first when they are missing (free; stillPrep.ts) and never reaches the paid draw without their depth; `prepare` is for tests.
 * (recipe wave) The owner picks 1 or 2 stills per press (owner 2026-10-25, 1 by default, remembered for the session), and the press preview (StillPreview) shows and lets the owner change what
 * goes: the prompt, the lock, the material refs; "Draw again with this seed" on a still re-draws its seed with the card's choices.
 * `pressInBar` (merge step 7): the Stage's draw bar shows the priced press and the running pill in this block's place; the block
 * publishes them (heroPublished.ts) instead of rendering the button — the closure stays the block's, so the gate and the price are
 * exactly as it computed them.
 * `bare` (layout wave L5): render nothing visible, publish anyway — the Stage mounts this block in no-UI form, so the draw bar's
 * press never dies with a panel.
 * The Stage's bar (`pressInBar`, the Stage simplification): one press = one or two opening stills (the scene's own choice), with the
 * app's default lock (Photographic) and no keyframe choice; the take's 3D set frames are prepared first, free, and a failure is said
 * under the press. Two stills are offered one at a time over the set; Approve takes the one shown (consistency pass).
 */
export function HeroStillBlock({ lab, capture, kit: kitProp, prepare, pressInBar, bare }: { lab: ProjectionLabState; capture?: CaptureOpening; kit?: boolean; prepare?: () => Promise<ClayExport | null>; pressInBar?: boolean; bare?: boolean }) {
  const stage = lab.stage
  const kit = kitProp ?? !!stage?.kit
  const draw = useCallback<CaptureOpening>((take) => {
    if (capture) return capture(take)
    if (!stage) return Promise.reject(new Error('The stage is not ready.'))
    return captureOpening(stage, take, lab.s.source)
  }, [capture, stage, lab.s.source])
  const h = useHeroStill(draw)
  // the keyframe, the prompt, the press choices and the mid pick live in one per-take store every mounted copy shares (stillRecipe.ts)
  const recipe = useStillRecipe(h.take?.id ?? null)
  const { prompt, midPick } = recipe
  // (owner 10-29) the Stage's "What will be sent", edited: the draw words and the finish words go as written, for this take until Reset
  const sentEdits = useSentEdits(pressInBar ? h.take?.id ?? null : null)
  // the Stage's bar: always the opening frame and the default lock (Photographic)
  const role: KeyframeRole = pressInBar ? 'opening' : recipe.role
  const choice = pressInBar ? { ...recipe.choice, preset: FIRST_CHOICE.preset, ...(sentEdits.prompt ? { edited: sentEdits.prompt.text } : {}) } : recipe.choice
  const finishPrompt = sentEdits.finishPrompt?.text
  // (prompt-fix pass) the app's additions to the draw words the owner switched off for this take ("Added by the app")
  const adds = drawAddsField(useDrawAdds(pressInBar ? h.take?.id ?? null : null))
  const { setRole, setChoice, setMidPick } = recipe
  const prep = useStillPrep(lab, h.take, kit, h.clearError, prepare)
  // (owner 10-29) the press's own working state from the moment it is pressed: the free frames update runs first and said nothing
  const [prepping, setPrepping] = useState(false)
  const [stored, setCount] = useStillCount()
  // (consistency pass) the Stage's own 1 or 2, remembered for the scene; its same-look seed; which of two stills is shown
  const dm = useDrawMode(pressInBar ? lab.kit?.id ?? null : null), bar = useStageStillPress(lab.kit?.id ?? null, dm.chosen)
  const count = pressInBar ? bar.count : stored
  // a new keyframe starts again from the recipe (its prompt and refs are that frame's)
  const pickRole = (r: KeyframeRole) => { setRole(r); setChoice((c) => ({ ...c, refs: null, edited: null })) }
  // the close-pass hint (S1): the grid frame where a figure is largest, offered as the mid keyframe; picking it spends nothing
  const bible = useWorldBible(kit ? lab.kit?.id : null)
  const castId = lab.kit?.perf?.castId ?? null
  const pack = lab.performance?.layer?.pack ?? null
  const tracks = (lab.performance?.layer as { performer?: { tracks?: readonly GroundTrack[] } } | null)?.performer?.tracks
  const hint = useMemo(() => (kit && h.take && tracks ? closePassHint(h.take, pack, tracks, (t) => entityName(bible, castId, t)) : null), [kit, h.take, pack, tracks, bible, castId])
  const pick = kit ? role : 'opening'
  const midFrame = midPick && midPick.takeId === h.take?.id ? midPick.frame : undefined
  // the preview composes what the press will send: with the earlier frame's clothes only while the owner has the Stage's choice on
  const pvLook = !!pressInBar && dm.chosen !== 'edit' && bar.lookOn
  const pv = useStillPreview({ takeId: kit ? h.take?.id ?? null : null, startKey: h.take?.startKey, role: pick, frame: pick === 'mid' ? midFrame : undefined, count, choice, mode: dm.chosen, clayKey: prep.clay?.finishedAt ?? null, sameLook: pvLook, finishPrompt, ...adds })
  useEffect(() => { if (pressInBar) dm.observe(pv.preview) })
  // a still draws for 2-3 minutes: a clock from the draw's own start (its job's, which a tab switch keeps), else from when this page
  // saw it start; a remount mid-draw never restarts it, so a still already listed by this press reads as landed, not as a new press
  const busyNow = !!h.phase || !!h.list?.running || prep.running || prepping
  const since = useRef<number | null>(null)
  if (!busyNow) since.current = null
  else if (h.since !== null) since.current = h.since
  else if (since.current === null) since.current = Date.now()
  // what the viewport overlay and the draw bar call back into: stable, so publishing them wakes nobody (heroPublished.ts)
  const act = useRef<{ approve: (id: string) => void | Promise<void>; redraw: () => void; changed: () => void; draw: () => void; recover: () => void; finish: () => void; count: (n: number) => void }>({ approve: () => undefined, redraw: () => undefined, changed: () => undefined, draw: () => undefined, recover: () => undefined, finish: () => undefined, count: () => undefined })
  const calls = useRef({ onApprove: (id: string) => act.current.approve(id), onRedraw: () => act.current.redraw(), onChanged: () => act.current.changed(), onDraw: () => act.current.draw(),
    onRecover: () => act.current.recover(), onFinish: () => act.current.finish(), onCount: (n: number) => act.current.count(n), onShow: (id: string) => bar.show(id) })
  const lastAwaiting = useRef<(KitStill & { stale: boolean }) | null>(null)
  // review F9: an edit made for one redraw ends when that opening is accepted, so the next draw (another frame) sends the recipe
  const approvedId = h.stills.find((x) => !x.stale && (x.role ?? 'opening') === 'opening' && x.approved)?.id ?? null
  useEffect(() => { if (approvedId) setChoice((c) => (c.edited === null ? c : { ...c, edited: null })) }, [approvedId, setChoice])
  if (!h.take) {
    const published = { prompt: { kit, preview: null, choice, disabled: false }, overlay: null, press: null }
    if (bare) return <HeroPublisher model={published} />
    return (
      <section data-testid="hero-block">
        <RowHead title="Hero still" />
        <p className="st-muted" data-testid="hero-no-take">Lock a take first: the hero still is rendered from the locked take's opening frame.</p>
        <HeroPublisher model={published} />
      </section>
    )
  }

  const running = !!h.phase || !!h.list?.running || prep.running || prepping
  const drawingNow = !!h.phase || !!h.list?.running // the paid draw itself (frame prep is free and keeps the button)
  const needsDraw = !h.list?.opening?.present || h.list.opening.startKey !== h.take.startKey
  // another world on the set refuses the press even with the opening already uploaded: the still would not be of this set
  const blocked = worldMismatch(h.take, lab.s.source) ?? (!capture && needsDraw ? openingBlock(stage, h.take, lab.s.source) : null)
  const lost = h.list?.unrecovered?.[0]?.jobId ?? h.failedJob
  const shown = kit ? h.stills.filter((s) => (s.role ?? 'opening') === pick) : h.stills
  // the newest press's unfinished draws of this keyframe (one Finish = one Klein job of one press)
  const pending = kit ? h.unfinished.filter((u) => u.role === pick && u.startKey === h.take!.startKey) : []
  // a take of another set (another scene's) never gets a paid Finish from this one
  const waiting = worldMismatch(h.take, lab.s.source) ? [] : pending.filter((u) => u.createdAt === pending[0]?.createdAt)
  const priceOf = (n: number) => (kit ? kitStillCredits(n) : heroCredits(n))
  const price = dm.price(pv.preview) ?? priceOf(count)
  const one = dm.price1(pv.preview) ?? priceOf(1) // a redraw of one still, in the mode it will be sent in
  const gate = (pick === 'opening' ? blocked : worldMismatch(h.take, lab.s.source)) ?? (prep.blocked ? `The 3D set frames can't be prepared yet: ${prep.blocked}` : null)
  // what the card shows is what goes: its lock, its refs (the preview's default refs once read; else the server picks the same)
  const sentRefs = choice.refs ?? pv.preview?.refs?.filter((r) => r.sent).map((r) => r.tag)
  const kitFields = kit ? { role: pick, preset: choice.preset, ...(dm.effective(pv.preview) === 'edit' ? { mode: 'edit' as const } : {}), ...(sentRefs ? { materials: sentRefs } : {}), ...(finishPrompt ? { finishPrompt } : {}), ...adds } : {}
  const text = kit ? choice.edited ?? '' : prompt
  // the frames first when they are missing (free), and the paid draw only once their depth is there
  const press = async (o: RenderOpts) => {
    setPrepping(true) // the working state at once: the press is off, the pill says the frames are being updated
    let ok = false
    try { ok = await prep.ensure() } finally { setPrepping(false) }
    if (!ok) return h.fail(PREP_FAILED)
    await h.render(o)
  }
  // the viewport asks only while the take has no approved opening still (review F3: a sibling of the press, or a leftover, never
  // covers the one just accepted, and accepting it never silently moves the approval); then the newest one nobody has approved.
  // A stale still cannot be approved, so it is not asked about, and a stale approval no longer counts as the take's opening
  const opening = h.stills.filter((x) => !x.stale && (x.role ?? 'opening') === 'opening')
  const approvedStill = opening.find((x) => x.approved) ?? null
  // (consistency pass) a press of two stills: both are offered, the owner flips between them and approves the one shown
  const batch = approvedStill ? [] : newestBatch(opening)
  const awaiting = approvedStill ?? bar.shown(batch)
  if (JSON.stringify(awaiting) !== JSON.stringify(lastAwaiting.current)) lastAwaiting.current = awaiting
  // the working state ends when the still is in: a still of this press already listed while the job still runs is said quietly
  const landed = drawingNow && since.current !== null && opening.some((x) => Date.parse(x.createdAt) >= since.current! - 5000)
  const openGate = blocked ?? (prep.blocked ? `The 3D set frames can't be prepared yet: ${prep.blocked}` : null)
  // (stage-only) the approved frame of another take the Stage press may take the look from: only when the owner turns it on does the
  // press ask for its clothes and send its seed (stageStillPress.ts); off, the finish takes the clothes from the person's card
  const look = pressInBar ? pv.preview?.lookFrame ?? null : null, fromEdit = dm.effective(pv.preview) === 'edit'
  const seed = fromEdit ? undefined : bar.seedOf(look)
  const lookAsk = !fromEdit && bar.asks(look) ? { sameLook: true } : {}
  const openPress = (): Promise<void> => (pick === 'opening'
    ? press({ count: 1, prompt: text, price: one, ...kitFields, ...lookAsk })
    : press({ count: 1, prompt: '', price: priceOf(1), ...(kit ? { role: 'opening' as const, preset: choice.preset } : {}) }))
  act.current = { approve: (id) => h.approve(id), redraw: () => void openPress(), changed: h.reload, count: (n) => bar.setCount(n === 2 ? 2 : 1),
    recover: () => { if (lost) void h.recover(lost) }, finish: () => { if (waiting.length) void h.finish(waiting.map((u) => u.id), kitFinishCredits(waiting.length)) },
    draw: () => void press({ count, prompt: text, price, ...kitFields, ...(pick === 'mid' && midFrame !== undefined ? { frame: midFrame } : {}), ...(seed !== undefined ? { seed } : {}), ...lookAsk }) }
  // the draw bar's press, in this block's place (step 7): the price, the gate and the closure travel with it; the pill's clock starts where the block's did
  const pressTitle = gate ?? (running ? 'A draw is running' : kit ? `Draws the ${pick} frame on the 3D set's depth (Qwen-Image 2512), then the cast card (Klein)` : 'Renders the take\'s opening frame with the cast face card')
  const heroPress = pressInBar ? { price, drawing: (drawingNow && !landed) || prepping, phase: prepping ? PREPPING : h.phase, since: since.current, gate, disabled: running || !!gate, title: pressTitle, onPress: calls.current.onDraw, error: h.error,
    note: landed ? STILL_LANDED : null, onRecover: lost && !running ? calls.current.onRecover : null,
    finish: waiting.length > 0 && !running ? { count: waiting.length, price: kitFinishCredits(waiting.length), onFinish: calls.current.onFinish } : null,
    stills: count, onStills: calls.current.onCount, sameLook: fromEdit ? null : bar.sameLook(look), drawMode: dm.model(pv.preview, count), drawNudge: dm.nudge(pv.preview),
    nobody: pv.preview?.nobody ? NOBODY_IN_SHOT : null, setBehind: kit && !prep.running && framesBehindSet(prep.clay) ? SET_BEHIND : null } : null
  const overlay = lastAwaiting.current ? { still: lastAwaiting.current, approved: !!lastAwaiting.current.approved, redrawPrice: openGate ? null : pick === 'opening' ? one : priceOf(1), running, error: h.error, onApprove: calls.current.onApprove, onRedraw: calls.current.onRedraw, onChanged: calls.current.onChanged,
    choices: batch.length > 1 ? batch.map((x) => x.id).join(' ') : '', onShow: calls.current.onShow } : null
  const published = { prompt: { kit, preview: pv.preview, choice, disabled: running }, overlay, press: heroPress }
  if (bare) return <HeroPublisher model={published} />
  return (
    <section data-testid="hero-block">
      <RowHead title="Hero still" hint={shown.length ? String(shown.length) : undefined} />
      {kit && <Seg label="Keyframe" small value={role} onChange={pickRole} items={ROLES} testId="hero-role" />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!pressInBar && (drawingNow ? <RunPill label={h.phase ?? 'A hero still is being drawn…'} since={since.current} estimate={STILL_ESTIMATE} price={price} testId="hero-phase" /> : (
        <PriceButton verb="Draw this frame" price={price} testId="hero-render" disabled={running || !!gate}
          title={pressTitle}
          onClick={() => void press({ count, prompt: text, price, ...kitFields, ...(pick === 'mid' && midFrame !== undefined ? { frame: midFrame } : {}) })} />))}
        <Seg label="Stills per press" small value={String(count) as `${StillCount}`} testId="hero-count" onChange={(v) => setCount(Number(v) as StillCount)}
          items={STILL_COUNTS.map((n) => ({ id: String(n) as `${StillCount}`, label: countLabel(n, priceOf(n)), disabled: running,
            title: n === 1 ? 'One still per press: the cheaper way to try a frame' : 'Two stills (two seeds) in one press, to pick the better' }))} />
      </div>
      {gate && <p className="st-muted" data-testid="hero-blocked">{gate}</p>}
      {!gate && kit && !prep.ready && !prep.running && <p className="st-muted" data-testid="hero-prep-first">{framesBehindSet(prep.clay) ? SET_BEHIND : PREP_FIRST}</p>}
      {prep.running && prep.line && <p className="st-muted" data-testid="hero-prep" role="status">{prep.line}</p>}
      {hint && (
        <p className="st-muted" data-testid="hero-closepass">
          {pick === 'mid' && midFrame === hint.frame ? `Mid keyframe at f${hint.frame}, where ${hint.label} passes close.` : hint.text}{' '}
          {!(pick === 'mid' && midFrame === hint.frame) && (
            <button type="button" className="st-btn" data-testid="hero-closepass-use" disabled={running}
              title="Picks this frame as the mid keyframe; nothing is drawn until you press Draw this frame"
              onClick={() => { pickRole('mid'); setMidPick({ takeId: h.take!.id, frame: hint.frame }) }}>Use f{hint.frame}</button>
          )}
        </p>
      )}
      {kit && <StillPreview preview={pv.preview} error={pv.error} choice={choice} onChoice={setChoice} disabled={running}
        clay={clayFrameItem(h.take, prep.clay, pv.preview?.frame ?? (pick === 'opening' ? 0 : -1))} />}
      {h.error && <p className="st-warn" data-testid="hero-error" role="alert">{h.error}</p>}
      {lost && !running && (
        <p className="st-muted" data-testid="hero-lost">
          A paid job did not finish downloading.{' '}
          <button type="button" className="st-btn" data-testid="hero-recover" title="Fetches the job that was already paid for; it never submits a new one" onClick={() => void h.recover(lost)}>Recover it</button>
        </p>
      )}
      {waiting.length > 0 && !running && (
        <p className="st-muted" data-testid="hero-unfinished">
          {waiting.length === 1 ? 'A drawn still never got its finish' : `${waiting.length} drawn stills never got their finish`} (the day budget or a restart stopped it between the two steps).{' '}
          <PriceButton verb="Finish" price={kitFinishCredits(waiting.length)} testId="hero-finish" title="Runs only the cast-card finish on the draws already paid for; it never draws again" onClick={() => void h.finish(waiting.map((u) => u.id), kitFinishCredits(waiting.length))} />
        </p>
      )}
      <HeroStrip stills={shown} all={h.stills} clayOf={(s) => clayFrameItem(h.take!, prep.clay, s.frame ?? 0)} onApprove={(id) => h.approve(id)} approveError={h.error} onUnapprove={(id) => void h.unapprove(id)} disabled={running} onChanged={h.reload}
        redraw={gate ? undefined : { price: one, onRedraw: (s) => void press({ count: 1, seed: s.seed, prompt: text, price: one, ...kitFields, ...(s.role === 'mid' && s.frame !== undefined ? { frame: s.frame } : {}) }) }} />
      <HeroPublisher model={published} />
    </section>
  )
}
