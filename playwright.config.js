'use strict';

const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const envPath = path.resolve(__dirname, '.env.e2e');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1);
  }
}

module.exports = defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    browserName: 'chromium',
    headless: true,
  },
});
