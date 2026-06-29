'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  provisionApp,
  getKurspilotAppDir,
  APP_TARBALL_URL,
  defaultFetchBuffer,
} = require('../lib/app-provision');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

test('getKurspilotAppDir: macOS/Linux nutzt ~/.kurspilot/app', () => {
  const dir = getKurspilotAppDir({ homeDir: '/Users/lehrkraft', platform: 'darwin' });
  assert.strictEqual(dir, path.join('/Users/lehrkraft', '.kurspilot', 'app'));
});

test('getKurspilotAppDir: Windows nutzt %LOCALAPPDATA%\\Kurspilot\\app', () => {
  const dir = getKurspilotAppDir({
    homeDir: 'C:\\Users\\Lehrkraft',
    platform: 'win32',
    localAppData: 'C:\\Users\\Lehrkraft\\AppData\\Local',
  });
  assert.strictEqual(dir, path.join('C:\\Users\\Lehrkraft\\AppData\\Local', 'Kurspilot', 'app'));
});

test('getKurspilotAppDir: Windows ohne explizites localAppData faellt auf homeDir/AppData/Local zurueck', () => {
  const dir = getKurspilotAppDir({ homeDir: 'C:\\Users\\Lehrkraft', platform: 'win32' });
  assert.strictEqual(
    dir,
    path.join('C:\\Users\\Lehrkraft', 'AppData', 'Local', 'Kurspilot', 'app')
  );
});

test('APP_TARBALL_URL: zeigt auf den main-Branch-Tarball von matthiasgruenwald/Kurspilot', () => {
  assert.ok(APP_TARBALL_URL.includes('github.com/matthiasgruenwald/Kurspilot'));
  assert.ok(APP_TARBALL_URL.includes('main'));
  assert.ok(APP_TARBALL_URL.endsWith('.tar.gz'));
});

test('provisionApp: laedt Tarball und entpackt ihn nach ~/.kurspilot/app (macOS)', async () => {
  const homeDir = '/Users/lehrkraft';
  const expectedDir = path.join(homeDir, '.kurspilot', 'app');
  const tarballBuffer = Buffer.from('fake-tarball-bytes');

  let fetchedUrl = null;
  let extractArgs = null;
  const writtenFiles = {};

  const result = await provisionApp({
    homeDir,
    platform: 'darwin',
    fetch: async (url) => { fetchedUrl = url; return tarballBuffer; },
    extract: async (buffer, destDir) => { extractArgs = { buffer, destDir }; },
    existsSync: (filePath) => Object.prototype.hasOwnProperty.call(writtenFiles, filePath),
    readFile: (filePath) => writtenFiles[filePath],
    writeFile: (filePath, content) => { writtenFiles[filePath] = content; },
    mkdirSync: () => {},
  });

  assert.strictEqual(fetchedUrl, APP_TARBALL_URL);
  assert.strictEqual(extractArgs.destDir, expectedDir);
  assert.deepStrictEqual(extractArgs.buffer, tarballBuffer);
  assert.strictEqual(result.appDir, expectedDir);
  assert.strictEqual(result.updated, true);
});

test('provisionApp: Pfad ist unter Windows %LOCALAPPDATA%\\Kurspilot\\app', async () => {
  const homeDir = 'C:\\Users\\Lehrkraft';
  const localAppData = 'C:\\Users\\Lehrkraft\\AppData\\Local';
  const expectedDir = path.join(localAppData, 'Kurspilot', 'app');
  const writtenFiles = {};

  const result = await provisionApp({
    homeDir,
    platform: 'win32',
    localAppData,
    fetch: async () => Buffer.from('fake-tarball-bytes'),
    extract: async () => {},
    existsSync: (filePath) => Object.prototype.hasOwnProperty.call(writtenFiles, filePath),
    readFile: (filePath) => writtenFiles[filePath],
    writeFile: (filePath, content) => { writtenFiles[filePath] = content; },
    mkdirSync: () => {},
  });

  assert.strictEqual(result.appDir, expectedDir);
});

