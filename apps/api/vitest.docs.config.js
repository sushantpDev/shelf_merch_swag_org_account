import config from './vitest.config.js';

// Public documentation HTML tests do not query MongoDB.
export default { ...config, test: { ...config.test, globalSetup: undefined } };
