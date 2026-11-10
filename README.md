# Too Late To Ignore

Live, shared web experience for the 30-minute *Innovation In & Out* AI trends segment.
Brand shown top-right on every page: **Innovation Shadow Board**.

## Status

**Phase 1 (done):** map, story view, `/explore`, `/stage`, keyboard controls, branding.
Phases 2–4 (live room, deep dives, polish) are not started.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + build to dist/
npm run preview    # serve dist/ on http://localhost:4173
```

## Content

All signal content lives in `public/signals.json`. The app reads it at runtime, so
editing the file changes the site without code changes.

**Current file is placeholder content** (`"placeholder": true`). Replace it with the real
`signals.json`. Duotone photos go in `public/images/` (`hero.jpg` for the landing page);
a signal's `image` path is used when the file exists, otherwise its generated `art` motif shows.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/explore` | Map and all 25 signal stories (read-only) |
| `/stage` | Presenter view (same map in Phase 1; room controls arrive in Phase 2) |

Deep link to a signal: `/explore#s=s07`.

## Keys

| Key | Action |
| --- | --- |
| → / ← | Open first signal, then step next / previous |
| Click node | Zoom into its story |
| Esc | Back to map |
| M | Show map |
| ? | Keyboard help |

## Deploy

Assets-only Cloudflare Worker (`wrangler.toml`, serves `dist/`):

```bash
npm run deploy     # requires `npx wrangler login` or CLOUDFLARE_API_TOKEN
```

## Smoke test

With `npm run preview` running:

```bash
PW_PATH=<path to playwright index.js> node scripts/smoke.mjs http://localhost:4173 <screenshot dir>
```
