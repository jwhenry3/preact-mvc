# The docs site and GitHub Pages deploy

The consumer-facing documentation lives in `docs-consumer/`, a Vite +
Preact app modeled on the Atoll `docs-consumer/` architecture. It is
deployed to GitHub Pages together with a static landing page and the two
live demo apps. This doc describes the moving parts.

## Layout

```
pages-landing/      static site root: index.html, 404.html, favicon.svg.
                    No build step; copied verbatim into dist-pages/.
docs-consumer/      the docs app. `npm run build` does tsc + Vite client
                    build + SSR bundle build + prerender.mjs, emitting one
                    static HTML file per route into dist/.
scripts/
  pages-lib.mjs     the demo mount table (docs/demo, docs/enterprise).
  assemble-pages.mjs  builds dist-pages/: landing + docs + demo mounts +
                    .nojekyll.
  build-pages.mjs   builds every app (demos with --base=./) then assembles.
  serve-pages.mjs   build + serve dist-pages on :4190.
  serve-static.mjs  dependency-free static file server (index.html +
                    404.html semantics).
.github/workflows/pages.yml
                    manual (workflow_dispatch) Pages deploy.
```

The assembled tree:

```
dist-pages/
  index.html 404.html favicon.svg   from pages-landing/
  docs/                           from docs-consumer/dist
    demo/                         from dist/ (root app)
    enterprise/                   from examples/enterprise/dist
  .nojekyll
```

Everything is static. The islands demos use ordinary Web Workers, not
SharedArrayBuffer, so no COOP/COEP service worker is needed (unlike
Atoll's docs, which ship a cross-origin-isolation shim).

## The docs app (docs-consumer/)

- `src/App.tsx` — the route table and shell (header, sidebar, article).
  Routes are plain objects `{ id, path, label, section, element }`.
- `src/ssg.tsx` — exports `ROUTES` and `renderRoute(id)` for prerendering.
- `src/routeMeta.ts` — per-route `<title>`, description, canonical URL.
  `metaFor` qualifies non-root pages labeled "Overview" (e.g. `islands`
  becomes "Islands overview") so titles stay unique.
- `src/link.ts` — route-relative URL helpers (`href` etc.) so links work
  under any Pages base path; `docsBaseUrl()` resolves the canonical
  origin for sitemap/OG tags (`DOCS_BASE_URL` env, fallback localhost).
- `prerender.mjs` — runs after the Vite builds: loads `dist-ssg/ssg.js`,
  emits `dist/<route>/index.html` per route with meta injected into the
  HTML template, plus `robots.txt`, `sitemap.xml`, and `docs.js` (a tiny
  vanilla-JS nav enhancer; the emitted pages do not ship a Preact
  runtime).
- `src/components/` — `CodeBlock` (highlight.js, optional `worker`/`shell`
  side label), `DemoFrame` (dev → dev-server URL, prod → relative mount),
  `SiteHeader`.
- `src/pages/` — one file per route. Writing a new page = add the file +
  add a route entry in `App.tsx`.

## Why the demos mount inside docs/

`DemoFrame` embeds `./demo/` and `./enterprise/` — relative iframe URLs.
The demos live inside the docs tree so the whole `dist-pages/` folder
works under any Pages base (`user.github.io/repo/`). The framework
router derives its base path from `document.baseURI` (see
`framework.md` → Router), so an app mounted at `docs/demo/` routes
`/todos` internally while `Link` emits `/docs/demo/todos`. Explicit
`RouterModule.forRoot(routes, { basePath })` overrides that derivation.

Demos build with `vite build --base=./` so their asset URLs are relative;
the same dist works at any mount depth.

## Dev vs production demo URLs

`DemoFrame` switches on `import.meta.env.DEV`:

- dev: `http://localhost:<port>/` (the example's dev server; enterprise is
  pinned to a deterministic port in `examples/enterprise/vite.config.ts`)
- prod: `./<mount>/` (the assembled Pages tree)

## Deploy

`pages.yml` is manual-only (`workflow_dispatch`): build docs + demos →
`assemble-pages.mjs` → `upload-pages-artifact` → `deploy-pages`. Set the
`DOCS_BASE_URL` repo variable for correct canonical/sitemap URLs; links
themselves are relative and work regardless.

The internals docs (`docs/*.md`) are deliberately not part of the
deployed site; they are the repo's second memory (see `docs/AGENTS.md`).

## Invariants

- New standalone projects get the shared `.npmrc` and an entry in
  `scripts/ci-install.mjs` (`docs-consumer` already has both).
- If a docs page documents an API, verify the snippet against the package
  source; do not document from memory.
- Keep worker entries bundler-detectable (`new Worker(new URL(...))`
  inline) in every demo; the mounted builds rely on Vite's detection.
- When the deploy tree changes (new demo, new mount), update this file
  and `pages-lib.mjs`'s `DEMOS` table in the same change.
