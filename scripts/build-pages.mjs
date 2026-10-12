// Builds the docs site + the demos, then assembles the GitHub Pages
// artifact in dist-pages/ (see assemble-pages.mjs).
// Usage: node scripts/build-pages.mjs [--no-build]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const assemble = fileURLToPath(new URL('assemble-pages.mjs', import.meta.url));

// Spawn npm without a shell: `.cmd` shims are unspawnable on Windows —
// run npm-cli.js through the current node binary instead (same pattern
// as scripts/ci-install.mjs).
const npmCli = [
  process.env.npm_execpath,
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
].find((p) => p && existsSync(p));
const NPM_CMD = npmCli ? process.execPath : 'npm';
const NPM_ARGS = npmCli ? [npmCli] : [];

const npmRun = (cwd, script, extra = []) =>
  execFileSync(NPM_CMD, [...NPM_ARGS, 'run', script, '--', ...extra], {
    cwd,
    stdio: 'inherit',
  });

if (!process.argv.includes('--no-build')) {
  // The docs site: client build + SSR bundle + prerender.
  npmRun(join(root, 'docs-consumer'), 'build');
  // Demos build with --base=./ so asset URLs stay relative — the same dist
  // works under any mount path in the Pages tree.
  npmRun(root, 'build', ['--base=./']);
  npmRun(join(root, 'examples/enterprise'), 'build', ['--base=./']);
}

execFileSync(process.execPath, [assemble], { cwd: root, stdio: 'inherit' });
console.log('build-pages: dist-pages/ is ready for upload');
