'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CLIENTS,
  CLIENT_IDS,
  OFFICIAL_INSTALL_LINKS,
  detectClients,
  clientLabel,
  getClaudeDesktopConfigPath,
  getClaudeCodeConfigPath,
} = require('../lib/client-registry');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-client-registry-test-'));
}

test('CLIENTS enthaelt Codex und Claude mit gemeinsamen Feldern', () => {
  assert.deepStrictEqual(CLIENT_IDS.slice().sort(), ['claude', 'codex']);
  for (const id of CLIENT_IDS) {
    const client = CLIENTS[id];
    assert.strictEqual(client.id, id);
    assert.ok(client.label, `${id}: label fehlt`);
    assert.ok(client.installLink.startsWith('https://'), `${id}: installLink fehlt`);
    assert.ok(client.providerRoot, `${id}: providerRoot fehlt`);
    assert.strictEqual(typeof client.skillTargetRoot, 'function', `${id}: skillTargetRoot fehlt`);
    assert.strictEqual(typeof client.configPaths, 'function', `${id}: configPaths fehlt`);
    assert.strictEqual(typeof client.detect, 'function', `${id}: detect fehlt`);
  }
});

test('OFFICIAL_INSTALL_LINKS stammt aus der gemeinsamen Abbildung', () => {
  assert.deepStrictEqual(OFFICIAL_INSTALL_LINKS, {
    codex: 'https://chatgpt.com/codex',
    claude: 'https://claude.ai/download',
  });
  for (const id of CLIENT_IDS) {
    assert.strictEqual(OFFICIAL_INSTALL_LINKS[id], CLIENTS[id].installLink);
  }
});

test('skillTargetRoot liefert die nutzerweite Skill-Zielwurzel pro Client', () => {
  const homeDir = makeTmpDir();
  assert.strictEqual(CLIENTS.codex.skillTargetRoot(homeDir), path.join(homeDir, '.codex', 'skills'));
  assert.strictEqual(CLIENTS.claude.skillTargetRoot(homeDir), path.join(homeDir, '.claude', 'skills'));
});

test('configPaths liefert die globalen Config-Pfade pro Client', () => {
  const homeDir = makeTmpDir();
  assert.deepStrictEqual(CLIENTS.codex.configPaths(homeDir), [path.join(homeDir, '.codex', 'config.toml')]);
  const claudePaths = CLIENTS.claude.configPaths(homeDir);
  assert.strictEqual(claudePaths.length, 2);
  assert.strictEqual(claudePaths[1], path.join(homeDir, '.claude.json'));
});

test('clientLabel liefert den Anzeigenamen aus der Abbildung', () => {
  assert.strictEqual(clientLabel('codex'), 'Codex');
  assert.strictEqual(clientLabel('claude'), 'Claude');
});

test('detectClients erkennt Codex ueber lokale CLI ausserhalb des PATH', () => {
  const homeDir = makeTmpDir();
  const localBin = path.join(homeDir, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  const codexPath = path.join(localBin, 'codex');
  fs.writeFileSync(codexPath, '#!/bin/sh\n');
  fs.chmodSync(codexPath, 0o755);

  const result = detectClients({ homeDir, pathEnv: '' });
  assert.strictEqual(result.codex, true);
});

test('detectClients liefert einen Eintrag pro registriertem Client', () => {
  const result = detectClients({ homeDir: makeTmpDir(), pathEnv: '' });
  assert.deepStrictEqual(Object.keys(result).sort(), CLIENT_IDS.slice().sort());
});

test('getClaudeDesktopConfigPath und getClaudeCodeConfigPath sind ueber die Registry verfuegbar', () => {
  const homeDir = makeTmpDir();
  assert.strictEqual(typeof getClaudeDesktopConfigPath(homeDir), 'string');
  assert.strictEqual(getClaudeCodeConfigPath(homeDir), path.join(homeDir, '.claude.json'));
});
