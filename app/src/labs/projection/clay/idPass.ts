// The ID-colour pass of a kit clay (plan §3.3/3.4): the scene drawn once more, flat. Every mesh whose ancestry carries
// `userData.entity` (stage3d/contract.ts EntityTag) is drawn in its class colour (each prop in its own), everything else black.
// The kit's materials are shared module-level objects, so a mesh's material is swapped for a flat MeshBasicMaterial and put back in a
// `finally`, per mesh (the same discipline kitCapture.ts uses for the background). Fog and background are cleared for the draw too;
// tone mapping is the caller's (the capture renderer).
import { Color, DoubleSide, FrontSide, MeshBasicMaterial, SRGBColorSpace, type Material, type Mesh, type Scene } from 'three'
import { ENTITY_TAG_RE } from '../../../stage3d/contract'
import { entityOf } from '../../../stage3d/performer'

export type Rgb = [number, number, number]

/** greens for extras, one per variant (variant v -> GREENS[v % length]); the lowest-indexed extra (0) is the second lead, blue */
const GREENS: Rgb[] = [[0, 255, 0], [0, 200, 60], [120, 255, 0], [0, 255, 150], [60, 160, 0], [170, 255, 90]]
export const ID_COLORS = { hero: [255, 0, 0], secondLead: [0, 0, 255], creature: [255, 0, 255], prop: [255, 255, 0], world: [0, 0, 0] } as const satisfies Record<string, Rgb>

/**
 * (recipe wave) one colour per prop, so a later pass can cut a mask per piece (KitItem.pieceTag): warm, cyan and grey tones only,
 * never a figure's red, blue, magenta or greens (server/hero/figures.ts reads figures by exact colour). The first is the old prop yellow.
 */
export const PROP_COLORS: Rgb[] = [
  [255, 255, 0], [255, 160, 0], [0, 255, 255], [255, 255, 255], [255, 200, 120], [160, 255, 255], [255, 110, 40], [200, 200, 0],
  [0, 170, 255], [255, 220, 90], [128, 128, 128], [255, 140, 180], [180, 120, 255], [0, 200, 200], [255, 255, 160], [200, 90, 0],
]
const hashOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
/** a prop tag's own palette slot (stable across exports); withIdMaterials steps past a slot another prop in the scene holds */
const propSlot = (tag: string) => hashOf(tag) % PROP_COLORS.length

/** an entity tag -> its class colour (a prop: its own); null for anything that is not a valid tag (it is drawn as world) */
export function idColorOf(tag: string): Rgb | null {
  if (!ENTITY_TAG_RE.test(tag)) return null
  if (tag === 'hero') return [...ID_COLORS.hero]
  if (tag.startsWith('creature:')) return [...ID_COLORS.creature]
  if (tag.startsWith('prop:')) return [...PROP_COLORS[propSlot(tag)]]
  const [, index, variant] = tag.split(':')
  return Number(index) === 0 ? [...ID_COLORS.secondLead] : [...GREENS[Number(variant) % GREENS.length]]
}

/** the nearest tagged ancestor names a mesh (E1's resolver: an extra or creature hangs under the hero's object but is its own entity) */
export { entityOf }

/**
 * Run `draw` with every mesh of `scene` swapped to its flat colour, then restore each mesh's own material (also when `draw` throws).
 * Returns the colour table of the tags that were drawn (empty = no entities in the scene).
 */
export function withIdMaterials(scene: Scene, draw: () => void): Record<string, Rgb> {
  const cache = new Map<string, MeshBasicMaterial>()
  const flat = (c: Rgb, side: Material['side']) => {
    const k = `${c.join(',')}/${side}`
    let m = cache.get(k)
    if (!m) { m = new MeshBasicMaterial({ color: new Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, SRGBColorSpace), fog: false, toneMapped: false, side }); cache.set(k, m) }
    return m
  }
  const swapped: { mesh: Mesh; material: Mesh['material'] }[] = []
  const table: Record<string, Rgb> = {}
  // two props whose tags hash to one slot: the later one (in scene order, the same every frame) steps to the next free slot
  const propOf = new Map<string, Rgb>(), slots = new Set<number>()
  const colorOf = (tag: string): Rgb | null => {
    if (!tag.startsWith('prop:') || !ENTITY_TAG_RE.test(tag)) return idColorOf(tag)
    let c = propOf.get(tag)
    if (!c) {
      let s = propSlot(tag)
      for (let k = 0; k < PROP_COLORS.length && slots.has(s); k++) s = (s + 1) % PROP_COLORS.length
      slots.add(s); c = PROP_COLORS[s]; propOf.set(tag, c)
    }
    return [...c]
  }
  const { fog, background } = scene
  try {
    scene.fog = null
    scene.background = null
    scene.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const tag = entityOf(o)
      const tagged = tag ? colorOf(tag) : null
      if (tag && tagged) table[tag] = [...tagged]
      const own = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      swapped.push({ mesh, material: mesh.material })
      mesh.material = flat(tagged ?? [...ID_COLORS.world], own?.side === DoubleSide ? DoubleSide : FrontSide)
    })
    draw()
  } finally {
    for (const s of swapped) s.mesh.material = s.material
    scene.fog = fog
    scene.background = background
    for (const m of cache.values()) m.dispose()
  }
  return table
}
