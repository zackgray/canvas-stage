# Contributing

Canvas Stage is in beta. It was built in ten days for Comfy's "Open Source Higgsfield" contest, and we intend to keep
developing it. Issues and pull requests are welcome.

## Good places to start

- **Prompt controls.** Make every word sent to the models visible and editable in one place, with the app's own additions
  shown as lines you can switch off.
- **A lighter Stage.** Fewer background requests, and a 3D view that stops redrawing when nothing moves.
- **Shot consistency.** One plain "match the look of" choice instead of several overlapping controls.
- **Moving props.** Let a moving piece arrive by the end of the shot instead of travelling at a fixed speed.

## Before you open a pull request

- Run the free checks from `app/`: `npx tsc -b` and `npx vitest run`. Neither loads the Comfy key or bills anything.
- Never run, script or test a paid action without the account owner's go; every paid button shows its price first.
- Never commit `app/.env` or a Comfy key.
- Keep source files small and focused (around 300 lines at most), and match the plain wording of the app's existing text.

By contributing you agree that your contribution is licensed under the project's licence (see [LICENSE](LICENSE)).
