// The controls-overlay audit (2026-10-28): this is the one place the shortcuts are documented, so it fails
// when a real binding is missing from the mapping table. Audited against the real code:
//   input/keyboardMouse.ts  (ACTION_KEYS, the escape release, the axes and Digit1-5 rigs in poll)
//   input/gamepadSource.ts  (BUTTON_ACTIONS, the sticks, triggers, bumpers, d-pad, L3)
//   input/dualsenseSource.ts (the same edges over WebHID, plus the gyro and the touchpad swipe)
//   studio/stage/useStageTool.ts (KeyG / KeyR / KeyS, the piece tool)
// Every entry below names the pad control AND the keyboard equivalent, as the table must.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RIG_IDS } from '../input/types'
import { MappingOverlay } from '../ui/MappingOverlay'

const html = renderToStaticMarkup(<MappingOverlay />)

// [DualSense / standard pad, keyboard, what it does] — one entry per real binding.
const AUDIT: [string, string, string][] = [
  ['Left stick', 'W A S D', 'Move / dolly / boom; framing offset when following'],
  ['Right stick / gyro', 'Mouse (click a pane to lock the aim) / arrows', 'Aim'],
  ['D-pad up/down', 'Q / E', 'Down / up'],
  ['L2 / R2', 'Z / X, wheel', 'Zoom out / in (12-85 mm)'],
  ['Square', 'R', 'Start / stop recording'],
  ['Cross', 'T', 'Take still'],
  ['Triangle', 'Space', 'Play / pause timeline'],
  ['Touchpad swipe', ', / .', 'Scrub timeline'],
  ['Create', 'Esc', 'Release the hold: stop the move, fly free from here'],
  ['-', 'Home', 'Rewind timeline'],
  ['Options', 'O', 'Smoothing on / off'],
  ['Circle', 'V', 'Follow: pan &lt;-&gt; chase'],
  ['R3', 'C', 'Recentre gyro / orbit pivot on what the centre is on'],
  ['D-pad left/right', '1-5', 'Change rig'],
  ['L3 (held)', 'Shift (held)', 'Fine control'],
  ['-', 'G / R / S', 'Piece tool: grab and move / rotate / scale the picked piece'],
  // the camera's start, the take replay and the aim lock (camera-start-point, camera-take-playback, fly-with-aim-lock):
  // W1-F1 bound them on 2026-10-28 after auditing every existing binding — the pad kept only PS (16) and the microphone
  // mute (WebHID only), every other button being taken; Set start here, Stop take and the aim clear are keyboard-only
  ['PS button', 'P', 'Play take (press again to stop it)'],
  ['Microphone mute', '0', 'Back to start'],
  ['-', '9', 'Set start here (keep the camera&#x27;s pose as the scene&#x27;s start)'],
  ['-', ';', 'Stop take'],
  ['-', 'U', 'Aim lock off (clear the aim target)'],
]

describe('the mapping table is the one place the bindings are documented', () => {
  it('has a row for every real pad and keyboard binding', () => {
    for (const [pad, key, what] of AUDIT) {
      expect(html).toContain(`<td>${pad}</td><td><kbd>${key}</kbd></td><td>${what}</td>`)
    }
  })

  it('shows both the pad and the keyboard column headers', () => {
    expect(html).toContain('<th>DualSense</th>')
    expect(html).toContain('<th>Keyboard</th>')
  })

  it('the rig row covers as many keys as there are rigs (Digit1-N in keyboardMouse)', () => {
    expect(RIG_IDS.length).toBeGreaterThan(1)
    expect(html).toContain(`<kbd>1-${RIG_IDS.length}</kbd>`)
  })
})
