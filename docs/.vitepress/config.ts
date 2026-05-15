import { defineConfig } from 'vitepress';

const REPO = 'github-actions-annotations-reporter';

export default defineConfig({
  title: 'github-actions-annotations-reporter',
  description:
    "Scan GitHub Actions workflow annotations and file dedup-aware GitHub Issues — with severity filters, won't-fix history-aware suppression, and auto-close when annotations vanish.",
  base: process.env['DOCS_BASE'] ?? `/${REPO}/`,
  cleanUrls: true,
  lastUpdated: true,
  // esbuild 0.27 refuses to transpile vitepress 1.6's parameter-destructuring patterns to
  // the default `es2020` target. Bumping the build target to esnext skips the down-level
  // transform — modern evergreen browsers already support these.
  vite: {
    build: {
      target: 'esnext',
    },
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/quickstart' },
      { text: 'CLI reference', link: '/reference/cli' },
      { text: 'Recipes', link: '/recipes/' },
      { text: 'GitHub', link: `https://github.com/ylabonte/${REPO}` },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Quickstart', link: '/guide/quickstart' },
            { text: 'How it works', link: '/guide/how-it-works' },
            { text: 'Use as a GitHub Action', link: '/guide/use-as-action' },
          ],
        },
        {
          text: 'Configuration',
          items: [
            { text: 'Config file', link: '/guide/config-file' },
            { text: 'Authentication', link: '/guide/authentication' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'CLI', link: '/reference/cli' },
            { text: 'JSON output', link: '/reference/json-output' },
            { text: 'Issue format', link: '/reference/issue-format' },
          ],
        },
      ],
      '/recipes/': [
        {
          text: 'Recipes',
          items: [
            { text: 'Overview', link: '/recipes/' },
            { text: 'Severity & suppression', link: '/recipes/severity-and-suppression' },
            { text: 'Filtering workflows', link: '/recipes/filtering' },
          ],
        },
      ],
    },
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Yannic Labonte',
    },
    editLink: {
      pattern: `https://github.com/ylabonte/${REPO}/edit/main/docs/:path`,
    },
  },
});
