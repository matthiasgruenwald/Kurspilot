'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  checkAppUpdate,
  checkImageMagickUpdate,
  applyAppUpdate,
  applyImageMagickUpdate,
  isOfflineError,
} = require('../lib/update-check');

// --- checkAppUpdate (Skills + MCP-Server teilen den App-Tarball) -----------

test('checkAppUpdate meldet verfuegbares Update, wenn Tarball-Hash vom gespeicherten Marker abweicht', async () => {
  const result = await checkAppUpdate({
    fetch: async () => Buffer.from('neuer-inhalt'),
    existsSync: () => true,
    readFile: () => 'alter-hash-marker',
  });

  assert.strictEqual(result.updateAvailable, true);
  assert.strictEqual(result.offline, false);
  assert.strictEqual(result.error, null);
});

test('checkAppUpdate meldet kein Update, wenn Commit-SHA mit gespeichertem Marker uebereinstimmt', async () => {
  const sha = 'abc123def456abc123def456abc123def456abc1';
  const result = await checkAppUpdate({
    fetch: async () => Buffer.from(sha),
    existsSync: () => true,
    readFile: () => sha,
  });

  assert.strictEqual(result.updateAvailable, false);
  assert.strictEqual(result.offline, false);
});

test('checkAppUpdate meldet Update, wenn noch kein Marker existiert (Erst-Setup ueberstanden, nie geprueft)', async () => {
  const result = await checkAppUpdate({
    fetch: async () => Buffer.from('irgendwas'),
    existsSync: () => false,
    readFile: () => {
      throw new Error('sollte nicht aufgerufen werden');
    },
  });

  assert.strictEqual(result.updateAvailable, true);
});

test('checkAppUpdate meldet verstaendliche Offline-Meldung statt zu crashen, wenn fetch fehlschlaegt', async () => {
  const result = await checkAppUpdate({
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
    existsSync: () => true,
    readFile: () => 'irgendein-hash',
  });

  assert.strictEqual(result.offline, true);
  assert.strictEqual(result.updateAvailable, false);
  assert.match(result.error, /[Vv]erbindung/);
});

test('checkAppUpdate nutzt Node-globales fetch als Default, statt mit "fetchFn is not a function" zu crashen (#142)', async (t) => {
  // Vorher fehlte der Default komplett: ein Aufruf ohne options.fetch (wie im
  // realen Browser-Konfigurationsprogramm, lib/setup-browser-server.js
  // uebergibt updateOptions.appUpdateOptions standardmaessig undefined)
  // crashte mit "fetchFn is not a function" - isOfflineError() stufte das
  // faelschlich als Netzwerkfehler ein (die Meldung enthaelt "fetch").
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    arrayBuffer: async () => Buffer.from('inhalt'),
  }));

  const result = await checkAppUpdate({
    existsSync: () => false,
    readFile: () => { throw new Error('sollte nicht gelesen werden'); },
  });

  assert.strictEqual(result.offline, false);
  assert.strictEqual(result.error, null);
  assert.strictEqual(result.updateAvailable, true);
});

test('checkAppUpdate haengt nicht, wenn fetch nie aufloest (Timeout)', async () => {
  const result = await checkAppUpdate({
    fetch: () => new Promise(() => {}),
    existsSync: () => true,
    readFile: () => 'irgendein-hash',
    timeoutMs: 20,
  });

  assert.strictEqual(result.offline, true);
  assert.match(result.error, /[Vv]erbindung/);
});

// --- checkImageMagickUpdate --------------------------------------------------

test('checkImageMagickUpdate meldet Update verfuegbar, wenn ImageMagick fehlt und Plattform unterstuetzt ist', () => {
  const result = checkImageMagickUpdate({
    isImageMagickAvailable: () => false,
    platform: 'win32',
  });

  assert.strictEqual(result.updateAvailable, true);
  assert.strictEqual(result.offline, false);
});

