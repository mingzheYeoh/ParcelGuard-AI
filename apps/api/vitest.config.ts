import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one PostgreSQL database and re-seed between
    // cases, so they must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ['./test/setup.ts'],
  },
});
