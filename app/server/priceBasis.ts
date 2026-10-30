/**
 * Where every price the app shows before a paid press comes from (re-based 2026-10-25, Track PRICES; Render 145 f, concepts, 3D piece and
 * planner re-based 2026-10-28, Track Q: the shown figures had drifted to 2x what the last jobs billed). The rule: a shown price is at
 * or just above what Cloud bills, never below (an under-read price is what costs the owner trust; an over-read costs nothing).
 * Source: app/experiments/credit-log.md, the app's own succeeded rows (credits = cents x 2.11; the ledger rounds). Price files
 * cite this file; priceBasis.test.ts reads the ledger through `ledgerRows` below and holds every shown price at or above every
 * billed row it prices (no hand-typed floor: a floor typed at the median is how a 9 cr pair once passed under a 4 shown).
 *
 *   price                         was shown        billed (n rows: median / dearest)      now shown
 *   ----------------------------  ---------------  -------------------------------------  --------------------------
 *   Render 41 f                   ~11              n=1: 16                                17
 *   Render 49 f                   12  (keyed 18)   n=5: 17.2 / 18.1; keyed 17.4-18.1      18  (keyed 19)
 *   Render 57 f                   ~14              n=1: 18.6                              20
 *   Render 97 f                   21               n=2: 20.3 / 27.5                       28
 *   Render 145 f (Stage)          43 (curve)       n=5, 10-28: 21 / 28 / 28 / 25 / 28     31  (own anchor)
 *   Render 193 f                  58               n=6: 57 / 37 / 56 / 36 / 37 / 37 (two near 57)   58  (unchanged: held by the two 56-57 bills)
 *   Render keyframe surcharge     +6               0-1 over the unkeyed length            +1
 *   Render, learned scale         0.85-1.5x        mean billed/seed of past renders       1-1.5x (raises, never lowers)
 *   Cast front, per candidate     1  (2 shown)     x2 n=16: 2.8 / 8.6 (cold spikes 5-8.6) 5 a job + 2 each (a pair 9;
 *                                                  x3 n=1: 6.4; x4 n=4: 5.5 / 6.7         x3 11, x4 13)
 *   Cast sheet (views)            15               n=4: 14.0 / 14.0 (min 8.9)             15  (unchanged)
 *   Scene concept, draft          6 each (x2 12)  x1 n=26: 0.8-6 (6 once, 10-24); x2 n=6: 5 (4.7 on 10-28)   6 + 1 per extra (x2 7)
 *   Scene concept, full           17 each (x2 34)  x1 n=2: 16 / 16; x2 n=5: 28-29      17 + 14 per extra (x2 31)
 *   Hero still (Klein), 1 / 2     3 / 4            n=26: 2.2 / 3.0                        3 / 4  (unchanged)
 *   First frame (draw + finish)   21               10-28 n=6: draw 16.8-17.4, finish 1.1-2.5 (about 19-20 together)   21  (unchanged, 5% over)
 *   Kit still draw + finish       18 + 3 = 21      draw n=21: 15.4 / 17.7; finish n=21: 2.2 / 3.0   21  (unchanged)
 *   Master candidates, per seed   18               x1 n=2: 17.6; x2 n=8: 30.7 / 31.3 (15.4 / 15.7 each)   18  (unchanged;
 *                                                  a pair shows 36, ~5 over: shared with the client's price, left)
 *   Face redraw / prop redraw     3 / 3            E141 cface 3.0; E138/E139 loco 2.0; two-face chain 3.8 (n=4)   3 / 3
 *   Face detail pass, 49 f        12               no app row yet; E143 arms 3.5 warm / 8.5 cold + redraw 3   12  (held on
 *                                                  that arm, not on the Render curve: it scales with frames)
 *   Build in 3D piece             12               app n=7: 7 (first, cold) then 3 / 4 / 4 / 4 / 4 / 2   8  (E136's experiment meshes, 7-11, ran
 *                                                  before the app's graph and are not its basis; a cold start there reached 11)
 *   Planner call (plan/develop)   3                n=19 since 10-26: 0.8-3.6 (3.4, 3.6, 3.3, 3.3 over 3)   4  (a lone call; a batch of n is 3 + n)
 *   Planner internal retry        "one more job"   n=5: 1.2 / 2.4                         one more job (unchanged)
 *
 * A planner answer that fails the check twice bills two jobs (a 422). Both are held by the day budget (runJob commits each) and
 * the response carries them as `spentCredits` (measured, else the estimate) so a 422 is counted like a 200.
 *
 * priceBasis.test.ts also holds the other side: each of these may not sit far above the dearest of the last jobs of its type.
 *
 * Not re-based here (outside this track's files, still under-read where the ledger shows it): surround (24 shown; the exterior pano
 * chain bills 32-55 + upscale 7 + MoGe 1), and the legacy crossview / clip / location / look / settle prices.
 */

/** one succeeded row of app/experiments/credit-log.md: tag (JOB = the app's own press, else the experiment), label, note, credits */
export interface LedgerRow { tag: string; label: string; note: string; credits: number }

/** the succeeded rows with a billed figure, in the ledger's own whole-credit rounding. Pure: the caller reads the file. */
export function ledgerRows(text: string): LedgerRow[] {
  return text.split('\n').map((l) => l.split('|').map((c) => c.trim())).filter((c) => c.length > 10 && c[5] === 'succeeded')
    .map((c) => ({ tag: c[2], label: c[3], note: c[10], credits: Number(c[9]) })).filter((r) => r.label && Number.isFinite(r.credits) && r.credits > 0)
}
