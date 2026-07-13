import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// First-increment test harness (see ADAM_DOCS/movieknight-audit-report.md §5).
// Pure-logic + jsdom unit tests today; Playwright e2e for the critical auth /
// browse / detail flows is the tracked follow-up.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['{lib,components,app}/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});
