/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: [
      {
        // Same alias as vite.config.ts — vitest.config.ts takes precedence,
        // so it must be repeated here or `@/…` imports stop resolving.
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
      {
        // @atolljs/core ships dist/index.js for the bare specifier but raw
        // src/* for subpaths. The islands package resolves the dist build
        // while `@atolljs/core/testing/inProcessWorker` only exists in
        // src — two realms, two TaskRegistry instances, and mounts fail
        // with "Task handler not found". Alias the bare specifier into
        // src so tests run a single module realm.
        find: /^@atolljs\/core$/,
        replacement: fileURLToPath(
          new URL('./node_modules/@atolljs/core/src/index.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // The publishable surface: core + the atoll adapter packages.
      // packages/cli is tooling, not runtime — its interactive shell
      // (readline, process.argv guard) isn't meaningfully coverable.
      include: ['packages/*/src/**'],
      exclude: [
        '**/*.{json,html,css,mjs}',
        '**/*.test.*',
        'packages/cli/**',
      ],
      // Floor slightly below the current baseline — regresses fail CI.
      thresholds: { statements: 88, branches: 83, functions: 92, lines: 88 },
    },
  },
});
