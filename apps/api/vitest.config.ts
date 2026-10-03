import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// SWC instead of esbuild: Nest DI needs emitted decorator metadata.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://fernleaf:fernleaf@localhost:54329/fernleaf_test',
      DIRECT_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://fernleaf:fernleaf@localhost:54329/fernleaf_test',
      JWT_SECRET: 'test-secret-0123456789',
    },
  },
});
