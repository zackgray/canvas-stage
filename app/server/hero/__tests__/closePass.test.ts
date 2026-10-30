// Suggest a mid keyframe when a figure passes close to camera: a runner who enters mid-take and ends up large gets the grid frame
// where he is biggest; a figure who is small, or already large in the opening still, gets nothing.
import { describe, expect, it } from 'vitest'
import { isMidFrame } from '../../../src/shared/keyframeContract.ts'
import type { CameraSample } from '../../../src/labs/controller/take/types.ts'
import { closePassSuggestion, constantSpeedTrack, heightAt, figurePasses } from '../closePass.ts'

const FPS = 24, FRAMES = 96
/** a static camera at the origin, 1.6 m up, looking down -z (identity quaternion), 35 mm */
const cam = (focal = 35): CameraSample[] => [0, FRAMES / FPS].map((t) => ({ t, position: [0, 1.6, 0], quaternion: [0, 0, 0, 1], focal, focus: 5 }))

/** runs toward the camera along x = 0.3 from 40 m to 2.5 m away, starting at 1 s, 10 m/s: arrives at ~4.75 s (frame 114, past the take) */
const runner = (delay = 1, speed = 10) => constantSpeedTrack('extra:0:1', 'the runner', [[0.3, -40], [0.3, -2.5]], speed, delay)

describe('close pass keyframe suggestion', () => {
  it('a runner who enters mid-take and closes on the camera: the suggestion is on the 8-grid, valid for a mid keyframe, and past a third of the frame', () => {
    const s = closePassSuggestion([runner(1, 14)], cam(), FRAMES, FPS)
    expect(s).not.toBeNull()
    expect(isMidFrame(s!.frame, FRAMES)).toBe(true)
    expect(s!.frame % 8).toBe(0)
    expect(s!.height).toBeGreaterThanOrEqual(1 / 3)
    expect(s!.why).toMatch(/the runner/)
  })
  it('the frame is where he is largest among the grid frames around his peak', () => {
    const f = runner(1, 14), [p] = figurePasses([f], cam(), FRAMES, FPS)
    const s = closePassSuggestion([f], cam(), FRAMES, FPS)!
    expect(Math.abs(s.frame - p.peakFrame)).toBeLessThanOrEqual(8)
    expect(heightAt(f, cam(), s.frame, FPS)).toBe(s.height)
  })
  it('nothing for a figure who stays far away, one who is behind the camera, or one already large at frame 0', () => {
    expect(closePassSuggestion([constantSpeedTrack('a', 'far', [[0, -60], [0, -50]], 2)], cam(), FRAMES, FPS)).toBeNull()
    expect(closePassSuggestion([constantSpeedTrack('b', 'behind', [[0, 5], [0, 10]], 2)], cam(), FRAMES, FPS)).toBeNull()
    expect(closePassSuggestion([constantSpeedTrack('c', 'near', [[0.3, -3], [0.3, -2.6]], 0.5)], cam(), FRAMES, FPS)).toBeNull()
  })
  it('a figure not yet on stage is not seen, and the biggest of several wins', () => {
    expect(heightAt(runner(10), cam(), 0, FPS)).toBe(0)
    const s = closePassSuggestion([runner(1, 14), constantSpeedTrack('x', 'closer', [[-0.2, -30], [-0.2, -1.8]], 14, 1)], cam(), FRAMES, FPS)
    expect(s?.id).toBe('x')
  })
})
