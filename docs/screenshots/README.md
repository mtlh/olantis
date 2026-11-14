# Screenshots

This folder is for **curated, long-lived reference images only** — design
references, release notes, or documentation images that a page in this repo
links to.

It is not storage for pull-request proof.

## Pull-request proof never goes here

Before/after captures exist to prove a UI change renders. They belong in the PR
body, hosted by GitHub, not in the repository:

```powershell
gh pr create --body-file .screenshots/body.md `
  --attach ".screenshots/before.png#Before" `
  --attach ".screenshots/after.png#After"
```

`gh` (2.99.0+) uploads the files to GitHub's CDN and rewrites the local paths in
the body. Without it, drag the PNGs into the PR body in the browser — GitHub
uploads them the same way. Neither route writes to git.

## Local captures

Capture screenshots into `.screenshots/` at the repo root. It is gitignored and
intended for throwaway proof. Delete the files once the PR merges or closes.

## What belongs here

An image may be committed here only when:

1. a document, README, or release note links to it, and
2. it is still useful after the PR that introduced it is forgotten.

Anything else — a `-before`/`-after` pair, a work-in-progress capture, a one-off
verification shot — is not committed.

See `.agents/skills/ui-proof/SKILL.md` for the full workflow.