test('checkImageMagickUpdate meldet kein Update, wenn ImageMagick schon installiert ist', () => {
  const result = checkImageMagickUpdate({
    isImageMagickAvailable: () => true,
    platform: 'win32',
  });

  assert.strictEqual(result.updateAvailable, false);
});

test('checkImageMagickUpdate meldet kein Update auf nicht unterstuetzten Plattformen', () => {
  const result = checkImageMagickUpdate({
    isImageMagickAvailable: () => false,
    platform: 'darwin',
  });

  assert.strictEqual(result.updateAvailable, false);
  assert.strictEqual(result.supported, false);
});

// --- applyAppUpdate -----------------------------------------------------------

test('applyAppUpdate installiert das App-Update per injiziertem provisionApp', async () => {
  const calls = [];
  const written = {};
  const result = await applyAppUpdate({
    provisionApp: async options => {
      calls.push(options);
      return { appDir: '/home/.kurspilot/app', updated: true };
    },
    fetchCheck: async () => Buffer.from('abc123sha'),
    writeFile: (filePath, data) => { written[filePath] = data; },
    installConfiguratorShortcut: () => ({ shortcutPath: '/fake/Kurspilot konfigurieren.app' }),
    installSkillsForProvider: () => ({
      aborted: false,
      written: [],
      unchanged: [],
      conflicts: [],
      conflictPrompts: [],
      warnings: [],
    }),
  });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.updated, true);
  assert.strictEqual(result.error, null);
});

