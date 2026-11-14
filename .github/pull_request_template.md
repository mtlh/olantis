## What changed

<!-- One or two sentences: what changed and why. -->

## UI proof (required for anything visible)

Screenshots are the proof a UI change renders correctly. A reviewer should be able to judge the change without checking out the branch.

- **Before / after** when modifying an existing screen — two images, cropped to the changed area.
- **After only** when adding something new.
- Capture at a real viewport: **1440×900** desktop, plus **390×844** when the change affects small screens.
- Load the demo workspace (`/api/demo`, or the demo button on `/`) so shots show populated data, not empty states.
- **Attach the PNGs to this section — never commit them.** Capture to `.screenshots/` (gitignored) and attach with `gh pr create|edit --attach .screenshots/before.png`, or drag them into this body in the browser; GitHub hosts them as `user-attachments`, so the repo stays clean.
- `docs/screenshots/` is only for curated references that a document links to — not PR proof.

| Before | After |
| --- | --- |
| _drag image here_ | _drag image here_ |

Not a visual change? Delete this section and say so in **What changed**.

## Scope

- [ ] Web UI (`src/app`, `src/components`)
- [ ] API / data (`src/app/api`, `src/lib`)
- [ ] Desktop shell (`electron/`, packaging)
- [ ] Docs / tooling only

## Checks

- [ ] `npm run check` passes (lint + typecheck + tests)
- [ ] `npm run build` passes for route or rendering changes
- [ ] Clicked through the changed flow manually
