import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  host: '127.0.0.1',
  port: 4445,
  specs: [path.resolve(__dirname, './e2e-tests/specs/**/*.js')],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': {
        application: path.resolve(__dirname, './src-tauri/target/debug/shadow-desktop'),
      },
    },
  ],
  reporters: ['spec'],
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },
  services: [
    [
      'tauri',
      {
        appBinaryPath: path.resolve(__dirname, './src-tauri/target/debug/shadow-desktop'),
        driverProvider: 'embedded',
      },
    ],
  ],
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
};
