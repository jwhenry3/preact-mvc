// Assembles the GitHub Pages artifact into dist-pages/:
//
//   dist-pages/
//     index.html, 404.html, favicon.svg   landing page (pages-landing/)
//     docs/                             docs-consumer site
//       demo/  enterprise/              demos embedded by docs iframes
//       v0.1.0/ v0.1.1/ …               release snapshots (docs-versions/*.tar.gz)
//       versions.json                   runtime manifest the version switcher reads
//     .nojekyll                         skip Jekyll processing
//
// The docs site embeds demos via relative ./<id>/ iframe URLs, so demos are
// mounted inside the docs folder — the tree works under any Pages base path
// (<user>.github.io/<repo>/). The router derives its mount prefix from
// document.baseURI, so the demo apps route correctly wherever they land.
// (The internals docs stay in-repo as markdown under docs/ — not deployed.)
//
// Snapshots: each release's docs-snapshot job uploads a docs-v<x.y.z>.tar.gz
// asset (see snapshot-docs.mjs). fetch-docs-versions.mjs drops them in
// docs-versions/; here they are mounted under docs/v<x.y.z>/ — one mount
// per release — and listed in versions.json so a page in ANY snapshot can
// discover every available version at runtime.
//
// Usage: node scripts/assemble-pages.mjs   (run after building each app)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mountDocsTree } from './pages-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist-pages');

const landingSrc = join(root, 'pages-landing');
const versionsDir = join(root, 'docs-versions');

if (!existsSync(join(landingSrc, 'index.html'))) {
  console.error('assemble-pages: pages-landing/index.html missing');
  process.exit(1);
}

// docs-v<major>.<minor>.<patch>.tar.gz → mount dir 'v<major>.<minor>.<patch>'
// — one entry per release, so the version switcher lists every patch.
function pickSnapshots() {
  if (!existsSync(versionsDir)) return [];
  const snapshots = [];
  for (const f of readdirSync(versionsDir)) {
    // 'v' prefix optional — tags are created without it (docs-0.1.0.tar.gz).
    const m = /^docs-v?(\d+)\.(\d+)\.(\d+)\.tar\.gz$/.exec(f);
    if (!m) continue;
    snapshots.push({ ver: `v${m[1]}.${m[2]}.${m[3]}`, file: f, maj: +m[1], min: +m[2], patch: +m[3] });
  }
  // Newest first — matches the order the version switcher shows.
  return snapshots.sort(
    (a, b) => b.maj - a.maj || b.min - a.min || b.patch - a.patch,
  );
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Static landing tree — no build step, copied verbatim.
cpSync(landingSrc, out, { recursive: true });
console.log('mounted pages-landing/ -> dist-pages/');

mountDocsTree(root, join(out, 'docs'));
console.log('mounted docs-consumer/dist -> dist-pages/docs/ (+ demo, enterprise)');

const snapshots = pickSnapshots();
for (const { ver, file } of snapshots) {
  const dest = join(out, 'docs', ver);
  mkdirSync(dest, { recursive: true });
  // Relative forward-slash paths — Windows bsdtar reads 'C:\…' as rmt
  // host:path syntax and mangles backslashes in -C operands.
  execFileSync('tar', ['xzf', `docs-versions/${file}`, '-C', `dist-pages/docs/${ver}`], {
    cwd: root,
  });
  console.log(`mounted ${ver} docs snapshot <- docs-versions/${file}`);
}

// versions.json lives at the docs root so pages in any snapshot can fetch
// the LIVE list — an old snapshot still learns about newer releases.
writeFileSync(
  join(out, 'docs', 'versions.json'),
  JSON.stringify({ versions: snapshots.map((s) => s.ver) }, null, 2) + '\n'
);
console.log(`versions.json: ${snapshots.length ? snapshots.map((s) => s.ver).join(', ') : '(no snapshots)'}`);

// .nojekyll: serve everything as-is. pages-landing/404.html (copied above)
// is what GitHub Pages serves for unknown paths.
writeFileSync(join(out, '.nojekyll'), '');
console.log('assemble-pages: done -> dist-pages/');
