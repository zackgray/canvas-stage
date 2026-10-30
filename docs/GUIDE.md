# Canvas Stage: user guide

The tab bar is **Home, Stage, Render, Export**. Prices below are what the app showed during testing; the price on the
button on your screen is the one that counts.

## Free tour

Run `node scripts/install-sample.mjs` once, open Home and click the sample scene (a rain-drenched racetrack at night). Look
around, switch views, fly the camera and press **Controls**. Nothing paid fires, and no key or GPU is needed.

## Your first shot, step by step

1. **Start a scene.** On Home, press **Start a new scene**. On the Stage, write the scene in your own words in the
   **Prompt** box under the viewport. Name the people and props you want with an `@tag` (for example `@driver`, `@car`).
2. **Make the props.** Right-click empty ground and choose **A prop** or **A set piece**. Describe the object itself
   ("a covered race track grandstand with rows of seats under a long roof"), not the photo of it: these words are dropped
   into your prompts wherever you write its `@tag`. Generate or upload a picture, pick one, and it builds in 3D once
   (priced). Drag it into place; right-click it to move, duplicate or remove it.
3. **Set up the subject.** Open **The subject**: pick who plays them, make their look (**Generate looks**, then **Use this
   look**, free), then place their mark and choose **Walk to a spot** or **Stay put**. Their look is the reference the
   draw and render use; on the stage they stay a plain mannequin.
4. **Frame the camera.** Switch to the **Camera** view, pick a shot length (2, 4, 6 or 8 s), then either pick a preset move
   (push in, pull out, pan, orbit, crane up, static hold) or press **Fly it yourself** and fly with the keyboard or a
   controller (table below).
5. **Record and lock.** Press **Record** (free), check it with **Play take**, then **Lock take**. A locked take keeps its
   own camera, walk and set for good.
6. **Draw the first frame.** Press **Draw the first frame** (about 21 cr). Before you press, open **What will be sent** to
   read the exact words each model gets. Lines marked **Added by the app** can be switched off for this take, and every
   text there can be edited. When the frame lands, click it in the version strip to use it. If it is close but not right,
   **Edit this frame** (about 8 cr) makes one change at a time ("remove the helmet", "make the visor orange").
7. **Render.** Press **Render clip** (about 30 to 40 cr for a 6 s take). The finished clip lands on the take card and on
   the Render tab.
8. **The next angle.** Press **New take**. It starts an open take from exactly what is on screen (props, car position,
   walk) and records nothing yet. Move things for the new shot, then Record and Lock. Your earlier takes never change:
   click one in the take list to see it as it was (read-only); click the open take or **Edit the scene's set** to get
   back to your new setup.
9. **Export.** Each finished take has **Download the shot**. Export can also join several renders into one video
   (needs ffmpeg).

## Tips for good results

- **The first frame is drawn from the clay's depth.** Anything too small or too far away to show up in depth (a distant
  car) is not held in place, and the model may draw its own somewhere else. Keep key objects big enough in frame 0.
- **Words should match the frame.** If your words describe a wheel close-up but the camera frames the whole car side, the
  model invents a second wheel. Frame what you describe.
- **Still words vs render words.** The first frame is a single moment: describe the starting pose ("in profile, looking
  ahead"). Put motion ("he turns his head", "the car shudders") in the render's words.
- **The layout check.** If a drawn frame drifts from the set, the app warns ("does not match the set's frames") with a
  score. You can still render, but a frame that disagrees with the clay often renders badly; redrawing is usually cheaper.
- **Helmets, masks and props on the cast card.** The finishing pass copies the person's look from their card exactly as
  shown there, and never adds a face the card does not show.
- **Moving props** travel at a fixed speed (Slow, Normal, Fast); a long path makes the take longer. Shorten the path or
  pick Fast to fit your shot length.
- **Hold L3** (press the left stick in) for slow, fine camera moves, including height on the D-pad.

## How money works

- A button that spends credits shows its price beside its name. Free actions say **free**; a button with no price costs nothing.
- A **day budget** (`CANVAS_DAY_BUDGET`, set by whoever runs the app) caps spending per day. At the cap, or if it was never
  set, paid buttons are refused with a message and nothing is spent.
- A running job shows a clock. A draw takes a minute or two, a render a few minutes.
- Paid jobs keep running if you reload or leave the screen; the result lands when you come back, and pressing the same thing
  again never pays twice. A job that fell through is offered as **Recover**.

## The camera

| Do this | Keyboard | DualSense |
|---|---|---|
| Move | W A S D | left stick |
| Down / up | Q / E | D-pad down / up |
| Slow, fine moves | - | hold L3 (press the left stick in) |
| Aim | arrows, or click the viewport and use the mouse | right stick |
| Zoom | Z / X or the wheel | L2 / R2 |
| Record | R | Square |
| Play / pause | Space | Triangle |
| Change rig | 1 to 5 | D-pad left / right |
| Release a hold and fly free | Esc | Create |
| Piece tool (grab, rotate, scale) | G, R, S | - |

**Controls** in the app shows the full table. Typing in a text box takes the keys away from the camera, and so does any
open dialog.

## Things that ask before they act

Discarding a take, removing a piece, resetting the set, starting a new take over an unlocked recording, and removing a scene
from the list. The safe answer has focus, so Enter never goes ahead by accident, and Escape backs out.

## Beta notes

Canvas Stage is in beta. Known rough edges: a reload can take a few seconds to settle, the right panel's tab reads "The set"
while the Camera view is active, and scrubbing a take's playhead does not move it yet (use **Play take**). Issues and pull
requests are welcome; see [CONTRIBUTING.md](../CONTRIBUTING.md).
