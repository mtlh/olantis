<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Olantis — Agent Rules (project-specific)

## Project
- Name: **olantis** (Personal Finance — Portfolio Dashboard). Tagline: "Your portfolios, beautifully simple."
- Stack: Next.js 16.3.6 (Turbopack) + React 19.3.0, Tailwind 4 + tw-animate-css, shadcn + Base UI, Recharts, Drizzle ORM + Neon Postgres (serverless), WorkOS AuthKit Next.js 4.3.2, Yahoo Finance, Vercel Cron (06:00 UTC daily refresh).
- Design: black glass `glass` / `glass-card` (backdrop-blur), grey cards, colour only for charts. See `src/app/globals.css`. Logo in `src/components/Logo.tsx`.
- Routes: `/` → landing (public, redirects to `/dashboard` if signed in), `/dashboard` → app (auth required, demo bypass), `/login` → `GET` WorkOS `getSignInUrl()` redirect, `/signin` → `redirect("/login")`, `/callback` → `handleAuth`, `/logout` → `signOut({returnTo:"/"})`, `/api/demo` → set `olantis_demo=1` + `redirect("/dashboard")`, `/api/demo?clear=1` → clear demo + `redirect("/")`.
- DB schema: `src/lib/db/schema.ts` — accounts/portfolios/holdings/snapshots, isolated by `userId`. Seeding in `src/app/api/demo/route.ts`.

## Lint Contract (agent guardrails)
- `npm run lint` = `eslint . --max-warnings=0` — **warnings fail**. `npm run lint:fix` autofixes. `npm run check` = lint + typecheck + test; run it before saying you are done.
- **Never add `eslint-disable`, `@ts-ignore`, `@ts-nocheck` or `any`** — fix the cause. Stale disables fail too (`reportUnusedDisableDirectives`), and `@ts-expect-error` needs a >=10 character description.
- **No new `useEffect`/`useLayoutEffect`.** Derive values during render, put side effects in event handlers, use `useSyncExternalStore` for external state, or model two synced values as one. Files in `LEGACY_EFFECT_FILES` (`eslint.config.mjs`) may keep their existing effects — do not add more, and remove the file from the list when you migrate it.
- **Client boundary**: `src/components/**` and `src/lib/store.ts` / `src/lib/use-chart-animation.ts` must not import `@/lib/db`, `drizzle-orm`, `@neondatabase/serverless` or `yahoo-finance2`. Call `/api/*` or read `useWorkspaceBootstrap()`.
- **Imports**: use the `@/` alias, never `../`. **Logging**: no `console.log` (only `warn`/`error`). **Storage**: no bare `localStorage` — use `window.localStorage` inside a client-only hook so SSR stays deterministic.
- **Async**: every promise is awaited or explicitly `void`ed; do not pass an `async` function where a `void` handler is expected unless the rejection is handled.