test('provisionApp: ist idempotent - zweiter Lauf mit identischem Tarball-Inhalt entpackt nicht erneut', async () => {
  const homeDir = '/Users/lehrkraft';
  const tarballBuffer = Buffer.from('same-bytes-every-time');
  const writtenFiles = {};
  let extractCallCount = 0;

  const options = {
    homeDir,
    platform: 'darwin',
    fetch: async () => tarballBuffer,
    extract: async () => { extractCallCount += 1; },
    existsSync: (filePath) => Object.prototype.hasOwnProperty.call(writtenFiles, filePath),
    readFile: (filePath) => writtenFiles[filePath],
    writeFile: (filePath, content) => { writtenFiles[filePath] = content; },
    mkdirSync: () => {},
  };

  const first = await provisionApp(options);
  const second = await provisionApp(options);

  assert.strictEqual(extractCallCount, 1, 'extract darf beim zweiten Lauf mit gleichem Inhalt nicht erneut laufen');
  assert.strictEqual(first.updated, true);
  assert.strictEqual(second.updated, false);
});

test('provisionApp: erkennt geaenderten Tarball-Inhalt und entpackt erneut', async () => {
  const homeDir = '/Users/lehrkraft';
  const writtenFiles = {};
  let callCount = 0;
  let extractCallCount = 0;

  const options = {
    homeDir,
    platform: 'darwin',
    fetch: async () => {
      callCount += 1;
      return Buffer.from(callCount === 1 ? 'version-1' : 'version-2');
    },
    extract: async () => { extractCallCount += 1; },
    existsSync: (filePath) => Object.prototype.hasOwnProperty.call(writtenFiles, filePath),
    readFile: (filePath) => writtenFiles[filePath],
    writeFile: (filePath, content) => { writtenFiles[filePath] = content; },
    mkdirSync: () => {},
  };

  await provisionApp(options);
  const second = await provisionApp(options);

  assert.strictEqual(extractCallCount, 2, 'unterschiedlicher Inhalt muss erneut entpackt werden');
  assert.strictEqual(second.updated, true);
});

test('provisionApp: schreibt einen Hash-Marker, der dem sha256 des Tarball-Inhalts entspricht', async () => {
  const homeDir = '/Users/lehrkraft';
  const tarballBuffer = Buffer.from('marker-check-bytes');
  const writtenFiles = {};

  await provisionApp({
    homeDir,
    platform: 'darwin',
    fetch: async () => tarballBuffer,
    extract: async () => {},
    existsSync: (filePath) => Object.prototype.hasOwnProperty.call(writtenFiles, filePath),
    readFile: (filePath) => writtenFiles[filePath],
    writeFile: (filePath, content) => { writtenFiles[filePath] = content; },
    mkdirSync: () => {},
  });

  const markerPath = path.join(homeDir, '.kurspilot', 'app', '.tarball-sha256');
  assert.strictEqual(writtenFiles[markerPath], sha256(tarballBuffer));
});

test('provisionApp: nutzt Node-globales fetch als Default, statt mit "fetchFn is not a function" zu crashen (#142)', async (t) => {
  const homeDir = '/Users/lehrkraft';
  const tarballBuffer = Buffer.from('global-fetch-bytes');
  let fetchedUrl = null;
  t.mock.method(globalThis, 'fetch', async (url) => {
    fetchedUrl = url;
    return { ok: true, arrayBuffer: async () => tarballBuffer };
  });

  const result = await provisionApp({
    homeDir,
    platform: 'darwin',
    extract: async () => {},
    existsSync: () => false,
    readFile: () => { throw new Error('sollte nicht gelesen werden'); },
    writeFile: () => {},
    mkdirSync: () => {},
  });

  assert.strictEqual(fetchedUrl, APP_TARBALL_URL);
  assert.strictEqual(result.updated, true);
});

test('defaultFetchBuffer: wirft verstaendlichen Fehler bei HTTP-Fehlerstatus statt stillem Erfolg', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404, statusText: 'Not Found' }));

  await assert.rejects(() => defaultFetchBuffer('https://example.test/x'), /404/);
});

test('provisionApp: legt das Zielverzeichnis an, falls es noch nicht existiert', async () => {
  const homeDir = '/Users/lehrkraft';
  const expectedDir = path.join(homeDir, '.kurspilot', 'app');
  let mkdirArgs = null;

  await provisionApp({
    homeDir,
    platform: 'darwin',
    fetch: async () => Buffer.from('bytes'),
    extract: async () => {},
    existsSync: () => false,
    readFile: () => { throw new Error('sollte nicht gelesen werden'); },
    writeFile: () => {},
    mkdirSync: (dir, options) => { mkdirArgs = { dir, options }; },
  });

  assert.strictEqual(mkdirArgs.dir, expectedDir);
  assert.strictEqual(mkdirArgs.options.recursive, true);
});
