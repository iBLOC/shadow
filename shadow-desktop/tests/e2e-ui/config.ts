export const TEST_CONFIG = {
  // Real credentials come from the environment — specs that need the key
  // self-skip via test.skip(!TEST_CONFIG.MIMO_API_KEY) when it is unset.
  MIMO_API_KEY: process.env.MIMO_API_KEY ?? '',
  MIMO_API_BASE: 'https://api.xiaomimimo.com/v1',
  TELENCEPHALON_URL: process.env.SHADOW_TELENCEPHALON_URL ?? 'http://localhost:60080',
};
