// Controller mapping with keyboard equivalents. Audited 2026-10-28 against the real bindings in
// input/keyboardMouse.ts, input/gamepadSource.ts and input/dualsenseSource.ts: every pad button, key and
// axis here must match those. The controls-overlay test fails when a real binding is missing from this list.
const ROWS: [string, string, string][] = [
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
  ['Circle', 'V', 'Follow: pan <-> chase'],
  ['R3', 'C', 'Recentre gyro / orbit pivot on what the centre is on'],
  ['D-pad left/right', '1-5', 'Change rig'],
  ['L3 (held)', 'Shift (held)', 'Fine control'],
  ['-', 'G / R / S', 'Piece tool: grab and move / rotate / scale the picked piece'],
  // the camera's start, the take replay and the aim lock (camera-start-point, camera-take-playback, fly-with-aim-lock). The
  // full table was audited for collisions 2026-10-28: every other key and button is taken, so the pad gets the two buttons
  // nothing else could use — PS (16) and the microphone-mute (WebHID only); the rest are keyboard-only. P and PS play the
  // take and, pressed while it plays, stop it; ; stops it from the keyboard either way.
  ['PS button', 'P', 'Play take (press again to stop it)'],
  ['Microphone mute', '0', 'Back to start'],
  ['-', '9', 'Set start here (keep the camera\'s pose as the scene\'s start)'],
  ['-', ';', 'Stop take'],
  ['-', 'U', 'Aim lock off (clear the aim target)'],
]

export function MappingOverlay() {
  return (
    <table className="cl-map">
      <thead>
        <tr>
          <th>DualSense</th>
          <th>Keyboard</th>
          <th>Does</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(([pad, key, what]) => (
          <tr key={what}>
            <td>{pad}</td>
            <td>
              <kbd>{key}</kbd>
            </td>
            <td>{what}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
