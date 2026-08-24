export const config = {
  runner: 'local',
  specs: ['./tests/tauri-e2e/**/*.test.ts'],
  maxInstances: 1,
  capabilities: [{
    browserName: 'tauri',
    'tauri:options': {},
  }],
  protocol: 'http',
  hostname: 'localhost',
  port: 4445,
  path: '/',
  services: [],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 180_000 },
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: { project: './tsconfig.json', transpileOnly: true },
  },
};