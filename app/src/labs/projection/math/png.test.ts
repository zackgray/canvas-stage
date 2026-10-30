import { describe, expect, it } from 'vitest'
import { decodePng, encodePng } from './png'

describe('png codec', () => {
  it('round-trips 16-bit greyscale', async () => {
    const data = new Uint16Array(37 * 11)
    for (let i = 0; i < data.length; i++) data[i] = (i * 2971) % 65536
    const png = await encodePng({ width: 37, height: 11, channels: 1, bitDepth: 16, data })
    const back = await decodePng(png)
    expect(back).toMatchObject({ width: 37, height: 11, channels: 1, bitDepth: 16 })
    expect(Array.from(back.data)).toEqual(Array.from(data))
  })
  it('round-trips 8-bit RGBA', async () => {
    const data = new Uint8Array(5 * 4 * 4).map((_, i) => (i * 37) & 0xff)
    const back = await decodePng(await encodePng({ width: 5, height: 4, channels: 4, bitDepth: 8, data }))
    expect(back.channels).toBe(4)
    expect(Array.from(back.data)).toEqual(Array.from(data))
  })
  it('rejects non-PNG input', async () => {
    await expect(decodePng(new Uint8Array(16))).rejects.toThrow('not a PNG')
  })
})
