<p align="center">
  <img src="public/brand/mark-512.png" alt="Olantis app icon" width="112" height="112">
</p>

<h1 align="center">Olantis</h1>

<p align="center">Your portfolios, beautifully simple.</p>

Olantis is a portfolio dashboard built with Next.js and backed by Neon Postgres. The Electron desktop app in this repository opens the same deployed application at `https://olantis.vercel.app`, so desktop and web share the same routes, sign-in, demo experience, API, and user data. Its frameless desktop window has an integrated draggable toolbar, page navigation controls, window buttons, and the Olantis app icon.

## Requirements

- Node.js 24+
- npm
- A local `.env.local` for running the Next.js app (see the project setup notes in `AGENTS.md`)

## Run the web app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run the Electron app locally

```bash
npm run electron:dev
```

This starts the local Next.js server on port 3000, waits for it to become ready, then opens it in Electron. Close the Electron window to stop the development server. The desktop app uses the same `.env.local` and backend as the web app; local WorkOS redirect URLs should point to `http://localhost:3000/callback`.

Try the full unauthenticated flow with **Try demo**. To test WorkOS sign-in, configure valid local WorkOS and database environment variables first. Electron keeps its own persistent session, separate from your regular browser.

Sign-in runs inside the desktop window. WorkOS, AuthKit, and the identity providers AuthKit hands off to (Google, Microsoft, Apple, GitHub) are trusted in-app navigations in `electron/url-policy.cjs`, so the one-time sign-in cookie never has to cross into a browser that does not share the desktop session. Any other link opens in your default browser.

For a no-interaction local launch check, run `npm run electron:smoke`. It starts the same local Next.js server, opens the Electron window, checks that the Olantis landing page rendered, and exits with a pass/fail code.

### Measure startup

```bash
npm run bench:startup -- --url https://olantis.vercel.app --runs 8 --json .bench/startup.json
```

Each run launches the real app and reads the `OLANTIS-TRACE` marks `electron/main.cjs` emits, so the table covers process bootstrap, app ready, the title-bar window, and the embedded page (TTFB, DOM ready, first paint, the moment the splash is replaced, load) — all in milliseconds from the `electron.exe` spawn. `--fresh-profile` measures a first launch on a new machine, `--exe release/win-unpacked/Olantis.exe` measures the packaged app.

To prove a change helps, measure the old and new main process in one session so machine drift lands on both:

```bash
git show HEAD:electron/main.cjs > electron/main.baseline.cjs
npm run bench:startup -- --runs 12 --app electron/main.baseline.cjs --compare electron/main.cjs
```

The run interleaves the two entries and prints a per-milestone delta. Delete the copied baseline afterwards.

## Build desktop installers

```bash
npm run electron:pack  # unpacked app for a quick local packaging check
npm run electron:dist  # installer for the current operating system
```

Installers are written to `release/` (Windows NSIS, macOS DMG/ZIP, Linux AppImage/DEB). The installed app opens the production Olantis site by default. Set `OLANTIS_ELECTRON_URL` only when launching Electron manually to point it at another deployment.

## Publish desktop installers

A push to `master` that touches the desktop shell (`electron/**`, the brand icons, the packaging config in `package.json`, or the electron scripts) runs the GitHub Actions workflow in `.github/workflows/electron-release.yml`. It builds Windows, macOS, and Linux installers and publishes them in a uniquely tagged GitHub Release. Web-only changes skip the workflow entirely, since the installed app already loads the deployed site; run the workflow manually from the Actions tab when you want a fresh installer anyway. The release app points to the same production web deployment, so web updates are reflected in desktop without shipping another installer.

## Checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
