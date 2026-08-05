'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { runInteractive } = require('../scripts/setup-kurspilot');

test('Interaktiver Konfigurator erstellt die Startmenü-Verknüpfung bereits beim Öffnen', async () => {
  const shortcutCalls = [];
  const tool = {
    url: 'http://127.0.0.1:12345/',
    close: () => {},
    closed: Promise.resolve('no-browser-connection'),
  };

  await runInteractive({
    installConfiguratorShortcut: options => {
      shortcutCalls.push(options);
      return { shortcutPath: 'C:\\Users\\Lehrkraft\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Kurspilot konfigurieren.lnk' };
    },
    launchSetupBrowserServer: async () => tool,
  });

  assert.strictEqual(shortcutCalls.length, 1);
  assert.strictEqual(shortcutCalls[0].nodePath, process.execPath);
  assert.strictEqual(shortcutCalls[0].appPath, path.join(__dirname, '..'));
});
