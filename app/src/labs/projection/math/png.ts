// Minimal PNG codec for depth work: canvas only gives 8-bit, but depth maps are often 16-bit.
// Supports non-interlaced greyscale / grey+alpha / RGB / RGBA at 8 or 16 bits. Uses the platform
// (Compression|Decompression)Stream with the zlib ('deflate') format, so it runs in browsers and Node 18+.

export interface PngImage {
  width: number
  height: number
  channels: 1 | 2 | 3 | 4
  bitDepth: 8 | 16
  /** samples, row-major, top row first */
  data: Uint8Array | Uint16Array
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const CHANNELS: Record<number, 1 | 2 | 3 | 4> = { 0: 1, 4: 2, 2: 3, 6: 4 }
const COLOR_TYPE: Record<number, number> = { 1: 0, 2: 4, 3: 2, 4: 6 }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export async function decodePng(input: Uint8Array): Promise<PngImage> {
  for (let i = 0; i < 8; i++) if (input[i] !== SIGNATURE[i]) throw new Error('not a PNG')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  let pos = 8
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0
  const idat: Uint8Array[] = []
  while (pos < input.length) {
    const len = view.getUint32(pos)
    const type = String.fromCharCode(...input.subarray(pos + 4, pos + 8))
    const body = input.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8)
      height = view.getUint32(pos + 12)
      bitDepth = body[8]
      colorType = body[9]
      interlace = body[12]
    } else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const channels = CHANNELS[colorType]
  if (!channels || (bitDepth !== 8 && bitDepth !== 16) || interlace) {
    throw new Error(`unsupported PNG (colour type ${colorType}, ${bitDepth}-bit, interlace ${interlace})`)
  }
  const raw = await pipe(concat(idat), new DecompressionStream('deflate'))
  const bpp = (channels * bitDepth) / 8
  const stride = width * bpp
  const px = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0
      const b = y > 0 ? px[dst - stride + x] : 0
      const c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0
      const r = raw[src + x]
      const v = filter === 0 ? r : filter === 1 ? r + a : filter === 2 ? r + b
        : filter === 3 ? r + ((a + b) >> 1) : r + paeth(a, b, c)
      px[dst + x] = v & 0xff
    }
  }
  if (bitDepth === 8) return { width, height, channels, bitDepth, data: px }
  const data = new Uint16Array(width * height * channels)
  for (let i = 0; i < data.length; i++) data[i] = (px[i * 2] << 8) | px[i * 2 + 1]
  return { width, height, channels, bitDepth, data }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

/** Encode samples (top row first) as PNG. Filter 'up' on every row: cheap and compresses depth well. */
export async function encodePng(img: PngImage): Promise<Uint8Array> {
  const { width, height, channels, bitDepth, data } = img
  const bpp = (channels * bitDepth) / 8
  const stride = width * bpp
  const bytes = new Uint8Array(stride * height)
  if (bitDepth === 16) {
    for (let i = 0; i < data.length; i++) { bytes[i * 2] = data[i] >> 8; bytes[i * 2 + 1] = data[i] & 0xff }
  } else bytes.set(data)
  const filtered = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1)
    filtered[o] = 2
    for (let x = 0; x < stride; x++) {
      const up = y > 0 ? bytes[(y - 1) * stride + x] : 0
      filtered[o + 1 + x] = (bytes[y * stride + x] - up) & 0xff
    }
  }
  const ihdr = new Uint8Array(13)
  const hv = new DataView(ihdr.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  ihdr[8] = bitDepth
  ihdr[9] = COLOR_TYPE[channels]
  const idat = await pipe(filtered, new CompressionStream('deflate'))
  return concat([new Uint8Array(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())])
}
