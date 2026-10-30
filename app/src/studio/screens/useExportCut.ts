import { useEffect, useMemo, useState } from 'react'
import { bestPerWarp, commonRange, evenSegments, outputSize, validateCut, type CutController, type CutSegment, type CutTake } from '../../labs/projection/cut'

/** The first cut: the best take of every camera move, split evenly over the span they all cover. */
export function firstCut(takes: CutTake[]): CutSegment[] {
  const best = bestPerWarp(takes)
  const range = commonRange(best)
  return range ? evenSegments(best, range[0], range[1]) : []
}

/** The newest performance's pack id: the one whose newest render has the latest stamp (listing order breaks ties). */
export function newestPack(performances: { packId: string; takes: CutTake[] }[]): string | null {
  let best: string | null = null
  let at = ''
  for (const p of performances) {
    const newest = p.takes.reduce((m, t) => (t.stamp > m ? t.stamp : m), '')
    if (best === null || newest >= at) { best = p.packId; at = newest }
  }
  return best
}

/**
 * The Export screen's state over the Cut controller: the performance on the set (`packId`; another scene's renders are never
 * listed, so with none on the set there is nothing to cut), its cut and the playhead. `packId` undefined = every performance (tests).
 */
export function useExportCut(cut: CutController, scope?: string | null) {
  const all = cut.data?.performances ?? []
  const performances = scope === undefined ? all : all.filter((p) => p.packId === scope)
  const [packId, setPackId] = useState<string | null>(null)
  const [segs, setSegs] = useState<CutSegment[]>([])
  const [playhead, setPlayhead] = useState(0)
  const chosen = packId && performances.some((p) => p.packId === packId) ? packId : newestPack(performances)
  const pack = performances.find((p) => p.packId === chosen)
  const takes = useMemo(() => pack?.takes ?? [], [pack])

  useEffect(() => {
    const first = firstCut(takes)
    setSegs(first)
    setPlayhead(first[0]?.in ?? 0)
  }, [pack?.packId, takes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const errors = validateCut(segs, takes)
  const canExport = !!pack && !cut.running && errors.length === 0 && cut.data?.ffmpeg !== false && segs.length > 0
  return {
    performances, pack, takes, segs, setSegs, playhead, setPlayhead, setPackId, errors, canExport, size: outputSize(segs, takes),
    start: () => { if (pack) void cut.exportCut(pack.packId, segs) },
    reset: () => { const f = firstCut(takes); setSegs(f); setPlayhead(f[0]?.in ?? 0) },
  }
}

export type ExportCut = ReturnType<typeof useExportCut>
