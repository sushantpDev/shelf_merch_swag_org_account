import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      // Existing MCP Inspector tests still present a ShelfMerch access JWT.
      // Production ignores this flag.
      MCP_ALLOW_LEGACY_JWT: 'true',
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'rzp_test_secret',
      RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret',
      // Force stub email so the suite never hangs on real SMTP from root .env.
      EMAIL_USER: '',
      EMAIL_PASSWORD: '',
      EMAIL_FROM: '',
    },
    // Files share one DB — run sequentially. One worker avoids MongoMemory
    // replica-set respawn/OOM mid-suite. super-admin-layer is a second vitest
    // process (see package.json) because it still kills a long-lived fork.
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    globalSetup: './tests/globalSetup.js',
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});