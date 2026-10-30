import { PNG } from 'pngjs'

/** A w x h RGB PNG whose pixel colours come from `px`. */
export function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const p = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = px(x, y), o = (y * w + x) * 4
    p.data[o] = r; p.data[o + 1] = g; p.data[o + 2] = b; p.data[o + 3] = 255
  }
  return PNG.sync.write(p)
}
