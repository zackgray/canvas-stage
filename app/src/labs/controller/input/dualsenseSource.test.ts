// autoConnect hands an already-permitted, already-present DualSense to the library: its WebHID provider only
// attaches on a picker choice or a plug-in event, so without this the pad stayed "waiting" after a page switch.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ devices: [] as { vendorId: number; productId: number }[] }))

vi.mock('dualsense-ts', () => {
  class WebHIDProvider {
    static enumerate = vi.fn(async () => h.devices)
    connected = false
    attach = vi.fn()
  }
  class Dualsense {
    hid = { provider: new WebHIDProvider() }
    connection = { state: false, on: vi.fn() }
    orientation = { yaw: 0, pitch: 0, roll: 0 }
    dispose = vi.fn()
  }
  return { Dualsense, WebHIDProvider }
})

const { DualsenseSource } = await import('./dualsenseSource')

beforeEach(() => {
  vi.stubGlobal('navigator', { hid: {} })
})
afterEach(() => {
  vi.unstubAllGlobals()
  h.devices = []
})

const attachOf = (src: InstanceType<typeof DualsenseSource>) =>
  (src as unknown as { ds: { hid: { provider: { attach: ReturnType<typeof vi.fn> } } } }).ds.hid.provider.attach

describe('DualsenseSource.autoConnect', () => {
  it('attaches a permitted Sony pad that is already present', async () => {
    const pad = { vendorId: 0x054c, productId: 0x0ce6 }
    h.devices = [pad]
    const src = new DualsenseSource()
    await src.autoConnect()
    expect(attachOf(src)).toHaveBeenCalledWith(pad)
    expect(src.status).toBe('waiting') // 'connected' arrives with the library's connection event
  })

  it('attaches once even when called twice before the device opens (StrictMode double mount)', async () => {
    h.devices = [{ vendorId: 0x054c, productId: 0x0ce6 }]
    const src = new DualsenseSource()
    await Promise.all([src.autoConnect(), src.autoConnect()])
    expect(attachOf(src)).toHaveBeenCalledTimes(1)
  })

  it('re-attaches after dispose (page switch detaches and re-attaches the engine)', async () => {
    h.devices = [{ vendorId: 0x054c, productId: 0x0ce6 }]
    const src = new DualsenseSource()
    await src.autoConnect()
    src.dispose()
    await src.autoConnect()
    expect(attachOf(src)).toHaveBeenCalledTimes(1) // the new Dualsense's provider
  })

  it('does nothing without a permitted pad', async () => {
    const src = new DualsenseSource()
    await src.autoConnect()
    expect((src as unknown as { ds: unknown }).ds).toBeNull()
    expect(src.status).toBe('idle')
  })
})
