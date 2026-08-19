export const config = {
  runner: 'local',
  specs: [
    '*.test.ts',
  ],
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: './tsconfig.json',
    },
  },
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['headless', 'disable-gpu', 'no-sandbox'],
      },
    },
  ],
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 30000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: [
    ['chromedriver', {
      chromedriverCustomPath: '/home/ibloc/.local/share/pnpm/nodejs/24.11.1/lib/node_modules/chromedriver/lib/chromedriver/chromedriver',
    }],
  ],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },
  baseUrl: 'http://localhost:1420',
  maxInstancesPerCapability: 1,
};
