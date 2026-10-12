// Builds the GitHub Pages artifact (build-pages.mjs → dist-pages/) and serves
// it on :4190 — a local preview of the deployed docs site + demos.
// Usage: node scripts/serve-pages.mjs [--no-build]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const buildPages = fileURLToPath(new URL('build-pages.mjs', import.meta.url));
const serveStatic = fileURLToPath(new URL('serve-static.mjs', import.meta.url));

const noBuild = process.argv.includes('--no-build');
const run = (args) =>
  spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });

if (!noBuild) {
  console.log('building the Pages artifact… (skip with --no-build)');
  const b = run([buildPages]);
  b.on('exit', (code) => {
    if (code) process.exit(code);
    run([serveStatic, 'dist-pages', '4190']);
  });
} else {
  run([serveStatic, 'dist-pages', '4190']);
}
