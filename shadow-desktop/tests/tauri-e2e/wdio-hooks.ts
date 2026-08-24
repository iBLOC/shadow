import { stateReset } from './state-reset';

export const mochaHooks = {
  beforeAll: async () => {
    // No-op: setup runs once via wdio globalSetup.
  },
  beforeEach: async () => {
    await stateReset();
  },
  afterEach: async () => {
    // Spec-level cleanup if needed; wdioHooks beforeEach resets for next spec.
  },
};