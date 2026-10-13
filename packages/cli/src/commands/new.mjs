/**
 * `pmvc new <dir>` — scaffold a preact-mvc application, the `ng new`
 * equivalent. Flags: --islands, --tailwind, --skip-install,
 * --skip-tests, -d/--dry-run, --force (overwrite existing files).
 */
import { resolve } from 'node:path';
import {
  VERSIONS,
  frameworkRange,
  render,
  run,
  toKebab,
  writeFile,
  fail,
  log,
} from '../lib.mjs';
import * as T from '../templates.mjs';

export function cmdNew(argv) {
  const a = argv; // pre-parsed by cli.mjs
  const dir = a._[0];
  if (!dir) fail('usage: pmvc new <directory> [--islands] [--tailwind] [--skip-install]');
  const name = toKebab(dir.split(/[\\/]/).pop());
  const root = resolve(dir);
  const opts = {
    dry: !!a['dry-run'],
    force: !!a.force,
  };
  const islands = !!a.islands;
  const tailwind = !!a.tailwind;
  const skipTests = !!a['skip-tests'];

  const fw = frameworkRange();
  const dependencies = {
    '@preact-mvc/core': fw,
    preact: VERSIONS.preact,
    '@preact/signals': VERSIONS['@preact/signals'],
  };
  const devDependencies = {
    '@preact/preset-vite': VERSIONS['@preact/preset-vite'],
    '@testing-library/preact': VERSIONS['@testing-library/preact'],
    '@types/node': VERSIONS['@types/node'],
    jsdom: VERSIONS.jsdom,
    typescript: VERSIONS.typescript,
    vite: VERSIONS.vite,
    vitest: VERSIONS.vitest,
  };
  if (islands) {
    dependencies['@preact-mvc/atoll'] = fw;
    dependencies['@preact-mvc/atoll-island'] = fw;
    dependencies['@atolljs/core'] = VERSIONS['@atolljs/core'];
  }
  if (tailwind) {
    devDependencies.tailwindcss = VERSIONS.tailwindcss;
    devDependencies['@tailwindcss/vite'] = VERSIONS['@tailwindcss/vite'];
  }

  const packageJson = JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc --noEmit && vite build',
        preview: 'vite preview',
        test: 'vitest run',
        'test:watch': 'vitest',
        typecheck: 'tsc --noEmit',
      },
      dependencies,
      devDependencies,
    },
    null,
    2,
  );

  const tokens = {
    NAME: name,
    TITLE: name,
    TAILWIND_IMPORT: tailwind ? "import tailwindcss from '@tailwindcss/vite';\n" : '',
    TAILWIND_PLUGIN: tailwind ? ', tailwindcss()' : '',
    ISLANDS_IMPORT: islands
      ? "import { TickerDemoView } from './island-demo/island-demo.view';\n"
      : '',
    ISLANDS_ROUTE: islands ? "  { path: '/island', component: TickerDemoView },\n" : '',
    ISLANDS_NAV: islands ? "  { to: '/island', match: '/island', label: 'Island' },\n" : '',
    KEBAB: 'ticker',
    CAMEL: 'ticker',
    CLASS: 'Ticker',
  };

  const files = {
    'package.json': packageJson + '\n',
    'tsconfig.json': T.T_TSCONFIG,
    'vite.config.ts': render(T.T_VITE_CONFIG, tokens),
    'index.html': render(T.T_INDEX_HTML, tokens),
    '.gitignore': T.T_GITIGNORE,
    '.npmrc': T.T_NPMRC,
    'README.md': render(T.T_README, tokens),
    'src/main.tsx': T.T_MAIN,
    'src/styles.css': tailwind ? T.T_STYLES_TAILWIND : T.T_STYLES,
    'src/test-setup.ts': T.T_TEST_SETUP,
    'src/app/app.module.ts': render(T.T_APP_MODULE, tokens),
    'src/app/app.shell.tsx': render(T.T_APP_SHELL, tokens),
    'src/app/app.routes.ts': render(T.T_APP_ROUTES, tokens),
    'src/app/core/tokens.ts': T.T_TOKENS,
    'src/app/hello/hello.view.tsx': T.T_HELLO_VIEW,
    'src/app/counter/counter.view.tsx': T.T_COUNTER_VIEW,
  };
  if (!skipTests) files['src/app/hello/hello.view.test.tsx'] = T.T_HELLO_TEST;
  if (islands) {
    files['src/islands/ticker.contract.ts'] = render(T.T_ISLAND_CONTRACT, tokens);
    files['src/workers/ticker.worker.tsx'] = render(T.T_ISLAND_WORKER, tokens);
    files['src/app/island-demo/island-demo.view.tsx'] = render(
      T.T_ISLAND_DEMO_VIEW,
      tokens,
    );
  }

  log(`\nScaffolding a preact-mvc app in ${root}\n`);
  for (const [rel, contents] of Object.entries(files)) {
    writeFile(root, rel, contents, opts);
  }

  if (!a['skip-install']) {
    log('\nInstalling dependencies…');
    const code = run('npm', ['install'], { cwd: root, dry: opts.dry });
    if (code !== 0) fail('npm install failed — run it manually in the new directory.');
  }

  log(`
Done. Next:

  cd ${dir}
  ${a['skip-install'] ? 'npm install\n  ' : ''}pmvc serve       # start the dev server
  pmvc g view my-page   # scaffold a new view
`);
}
