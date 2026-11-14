---
name: ui-proof
description: >-
  Capture UI screenshots, show them in chat, and attach them to pull requests
  without committing them to the repository. Use when a change is visible,
  when a PR needs before/after proof, when someone asks how screenshots reach a
  PR body or a message, or when cleaning stray captures out of docs/screenshots.
---

# UI proof: screenshots that never enter git

**Outcome:** the reviewer sees the rendered change, the repo stays clean, and no
PNG is ever committed as proof.

## Where captures live

| Purpose | Location | In git? |
| --- | --- | --- |
| PR before/after proof | `.screenshots/` (gitignored) or the OS temp dir | No |
| Showing a capture in chat | same file, embedded by absolute path | No |
| Curated reference (design doc, release notes) | `docs/screenshots/<topic>/` | Yes, only when a doc links it |

- Capture into `.screenshots/` at the repo root. It is in `.gitignore` and is the
  intended scratch space for this repo.
- Never `git add` a before/after image. It does not belong in the diff, the
  branch history, or `docs/screenshots/`.
- `docs/screenshots/` holds only long-lived references that a document links to.
  If nothing links the image, it does not belong there.

## Show a capture in chat

Embed the absolute path — T3 Code renders local files by path:

```markdown
![After: draggable sidebar](C:/Users/me/.t3/worktrees/olantis/.screenshots/after.png)
```

Or open it in the Review pane with `browser.preview({ path: ".screenshots/after.png" })`.
Use absolute paths, never `file://` URLs, and never a repo-relative path that
implies the file is committed.

## Attach proof to a PR

### Preferred: `gh --attach` (gh 2.99.0+)

`--attach` uploads the file to GitHub's CDN and rewrites matching local paths in
the body, so a Markdown table works unchanged.

Write the body with ordinary relative paths:

```markdown
## UI proof

| Before | After |
| --- | --- |
| ![Before: sidebar order](.screenshots/before.png) | ![After: sidebar order](.screenshots/after.png) |
```

Create the PR and attach both files:

```powershell
gh pr create --base master --title "feat: draggable sidebar" `
  --body-file .screenshots/body.md `
  --attach ".screenshots/before.png#Before: sidebar order" `
  --attach ".screenshots/after.png#After: sidebar order"
```

Add proof to an existing PR the same way:

```powershell
gh pr edit 123 --body-file .screenshots/body.md `
  --attach ".screenshots/before.png#Before: sidebar order" `
  --attach ".screenshots/after.png#After: sidebar order"
```

Notes:
- Works on `gh pr create|edit|comment` and `gh issue create|edit|comment`.
- Requires push access to the repo; not supported on GitHub Enterprise Server.
- GitHub CLI attachments are images/video only (PNG, JPEG, GIF, WebP, SVG,
  MP4, MOV, WebM), 50 files per command.
- Check `gh --version`. This machine may still have 2.98.0; upgrade to
  <https://github.com/cli/cli/releases> (2.99.0 or newer) before relying on it.

### Fallback: drag or upload in the browser

GitHub has no public REST endpoint for image attachments. Without a new enough
`gh`, attach the human way:

1. Open the PR body or comment box in the browser.
2. Drag the PNG in, or paste it, so GitHub uploads it to
   `https://github.com/user-attachments/assets/...`.
3. Submit/save. The image is now hosted, not committed.

The uploaded URL stays valid even if the comment is never posted, so an agent
driving a browser can upload, read the URL out of the textarea, and place it in
the PR body via `gh pr edit`.

### Fallback: `gh-image` extension

For older `gh`, read-only repos, or non-media files:

```powershell
gh extension install drogors0/gh-image
gh image .screenshots/after.png   # prints the hosted markdown
```

## Capture settings

- Desktop 1440×900; add 390×844 when the change affects small screens.
- Load the demo workspace (`/api/demo`, or the demo button on `/`) so shots show
  populated data.
- Crop to the changed area; a full-window shot with a tiny diff is not proof.

## Cleanup

- After the PR merges or closes, delete the captures in `.screenshots/` — they
  are local scratch files, not an archive.
- If a capture is genuinely worth keeping, move it into `docs/screenshots/`,
  link it from a document, and commit it in a docs change. Nothing else is
  allowed in that folder.
