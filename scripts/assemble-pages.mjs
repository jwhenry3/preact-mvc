// Assembles the GitHub Pages artifact into dist-pages/:
//
//   dist-pages/
//     index.html, 404.html, favicon.svg   landing page (pages-landing/)
//     docs/                             docs-consumer site
//       demo/  enterprise/              demos embedded by docs iframes
//     .nojekyll                         skip Jekyll processing
//
// The docs site embeds demos via relative ./<id>/ iframe URLs, so demos are
// mounted inside the docs folder — the tree works under any Pages base path
// (<user>.github.io/<repo>/). The router derives its mount prefix from
// document.baseURI, so the demo apps route correctly wherever they land.
// (The internals docs stay in-repo as markdown under docs/ — not deployed.)
//
// Usage: node scripts/assemble-pages.mjs   (run after building each app)
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mountDocsTree } from './pages-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist-pages');

const landingSrc = join(root, 'pages-landing');
if (!existsSync(join(landingSrc, 'index.html'))) {
  console.error('assemble-pages: pages-landing/index.html missing');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Static landing tree — no build step, copied verbatim.
cpSync(landingSrc, out, { recursive: true });
console.log('mounted pages-landing/ -> dist-pages/');

mountDocsTree(root, join(out, 'docs'));
console.log('mounted docs-consumer/dist -> dist-pages/docs/ (+ demo, enterprise)');

// .nojekyll: serve everything as-is. pages-landing/404.html (copied above)
// is what GitHub Pages serves for unknown paths.
writeFileSync(join(out, '.nojekyll'), '');
console.log('assemble-pages: done -> dist-pages/');
