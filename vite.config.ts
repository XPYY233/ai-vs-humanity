import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  base: command === 'build' && process.env.GITHUB_ACTIONS ? '/ai-vs-humanity/' : '/',
  build: { chunkSizeWarningLimit: 1800 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
}));
