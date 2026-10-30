// What a generated set piece (KitItem.glb, recipe wave) is, read from its plain noun: its real size, whether it is walked on, how
// coarse its massing clay is, and its flat clay tone. TRELLIS.2 meshes come out unit-sized (E136), so the size is what turns one
// into metres; the planner never sizes them. Shared by the server (placement, massing) and the browser (the clay tone). Pure.

export interface PieceKind {
  /** the piece's largest side in metres (E137 placed a locomotive at 8.5, a lamp post at 3.8, a trunk at 0.9) */
  size: number
  /** walk-on pieces: the fraction of `size` the mesh is sunk so its deck meets the ground (E137: an 8.1 m platform at -0.66 m) */
  sinkFrac?: number
  /** massing voxel pitch in metres (E139: 0.12 for big forms, 0.04 for slim ones so they survive) */
  pitch: number
  /** massing dilation in voxels: keeps thin plates and posts through the blur (E139 canopy, lamp post) */
  dilate: number
  /** flat clay tone (E139: vehicle 0.72, set 0.42, small prop 0.55, lamps 0.34) */
  tone: number
}

const K = (size: number, pitch: number, tone: number, o: Partial<PieceKind> = {}): PieceKind => ({ size, pitch, tone, dilate: 0, ...o })

/** first match wins, so the more specific families come first ("a platform lamp" is a lamp, "a luggage cart" a cart) */
const KINDS: [RegExp, PieceKind][] = [
  [/\b(locomotives?|engines?|trains?|trams?)\b/, K(10, 0.12, 0.72)],
  [/\b(lamps?|lampposts?|lanterns?|streetlights?|posts?|poles?|signposts?|signs?)\b/, K(3.8, 0.04, 0.34, { dilate: 1 })],
  [/\b(platforms?|decks?|stages?|piers?|jett(y|ies)|docks?|boardwalks?|bridges?)\b/, K(8, 0.12, 0.42, { dilate: 1, sinkFrac: 0.08 })],
  [/\b(carriages?|coach(es)?|wagons?|railcars?|trucks?|lorr(y|ies)|vans?|cars?|tractors?|buses|bus|boats?|ships?|barges?)\b/, K(6, 0.12, 0.72)],
  [/\b(canop(y|ies)|shelters?|pavilions?|gazebos?|kiosks?|booths?|sheds?|huts?|cabins?|tents?)\b/, K(5, 0.12, 0.42, { dilate: 1 })],
  [/\b(trees?)\b/, K(7, 0.12, 0.3)],
  [/\b(statues?|monuments?|fountains?|wells?)\b/, K(2.5, 0.06, 0.42)],
  [/\b(benches|bench|sofas?|couch(es)?|carts?|barrows?|wheelbarrows?)\b/, K(1.8, 0.04, 0.55)],
  [/\b(tables?|desks?|counters?)\b/, K(1.6, 0.04, 0.55)],
  [/\b(chairs?|stools?)\b/, K(0.9, 0.04, 0.55)],
  [/\b(trunks?|chests?|suitcases?|crates?|box(es)?|barrels?|sacks?|baskets?|luggage)\b/, K(0.9, 0.04, 0.55)],
]
/** a noun the table does not know: a 2 m prop (the owner scales it in the top view) */
export const DEFAULT_PIECE_KIND: PieceKind = K(2, 0.06, 0.5)

export function pieceKindOf(noun: string): PieceKind {
  const n = noun.toLowerCase()
  return KINDS.find(([re]) => re.test(n))?.[1] ?? DEFAULT_PIECE_KIND
}

/** a generated piece's `kind`: a plain noun the prompts can say (not a KIT key) */
export const PIECE_NOUN_RE = /^[a-z][a-z0-9' -]{0,39}$/

/** a board tile's name as a piece noun ("Steam Locomotive!" -> "steam locomotive"); null when nothing usable is left */
export function pieceNounOf(name: string): string | null {
  const n = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^[^a-z]+/, '').slice(0, 40).trim()
  return PIECE_NOUN_RE.test(n) ? n : null
}
