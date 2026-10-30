// Which world a location belongs to. A Place "closer plate" location is a re-crop of a real world: its meta.json says
// `registered.source: "place:<sid>"` and `registered.from: <the world's location id>`. Anything else is its own world.
type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>

/** Pure: the source world a location's meta points at, or null when it is not a Place plate. */
export function plateSourceOf(meta: unknown): string | null {
  const r = (meta as { registered?: { source?: unknown; from?: unknown } } | null)?.registered
  return typeof r?.source === 'string' && r.source.startsWith('place:') && typeof r.from === 'string' && r.from ? r.from : null
}

/** The world id for `locationId`: its Place source when it is a plate (followed up to a few hops), else itself. */
export async function resolveWorldId(locationId: string, fetcher: Fetcher = (u) => fetch(u, { cache: 'no-cache' })): Promise<string> {
  let id = locationId
  for (let hop = 0; hop < 4; hop++) {
    try {
      const res = await fetcher(`/lab-assets/locations/${id}/meta.json`)
      const from = res.ok ? plateSourceOf(await res.json()) : null
      if (!from || from === id) break
      id = from
    } catch { break }
  }
  return id
}
