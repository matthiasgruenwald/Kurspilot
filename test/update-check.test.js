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

test('checkAppUpdate meldet kein Update, wenn Tarball-Hash mit gespeichertem Marker uebereinstimmt', async () => {
  const crypto = require('node:crypto');
  const content = Buffer.from('gleicher-inhalt');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  const result = await checkAppUpdate({
    fetch: async () => content,
    existsSync: () => true,
    readFile: () => hash,
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
  const result = await applyAppUpdate({
    provisionApp: async options => {
      calls.push(options);
      return { appDir: '/home/.kurspilot/app', updated: true };
    },
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
  assert.strictEqual(result.error, null);
});

test('applyAppUpdate meldet verstaendliche Offline-Meldung, wenn provisionApp wegen Netzfehler scheitert', async () => {
  const result = await applyAppUpdate({
    provisionApp: async () => {
      throw new TypeError('fetch failed');
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /[Vv]erbindung/);
});

test('applyAppUpdate installiert Skills fuer beide Anbieter aus dem frisch entpackten appDir', async () => {
  const calls = [];
  const result = await applyAppUpdate({
    provisionApp: async () => ({ appDir: '/home/.kurspilot/app', updated: true }),
    installSkillsForProvider: (repoRoot, providerRoot, targetRoot) => {
      calls.push({ repoRoot, providerRoot, targetRoot });
      return { aborted: false, written: [], unchanged: [], conflicts: [], conflictPrompts: [], warnings: [] };
    },
    homeDir: '/home',
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(calls.length, 2);
  assert.ok(calls.some(call => call.targetRoot === '/home/.codex/skills'));
  assert.ok(calls.some(call => call.targetRoot === '/home/.claude/skills'));
  assert.strictEqual(result.skillInstallAborted, false);
});

test('applyAppUpdate gibt Skillname und fertigen Copy-Paste-Prompt bei Skill-Konflikt weiter', async () => {
  const result = await applyAppUpdate({
    provisionApp: async () => ({ appDir: '/home/.kurspilot/app', updated: true }),
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
  });

  assert.strictEqual(result.skillInstallAborted, true);
  assert.strictEqual(result.skillInstallConflictPrompts.length, 2);
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

// --- isOfflineError -----------------------------------------------------------

test('isOfflineError erkennt typische Netzwerkfehler', () => {
  assert.strictEqual(isOfflineError(new TypeError('fetch failed')), true);
  assert.strictEqual(isOfflineError(new Error('getaddrinfo ENOTFOUND example.test')), true);
  assert.strictEqual(isOfflineError(new Error('Irgendein anderer Fehler')), false);
});
