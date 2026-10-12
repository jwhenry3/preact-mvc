// Shared Pages-tree plumbing — the docs site plus the demo mounts its pages
// iframe:
//
//   docs/
//     index.html, docs.js, assets/, <route>/…   docs-consumer/dist
//     demo/                                     src/app demo dist
//     enterprise/                               examples/enterprise dist
//
// Used by assemble-pages.mjs (mounts into dist-pages/docs/).
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Demo mount name → dist dir relative to the repo root.
export const DEMOS = [
  ['demo', 'dist'],
  ['enterprise', 'examples/enterprise/dist'],
];

// Projects the docs tree needs built (docs site + every demo above).
export const DOCS_PROJECTS = [
  ['docs-consumer', 'docs-consumer'],
  ['demo', ''],                       // root `npm run build`
  ['enterprise', 'examples/enterprise'],
];

/** Copy docs-consumer/dist + demo dists into `dest` (dist-pages/docs). */
export function mountDocsTree(root, dest) {
  const docsSrc = join(root, 'docs-consumer/dist');
  if (!existsSync(join(docsSrc, 'index.html'))) {
    console.error(`mount-docs: ${docsSrc}/index.html missing — build docs-consumer first`);
    process.exit(1);
  }
  for (const [, dir] of DEMOS) {
    if (!existsSync(join(root, dir, 'index.html'))) {
      console.error(`mount-docs: ${dir}/index.html missing — build it first`);
      process.exit(1);
    }
  }
  // Demos first (inside the docs tree), then the docs site over the root.
  for (const [name, dir] of DEMOS) {
    cpSync(join(root, dir), join(dest, name), { recursive: true });
  }
  cpSync(docsSrc, dest, { recursive: true });
}
