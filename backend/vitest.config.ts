import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Integration tests share the Atlas cluster; run files sequentially to keep the test org consistent.
    fileParallelism: false,
    reporters: ['verbose'],
    // Tests never call paid LLM / TTS providers: answers use the deterministic template path.
    env: { LLM_API_KEY: '', ELEVENLABS_API_KEY: '' },
  },
});