test('applyAppUpdate meldet updated=false, wenn der Tarball-Inhalt bereits aktuell war', async () => {
  const result = await applyAppUpdate({
    provisionApp: async () => ({ appDir: '/home/.kurspilot/app', updated: false }),
    fetchCheck: async () => Buffer.from('abc123sha'),
    writeFile: () => {},
    installConfiguratorShortcut: () => ({ shortcutPath: '/fake/Kurspilot konfigurieren.app' }),
    installSkillsForProvider: () => ({
      aborted: false,
      written: [],
      unchanged: [],
      conflicts: [],
      conflictPrompts: [],
      warnings: [],
    }),
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.updated, false, 'ohne entpackte Änderung ist kein Dienstneustart nötig');
});

test('applyAppUpdate lädt und markiert denselben geprüften main-Commit', async () => {
  let provisionOptions;
  const written = {};
  const sha = 'abc123def456abc123def456abc123def456abc1';

  await applyAppUpdate({
    provisionApp: async options => {
      provisionOptions = options;
      return { appDir: '/home/.kurspilot/app', updated: true };
    },
    fetchCheck: async () => Buffer.from(sha),
    writeFile: (filePath, data) => { written[filePath] = data; },
    installConfiguratorShortcut: () => ({ shortcutPath: '/fake/Kurspilot konfigurieren.app' }),
    installSkillsForProvider: () => ({ aborted: false, written: [], unchanged: [], conflicts: [], conflictPrompts: [], warnings: [] }),
  });

  assert.strictEqual(
    provisionOptions.tarballUrl,
    `https://github.com/matthiasgruenwald/moodle-coursepilot/archive/${sha}.tar.gz`
  );
  assert.ok(Object.values(written).includes(sha));
});

test('applyAppUpdate meldet verstaendliche Offline-Meldung, wenn provisionApp wegen Netzfehler scheitert', async () => {
  const result = await applyAppUpdate({
    provisionApp: async () => {
      throw new TypeError('fetch failed');
    },
    fetchCheck: async () => Buffer.from('sha'),
    writeFile: () => {},
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /[Vv]erbindung/);
});

test('applyAppUpdate meldet Zeitüberschreitung beim Tarball-Download verständlich', async () => {
  const error = new Error('Zeitüberschreitung beim Download des Kurspilot-Updates.');
  error.code = 'KURSPILOT_TIMEOUT';
  const result = await applyAppUpdate({
    provisionApp: async () => { throw error; },
    fetchCheck: async () => Buffer.from('abc123sha'),
    writeFile: () => {},
  });

  assert.strictEqual(result.offline, true);
  assert.match(result.error, /[Vv]erbindung/);
});

test('applyAppUpdate installiert Skills fuer alle drei Anbieter aus dem frisch entpackten appDir', async () => {
  const calls = [];
  const result = await applyAppUpdate({
    provisionApp: async () => ({ appDir: '/home/.kurspilot/app', updated: true }),
    fetchCheck: async () => Buffer.from('sha'),
    writeFile: () => {},
    installSkillsForProvider: (repoRoot, providerRoot, targetRoot) => {
      calls.push({ repoRoot, providerRoot, targetRoot });
      return { aborted: false, written: [], unchanged: [], conflicts: [], conflictPrompts: [], warnings: [] };
    },
    installConfiguratorShortcut: () => ({ shortcutPath: '/fake/Kurspilot konfigurieren.app' }),
    homeDir: '/home',
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(calls.length, 2, 'Codex und opencode teilen die kanonische Ablage');
  assert.ok(calls.some(call => call.targetRoot === '/home/.agents/skills'));
  assert.ok(calls.some(call => call.targetRoot === '/home/.claude/skills'));
  assert.strictEqual(result.skillInstallAborted, false);
});

test('applyAppUpdate erhält Claude-Aliase auf die kanonische Ablage', async () => {
  const calls = [];
  await applyAppUpdate({
    provisionApp: async () => ({ appDir: '/home/.kurspilot/app', updated: true }),
    fetchCheck: async () => Buffer.from('sha'),
    writeFile: () => {},
    areKurspilotSkillsAliased: () => true,
    installSkillsForProvider: (repoRoot, providerRoot, targetRoot) => {
      calls.push({ providerRoot, targetRoot });
      return { aborted: false, written: [], unchanged: [], conflicts: [], conflictPrompts: [], warnings: [] };
    },
    installConfiguratorShortcut: () => ({ shortcutPath: null }),
    clients: ['codex', 'claude'],
    homeDir: '/home',
  });

  assert.deepStrictEqual(calls, [{
    providerRoot: '/home/.kurspilot/app/.agents/skills',
    targetRoot: '/home/.agents/skills',
  }]);
});

test('applyAppUpdate gibt Skillname und fertigen Copy-Paste-Prompt bei Skill-Konflikt weiter', async () => {
  const result = await applyAppUpdate({
    provisionApp: async () => ({ appDir: '/home/.kurspilot/app', updated: true }),
    fetchCheck: async () => Buffer.from('sha'),
    writeFile: () => {},
    installSkillsForProvider: () => ({
      aborted: true,
      written: [],
      unchanged: [],
      conflicts: ['kurspilot-planen/SKILL.md'],
      conflictSkillNames: ['kurspilot-planen'],
      conflictPrompts: [
        { skillName: 'kurspilot-planen', prompt: 'Vergleiche meine Version von kurspilot-planen mit dem Update...' },
      ],
      warnings: ['Verwalteter Kurspilot-Skill lokal verändert: kurspilot-planen/SKILL.md.'],
    }),
    homeDir: '/home',
    installConfiguratorShortcut: () => ({ shortcutPath: '/fake/Kurspilot konfigurieren.app' }),
  });

  assert.strictEqual(result.skillInstallAborted, true);
  assert.strictEqual(result.skillInstallConflictPrompts.length, 2, 'gemeinsames Codex-/opencode-Ziel wird nur einmal geprüft');
  assert.match(result.skillInstallConflictPrompts[0].prompt, /kurspilot-planen/);
});

// --- applyImageMagickUpdate ----------------------------------------------------

test('applyImageMagickUpdate delegiert an injiziertes installImageMagick', async () => {
  const result = await applyImageMagickUpdate({
    installImageMagick: () => ({ installed: true, error: null }),
  });

  assert.strictEqual(result.installed, true);
});

test('applyImageMagickUpdate gibt Fehlermeldung weiter, wenn Installation fehlschlaegt', async () => {
  const result = await applyImageMagickUpdate({
    installImageMagick: () => ({ installed: false, error: 'winget nicht gefunden' }),
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /winget nicht gefunden/);
});

// --- Regressionstests (Issue #186) -------------------------------------------

test('checkAppUpdate meldet HTTP-Fehler der API mit echter Ursache, nicht als Offline (#186)', async () => {
  // Regression: frueher wurde ein zu kurzer Timeout (10 s) beim 56-MB-Tarball-Download
  // als Verbindungsfehler gemeldet. Jetzt holt checkAppUpdate nur noch einen 40-Byte-Commit-SHA.
  // Ein HTTP-Fehler (z.B. 404) darf nicht als "keine Internetverbindung" erscheinen.
  const result = await checkAppUpdate({
    fetch: async () => {
      throw new Error('Versionsprüfung fehlgeschlagen: HTTP 404 Not Found');
    },
    existsSync: () => true,
    readFile: () => 'gespeicherter-sha',
  });

  assert.strictEqual(result.offline, false);
  assert.match(result.error, /404/);
});

test('applyAppUpdate schreibt Commit-SHA-Marker nach erfolgreicher Installation', async () => {
  const written = {};
  await applyAppUpdate({
    provisionApp: async () => ({ appDir: '/home/.kurspilot/app', updated: true }),
    fetchCheck: async () => Buffer.from('abc123sha'),
    writeFile: (filePath, data) => { written[filePath] = data; },
    installSkillsForProvider: () => ({ aborted: false, written: [], unchanged: [], conflicts: [], conflictPrompts: [], warnings: [] }),
    installConfiguratorShortcut: () => ({ shortcutPath: '/fake/Kurspilot konfigurieren.app' }),
    homeDir: '/home',
  });

  const { COMMIT_MARKER_FILENAME } = require('../lib/update-check');
  const markerKey = Object.keys(written).find(k => k.endsWith(COMMIT_MARKER_FILENAME));
  assert.ok(markerKey, 'Commit-SHA-Marker muss geschrieben werden');
  assert.strictEqual(written[markerKey], 'abc123sha');
});

test('applyAppUpdate aktualisiert auch die Konfigurations-App aus dem neuen App-Verzeichnis', async () => {
  const calls = [];
  const result = await applyAppUpdate({
    provisionApp: async () => ({ appDir: '/home/.kurspilot/app', updated: true }),
    fetchCheck: async () => Buffer.from('sha'),
    writeFile: () => {},
    installSkillsForProvider: () => ({ aborted: false, written: [], unchanged: [], conflicts: [], conflictPrompts: [], warnings: [] }),
    installConfiguratorShortcut: options => {
      calls.push(options);
      return { shortcutPath: '/home/Applications/Kurspilot konfigurieren.app' };
    },
    homeDir: '/home',
  });

  assert.deepStrictEqual(calls, [{
    homeDir: '/home',
    nodePath: process.execPath,
    appPath: '/home/.kurspilot/app',
    writeFile: calls[0].writeFile,
  }]);
  assert.strictEqual(result.configuratorShortcutPath, '/home/Applications/Kurspilot konfigurieren.app');
  assert.strictEqual(result.configuratorShortcutWarning, null);
});

// --- isOfflineError -----------------------------------------------------------

test('isOfflineError erkennt typische Netzwerkfehler', () => {
  assert.strictEqual(isOfflineError(new TypeError('fetch failed')), true);
  assert.strictEqual(isOfflineError(new Error('getaddrinfo ENOTFOUND example.test')), true);
  assert.strictEqual(isOfflineError(new Error('Irgendein anderer Fehler')), false);
});