## Git Control (this repo only)
- **Remote**: `origin` = `https://github.com/mtlh/olantis.git` (private). **Branch**: `master` (not `main`) — `origin/HEAD -> origin/master`. Always `master`.
- **GitHub CLI on Windows**: `gh` is NOT in PATH for PowerShell. Use full path: `& "C:\Program Files\GitHub CLI\gh.exe" ...` (version 2.98.0 installed; `--attach` needs 2.99.0+ — upgrade from <https://github.com/cli/cli/releases> before attaching screenshots from the CLI). Auth: `mtlh` logged in via keyring, scopes `repo workflow gist read:org`.
- **Create/check repo**: `& "C:\Program Files\GitHub CLI\gh.exe" repo view mtlh/olantis --json name,visibility,url` → `PRIVATE`. If creating fresh: `& "C:\Program Files\GitHub CLI\gh.exe" repo create olantis --private --source=. --remote=origin` — expect "Name already exists" if linked.
- **Workflow**: `git status`; `git diff --stat`; `git add <files>` (e.g. `src/app/page.tsx src/app/dashboard/page.tsx`); `git commit -m "type: message"`; `git push origin master`. Never force push to `master` without explicit ask. Never amend after push. Keep commits concise (e.g. `feat: split routes / and /dashboard, demo -> /dashboard`).
- **Check before push**: `git log --oneline -3` — latest `d52a6d6 feat: split routes / and /dashboard, demo -> /dashboard`.
- **Vercel git link**: already `vercel git connect https://github.com/mtlh/olantis.git` → "mtlh/olantis is already connected". `.vercel/project.json` confirms link.

## Pull Requests (screenshots are the proof)
- Work lands as a PR against `master`; the template is `.github/pull_request_template.md`. Merge once CI (`.github/workflows/ci.yml`) is green — a plain merge commit, then delete the branch.
- **Every PR that changes anything visible must embed screenshots in the body.** Before/after images for a changed screen, after-only for something new, cropped to the changed area. A description alone is not evidence the UI renders.
- Capture at **1440×900** desktop, and add **390×844** when small-screen layout changes. Load the demo workspace (`/api/demo`, or the demo button on `/`) so screenshots show populated data, not an empty dashboard.
- **Screenshots never enter the repo.** Capture to `.screenshots/` (gitignored) or the OS temp dir, then attach to the PR body with GitHub CLI: `gh pr create --body-file body.md --attach ".screenshots/before.png#Before" --attach ".screenshots/after.png#After"` (`gh` 2.99.0+; body paths are rewritten to GitHub-hosted URLs). On older `gh`, drag the PNGs into the PR body in the browser — GitHub uploads them to `user-attachments`, nothing is committed. Show a capture in chat by embedding its absolute path: `![After](C:/path/to/after.png)`.
- `docs/screenshots/` is only for curated references that a document links to (see `docs/screenshots/README.md`). Never commit before/after proof or work-in-progress captures; delete `.screenshots/` after the PR merges. Full workflow: `.agents/skills/ui-proof/SKILL.md`.
- Pure refactor / DB / CI / docs PRs skip screenshots but must say so in **What changed**. Agents: run `npm run check` before pushing; if a UI PR arrives without screenshots, ask for them instead of merging.

## Vercel Deployment (project-specific)
- **Project**: `olantis` in team `mtlhs-projects`. IDs: `projectId=prj_WeClpTjEIndqh9AW8IBT1WsTP2pG`, `orgId=team_rZcougDtgd3bcmkavBTGm01K`. Config: `.vercel/project.json`.
- **URLs**: Production `https://olantis.vercel.app` (aliased), deployments like `https://olantis-*.vercel.app` (e.g. `olantis-kdnbxvsj6...`). CLI: `vercel project ls` lists `olantis` → `olantis.vercel.app` Node 24.x.
- **CLI on Windows**: `vercel` 53.1.0 via npm (`C:\Users\matth\AppData\Roaming\npm\vercel.ps1`). PowerShell wraps `node.exe` — ignore `NativeCommandError` wrapper, read stdout.
- **Deploy**: Preferred is git push (auto-build via GitHub integration). Manual: `vercel --prod --yes` from repo root (uses `.vercel/project.json`). Verify: `vercel ls` (check latest `● Ready Production`), or `curl.exe -I https://olantis.vercel.app` / fetch HTML. After env changes must redeploy.
- **Environments**: Single env `production` currently. Local source of truth is `.env.local` (vars listed below are placeholders — never commit real values):
  ```
  WORKOS_CLIENT_ID=client_...               # from WorkOS dashboard
  WORKOS_API_KEY=sk_test_...                # sensitive — vercel env only
  WORKOS_REDIRECT_URI=http://localhost:3000/callback       # local — on Vercel use https://olantis.vercel.app/callback
  NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback # same split
  WORKOS_COOKIE_PASSWORD=<32+ char random>  # openssl rand -base64 32
  CRON_SECRET=<random>                      # for /api/cron/refresh
  NEON_BRANCH=production
  DATABASE_URL=postgresql://...             # Neon pooled URL — sensitive
  DATABASE_URL_UNPOOLED=postgresql://...    # Neon direct URL — sensitive
  ```
  Vercel commands:
  - List: `vercel env ls` / `vercel env ls --format json`
  - Sync one var (force overwrite): `vercel env add WORKOS_CLIENT_ID production --value "..." --force --yes`
  - Pull to local: `vercel env pull .env.local` (overwrites — backup first)
  - Redirect vars on Vercel must be `https://olantis.vercel.app/callback` (not localhost) or WorkOS login breaks in prod.
  - After `env add`, always `vercel --prod --yes` (env only applies on next build). Demo redirect check: `curl.exe -I https://olantis.vercel.app/api/demo` → `307 Location: /dashboard`.
- **Build check** locally before push: `npm run build` (Next 16 Turbopack → expect `✓ Compiled successfully`, `Generating static pages (20/20)` listing `ƒ /` `ƒ /dashboard` `○ /signin`).

## Local Dev
- `npm run dev` (requires `.env.local`), `npm run build` / `npm run lint`. No middleware file — WorkOS handled via `withAuth({ensureSignedIn:false})` per-page + `handleAuth` callback.
- Don't commit `.env.local`, `.neon`, `.vercel` (in `.gitignore` after `d52a6d6` adds `.vercel`).
