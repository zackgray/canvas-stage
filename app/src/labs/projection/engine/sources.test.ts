import { LinearFilter, LinearMipmapLinearFilter, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { STILL_ANISOTROPY, sharpSampling } from './sources'

describe('still / plate sampling', () => {
  it('is bilinear, never mipmapped, anisotropic (a long lens must not blur the plate through a lower mip)', () => {
    const t = new Texture() // three's defaults are mipmapped trilinear
    expect(t.minFilter).toBe(LinearMipmapLinearFilter)
    sharpSampling(t)
    expect(t.minFilter).toBe(LinearFilter)
    expect(t.magFilter).toBe(LinearFilter)
    expect(t.generateMipmaps).toBe(false)
    expect(t.anisotropy).toBe(STILL_ANISOTROPY)
  })
})
