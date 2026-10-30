import { describe, expect, it } from 'vitest'
import { fitFromMeta, GATE, isMetricDepth, refuseFit, type FitStats } from './fitGate'

const MOGE = 'loc-2026-10-18T04-10-23-594#moge-2-vitl'

// Every settled meta.json on disk (public/lab-assets/renders/<view>/settled-*), the chosen fit recorded 2026-10-18:
// [folder, scale, fit pixels surviving, all candidate pixels, all-pixel median relative error]. All MoGe-2 sources.
type Row = [string, number, number, number, number]
const GOOD: Row[] = [
  ['T19-40-10/settled-klein', 1.0606, 727931, 728910, 0.0083],
  ['T19-40-10/settled-qwen', 1.0029, 728005, 728906, 0.0048],
  ['T20-08-31/settled-klein', 0.9508, 847847, 864358, 0.0107],
  ['T20-49-01/settled-klein', 1.0323, 699844, 705584, 0.0071],
  ['T21-46-46/settled-klein', 1.0143, 724560, 730503, 0.0045],
  ['T21-47-29/settled-klein', 1.0045, 741934, 747694, 0.0075],
  ['T21-48-15/settled-klein', 1.008, 764694, 767557, 0.0061],
  ['T21-49-00/settled-klein', 0.9381, 727863, 747066, 0.0142],
  ['T22-12-58/settled-klein', 1.1801, 898015, 898949, 0.0227],
  ['T22-13-48/settled-klein', 0.9695, 805436, 813272, 0.0223],
  ['T22-21-44/settled-klein', 1.0438, 723243, 724290, 0.0084],
  ['T22-22-37/settled-klein (E11 S 40°)', 0.9278, 736464, 762167, 0.0121],
  ['T22-23-22/settled-klein (E11 S 60°)', 1.2281, 558189, 698565, 0.0294],
  ['T04-11-44/settled-klein (alley, reprocessed)', 0.9043, 766598, 829746, 0.0362],
  ['T04-28-42/settled-klein (alley)', 0.958, 779415, 785328, 0.0124],
  ['T04-33-49/settled-klein (alley)', 0.9286, 605409, 630015, 0.0215],
  ['T04-34-27/settled-klein (alley)', 1.0412, 413004, 451843, 0.0318],
  ['T04-35-10/settled-klein (alley)', 0.9043, 427192, 545170, 0.0517],
]
/** [folder, ..., the reason the gate must give] */
const BAD: [...Row, RegExp][] = [
  ['T21-49-38/settled-klein (auto-fill 21:49)', 1.7371, 182343, 387276, 0.1158, /median depth error 11.6 %.*only 47 %.*scale x1.74/],
  ['T22-24-01/settled-klein (E11 S 80°)', 6.9625, 94444, 486854, 0.4278, /42.8 %.*19 %.*x6.96/],
  ['T22-32-56/settled-e11m-a', 1.5477, 127245, 166616, 0.0549, /^scale x1.55 outside x0.70-1.4 \(metric depth\)$/],
  ['T22-32-58/settled-e11m-a-commanded', 0.9563, 249209, 607002, 0.1446, /14.5 %.*41 %/],
  ['T22-35-41/settled-e11m-b', 1.7219, 64375, 118792, 0.0801, /^only 54 %.*scale x1.72/],
  ['T22-35-43/settled-e11m-b-commanded', 1.1931, 61200, 261806, 0.277, /27.7 %.*23 %/],
  ['T04-13-59/settled-klein (alley, floats)', 0.3484, 412264, 554692, 0.0336, /^scale x0.35 outside x0.70-1.4 \(metric depth\)$/],
  ['T04-16-02/settled-klein (alley, floats)', 0.4017, 402909, 521787, 0.0426, /^scale x0.40 outside/],
  ['T04-18-01/settled-klein (alley, floats)', 0.3731, 489094, 567652, 0.0436, /^scale x0.37 outside/],
]
const stats = ([, scale, n, allN, medianRel]: Row): FitStats => ({ scale, n, all: { n: allN, medianRel } })

describe('settle gate over every settled folder on disk', () => {
  it.each(GOOD)('passes %s', (...row) => expect(refuseFit(stats(row), MOGE)).toBeNull())
  it.each(BAD)('refuses %s', (...row) => expect(refuseFit(stats(row.slice(0, 5) as Row), MOGE)).toMatch(row[5]))
  it('the metric scale bound sits between the two groups with margin both ways', () => {
    const scales = (rows: Row[]) => rows.map((r) => r[1])
    expect(Math.min(...scales(GOOD))).toBeGreaterThan(GATE.metric.minScale * 1.25)
    expect(Math.max(...scales(GOOD))).toBeLessThan(GATE.metric.maxScale / 1.1)
    // the alley three and E11-M a pass residual and survival: only scale catches them
    for (const r of BAD.filter((b) => b[4] < GATE.maxMedianRel && b[2] / b[3] >= GATE.minSurvival)) {
      expect(r[1] < GATE.metric.minScale || r[1] > GATE.metric.maxScale).toBe(true)
    }
  })
})

describe('depth model decides the scale bound', () => {
  it('MoGe-2 and an unlabelled source are metric; another named model is not', () => {
    expect(isMetricDepth('e2/wide#moge-2-vitl')).toBe(true)
    expect(isMetricDepth(undefined)).toBe(true)
    expect(isMetricDepth('bank/plaza')).toBe(true)
    expect(isMetricDepth('bank/plaza#depth-anything-v2')).toBe(false)
  })
  it('a non-metric source keeps only the wide backstop', () => {
    const alley = stats(BAD[6].slice(0, 5) as Row)
    expect(refuseFit(alley, 'x#depth-anything-v2')).toBeNull()
    expect(refuseFit({ ...alley, scale: 0.3 }, 'x#depth-anything-v2')).toBe('scale x0.30 outside x0.33-3 (non-metric depth)')
  })
})

describe('fit read back from a written meta', () => {
  it('takes the applied fit (scale + shift -> withShift residuals)', () => {
    const al = {
      applied: 'scale + shift', scale: 0.3484, shift: -0.93,
      scaleOnly: { n: 429983, all: { n: 554692, medianRel: 0.052 } },
      withShift: { n: 412264, all: { n: 554692, medianRel: 0.0336 } },
    }
    expect(fitFromMeta(al)).toEqual({ scale: 0.3484, n: 412264, all: { n: 554692, medianRel: 0.0336 } })
    expect(fitFromMeta({ ...al, applied: 'scale only' }).all.medianRel).toBe(0.052)
  })
  it('a meta with no fit stats (pre-gate format) is refused, never waved through', () => {
    expect(refuseFit(fitFromMeta({ applied: 'scale only', scale: 1, shift: 0 }))).toMatch(/median depth error NaN.*only 0 %/)
    expect(refuseFit(fitFromMeta(undefined))).not.toBeNull()
  })
})
