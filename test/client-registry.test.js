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
  getOpenCodeConfigPath,
} = require('../lib/client-registry');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-client-registry-test-'));
}

test('CLIENTS enthaelt Codex, Claude und opencode mit gemeinsamen Feldern', () => {
  assert.deepStrictEqual(CLIENT_IDS.slice().sort(), ['claude', 'codex', 'opencode']);
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

test('skillTargetRoot liefert opencode-Skill-Ort (~/.agents/skills)', () => {
  const homeDir = makeTmpDir();
  assert.strictEqual(CLIENTS.opencode.skillTargetRoot(homeDir), path.join(homeDir, '.agents', 'skills'));
});

test('opencode-Provider-Root zeigt auf .opencode/skills im Repo', () => {
  assert.strictEqual(CLIENTS.opencode.providerRoot, '.opencode/skills');
});

test('OFFICIAL_INSTALL_LINKS stammt aus der gemeinsamen Abbildung', () => {
  assert.deepStrictEqual(OFFICIAL_INSTALL_LINKS, {
    codex: 'https://chatgpt.com/codex',
    claude: 'https://claude.ai/download',
    opencode: 'https://opencode.ai',
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

test('getOpenCodeConfigPath liefert plattformverzweigt die globale opencode-Config (Plattform-Stub)', () => {
  const homeDir = makeTmpDir();

  assert.strictEqual(
    getOpenCodeConfigPath(homeDir, { platform: 'darwin' }),
    path.join(homeDir, '.config', 'opencode', 'opencode.json')
  );
  assert.strictEqual(
    getOpenCodeConfigPath(homeDir, { platform: 'linux' }),
    path.join(homeDir, '.config', 'opencode', 'opencode.json')
  );

  const appData = path.join(homeDir, 'AppData', 'Roaming');
  assert.strictEqual(
    getOpenCodeConfigPath(homeDir, { platform: 'win32', appData }),
    path.join(appData, 'opencode', 'opencode.json')
  );
});

test('getOpenCodeConfigPath faellt auf Windows ohne APPDATA-Env auf das Nutzerprofil zurueck', () => {
  const homeDir = makeTmpDir();
  const savedAppData = process.env.APPDATA;
  delete process.env.APPDATA;
  try {
    assert.strictEqual(
      getOpenCodeConfigPath(homeDir, { platform: 'win32' }),
      path.join(homeDir, 'AppData', 'Roaming', 'opencode', 'opencode.json')
    );
  } finally {
    if (savedAppData !== undefined) {
      process.env.APPDATA = savedAppData;
    }
  }
});

test('detectClients erkennt opencode ueber CLI auf dem PATH (Plattform-Stub)', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    const binDir = makeTmpDir();
    const cliPath = path.join(binDir, 'opencode');
    fs.writeFileSync(cliPath, '#!/bin/sh\n');
    fs.chmodSync(cliPath, 0o755);

    const result = detectClients({ homeDir: makeTmpDir(), platform, pathEnv: binDir, appData: makeTmpDir() });
    assert.strictEqual(result.opencode, true, `opencode nicht erkannt via PATH auf ${platform}`);
  }
});

test('detectClients erkennt opencode ueber den globalen Config-Ordner ohne CLI auf PATH', () => {
  for (const platform of ['darwin', 'linux']) {
    const homeDir = makeTmpDir();
    fs.mkdirSync(path.join(homeDir, '.config', 'opencode'), { recursive: true });

    const result = detectClients({ homeDir, platform, pathEnv: '', appData: makeTmpDir() });
    assert.strictEqual(result.opencode, true, `opencode nicht erkannt via Config-Ordner auf ${platform}`);
  }

  const appData = makeTmpDir();
  fs.mkdirSync(path.join(appData, 'opencode'), { recursive: true });
  const winResult = detectClients({ homeDir: makeTmpDir(), platform: 'win32', pathEnv: '', appData });
  assert.strictEqual(winResult.opencode, true, 'opencode nicht erkannt via Config-Ordner auf win32');
});

test('detectClients erkennt die Windows-Desktop-App ausserhalb von PATH und Config-Ordner', () => {
  const homeDir = makeTmpDir();
  const appData = makeTmpDir();
  const localAppData = makeTmpDir();
  fs.mkdirSync(path.join(localAppData, 'Programs', 'opencode'), { recursive: true });

  const result = detectClients({ homeDir, platform: 'win32', pathEnv: '', appData, localAppData });

  assert.strictEqual(result.opencode, true, 'opencode Desktop muss über seinen Windows-Installationsordner erkannt werden');
});

test('detectClients erkennt opencode nicht ohne CLI auf PATH und ohne Config-Ordner', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    const result = detectClients({ homeDir: makeTmpDir(), platform, pathEnv: '', appData: makeTmpDir() });
    assert.strictEqual(result.opencode, false, `opencode faelschlich erkannt auf ${platform}`);
  }
});
