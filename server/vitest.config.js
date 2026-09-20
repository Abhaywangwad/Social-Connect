import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/globalSetup.js', './tests/setup/testLifecycle.js'],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false, // Run test files sequentially to preserve clean DB isolation
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'test_*.js',
        'src/server.js',
      ],
    },
  },
});
