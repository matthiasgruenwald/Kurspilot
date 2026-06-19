'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getKurspilotWorkspaceConfigPath,
  readKurspilotWorkspaceSetting,
  writeKurspilotWorkspaceSetting,
} = require('../lib/kurspilot-workspace-config');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-workspace-config-test-'));
}

test('Arbeitsbereich-Einstellung wird als user-wide JSON mit contextRoot persistiert und wieder gelesen', () => {
  const baseDir = makeTmpDir();
  const homeDir = path.join(baseDir, 'teacher-home');
  const contextRoot = path.join(
    homeDir,
    'Library',
    'Mobile Documents',
    'com~apple~CloudDocs',
    'Schule',
    'Kurspilot'
  );

  const configPath = getKurspilotWorkspaceConfigPath({ homeDir, platform: 'darwin' });
  const writeResult = writeKurspilotWorkspaceSetting(contextRoot, { homeDir, platform: 'darwin' });

  assert.strictEqual(writeResult.configPath, configPath);
  assert.ok(fs.existsSync(configPath));

  const rawConfig = fs.readFileSync(configPath, 'utf8');
  assert.deepStrictEqual(JSON.parse(rawConfig), { contextRoot });
  assert.ok(!/MOODLE_URL|MOODLE_TOKEN|token/i.test(rawConfig));
  assert.ok(!/https?:\/\//.test(rawConfig));

  const readResult = readKurspilotWorkspaceSetting({ homeDir, platform: 'darwin' });
  assert.deepStrictEqual(readResult, {
    ok: true,
    status: 'configured',
    configPath,
    contextRoot,
  });
});

test('Lesen der Arbeitsbereich-Einstellung meldet fehlende Config statt auf cwd zurueckzufallen', () => {
  const baseDir = makeTmpDir();
  const homeDir = path.join(baseDir, 'teacher-home');
  const configPath = getKurspilotWorkspaceConfigPath({ homeDir, platform: 'darwin' });

  const result = readKurspilotWorkspaceSetting({ homeDir, platform: 'darwin' });

  assert.deepStrictEqual(result, {
    ok: false,
    status: 'missing',
    configPath,
    message: 'Arbeitsbereich-Einstellung fehlt. Bitte das Kurspilot-Konfigurationsprogramm ausfuehren.',
  });
  assert.notStrictEqual(result.configPath, process.cwd());
});

test('Lesen der Arbeitsbereich-Einstellung meldet unlesbare Config bei defektem JSON', () => {
  const baseDir = makeTmpDir();
  const homeDir = path.join(baseDir, 'teacher-home');
  const configPath = getKurspilotWorkspaceConfigPath({ homeDir, platform: 'darwin' });
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, '{ kaputt', 'utf8');

  const result = readKurspilotWorkspaceSetting({ homeDir, platform: 'darwin' });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 'unreadable');
  assert.strictEqual(result.configPath, configPath);
  assert.match(result.message, /konnte nicht gelesen werden/i);
});
