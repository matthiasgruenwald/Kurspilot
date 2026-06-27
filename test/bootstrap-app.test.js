'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { bootstrapApp } = require('../scripts/bootstrap-app');

test('bootstrapApp: provisioniert die App und startet setup-kurspilot.js im entpackten Verzeichnis', async () => {
  const homeDir = '/Users/lehrkraft';
  const expectedAppDir = path.join(homeDir, '.kurspilot', 'app');
  const writtenFiles = {};

  let fetchedUrl = null;
  let extractArgs = null;
  let spawnedAppDir = null;

  const result = await bootstrapApp({
    homeDir,
    platform: 'darwin',
    fetch: async (url) => { fetchedUrl = url; return Buffer.from('fake-tarball-bytes'); },
    extract: async (buffer, destDir) => { extractArgs = { buffer, destDir }; },
    existsSync: (filePath) => Object.prototype.hasOwnProperty.call(writtenFiles, filePath),
    readFile: (filePath) => writtenFiles[filePath],
    writeFile: (filePath, content) => { writtenFiles[filePath] = content; },
    mkdirSync: () => {},
    spawnSetup: (appDir) => { spawnedAppDir = appDir; },
  });

  assert.ok(fetchedUrl, 'fetch sollte fuer den App-Tarball aufgerufen werden');
  assert.strictEqual(extractArgs.destDir, expectedAppDir);
  assert.strictEqual(result.appDir, expectedAppDir);
  assert.strictEqual(spawnedAppDir, expectedAppDir, 'setup-kurspilot.js muss im entpackten App-Verzeichnis gestartet werden');
});

test('bootstrapApp: ruft spawnSetup nicht auf, falls provisionApp wirft', async () => {
  let spawnCalled = false;

  await assert.rejects(
    () => bootstrapApp({
      homeDir: '/Users/lehrkraft',
      platform: 'darwin',
      fetch: async () => { throw new Error('Netzwerkfehler (simuliert)'); },
      extract: async () => {},
      existsSync: () => false,
      readFile: () => { throw new Error('sollte nicht gelesen werden'); },
      writeFile: () => {},
      mkdirSync: () => {},
      spawnSetup: () => { spawnCalled = true; },
    }),
    /Netzwerkfehler/
  );

  assert.strictEqual(spawnCalled, false);
});

test('bootstrapApp: Windows-Pfad nutzt %LOCALAPPDATA%\\Kurspilot\\app als Arbeitsverzeichnis fuer den Folgeprozess', async () => {
  const homeDir = 'C:\\Users\\Lehrkraft';
  const localAppData = 'C:\\Users\\Lehrkraft\\AppData\\Local';
  const expectedAppDir = path.join(localAppData, 'Kurspilot', 'app');

  let spawnedAppDir = null;

  await bootstrapApp({
    homeDir,
    platform: 'win32',
    localAppData,
    fetch: async () => Buffer.from('fake-tarball-bytes'),
    extract: async () => {},
    existsSync: () => false,
    readFile: () => { throw new Error('sollte nicht gelesen werden'); },
    writeFile: () => {},
    mkdirSync: () => {},
    spawnSetup: (appDir) => { spawnedAppDir = appDir; },
  });

  assert.strictEqual(spawnedAppDir, expectedAppDir);
});
