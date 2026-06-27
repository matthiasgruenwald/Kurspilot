'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  resolveNodeBinary,
  getKurspilotNodeDir,
  NODE_DOWNLOAD_TABLE,
} = require('../lib/node-provision');

function fakeFetch(buffer) {
  return async () => buffer;
}

test('resolveNodeBinary: nutzt vorhandenes Kurspilot-Node ohne erneut zu laden (macOS)', async () => {
  const homeDir = '/Users/lehrkraft';
  const expectedDir = path.join(homeDir, '.kurspilot', 'node');
  const expectedBinary = path.join(expectedDir, 'bin', 'node');

  let fetchCalled = false;
  let extractCalled = false;

  const result = await resolveNodeBinary({
    homeDir,
    platform: 'darwin',
    arch: 'arm64',
    pathEnv: '',
    existsSync: filePath => filePath === expectedBinary,
    fetch: async () => { fetchCalled = true; return Buffer.from(''); },
    extract: async () => { extractCalled = true; },
  });

  assert.strictEqual(result.binaryPath, expectedBinary);
  assert.strictEqual(result.source, 'kurspilot');
  assert.strictEqual(fetchCalled, false);
  assert.strictEqual(extractCalled, false);
});

test('resolveNodeBinary: nutzt vorhandenes Kurspilot-Node ohne erneut zu laden (Windows)', async () => {
  const homeDir = 'C:\\Users\\Lehrkraft';
  const localAppData = 'C:\\Users\\Lehrkraft\\AppData\\Local';
  const expectedDir = path.join(localAppData, 'Kurspilot', 'node');
  const expectedBinary = path.join(expectedDir, 'node.exe');

  let fetchCalled = false;

  const result = await resolveNodeBinary({
    homeDir,
    platform: 'win32',
    arch: 'x64',
    pathEnv: '',
    localAppData,
    existsSync: filePath => filePath === expectedBinary,
    fetch: async () => { fetchCalled = true; return Buffer.from(''); },
    extract: async () => {},
  });

  assert.strictEqual(result.binaryPath, expectedBinary);
  assert.strictEqual(result.source, 'kurspilot');
  assert.strictEqual(fetchCalled, false);
});

test('resolveNodeBinary: nutzt System-Node auf PATH, wenn kein Kurspilot-Node existiert und Version >=18', async () => {
  const homeDir = '/Users/lehrkraft';
  const systemNodePath = '/usr/local/bin/node';

  let fetchCalled = false;

  const result = await resolveNodeBinary({
    homeDir,
    platform: 'darwin',
    arch: 'arm64',
    pathEnv: '/usr/local/bin:/usr/bin',
    existsSync: filePath => filePath === systemNodePath,
    isExecutable: filePath => filePath === systemNodePath,
    getSystemNodeVersion: () => 'v20.11.0',
    fetch: async () => { fetchCalled = true; return Buffer.from(''); },
    extract: async () => {},
  });

  assert.strictEqual(result.binaryPath, systemNodePath);
  assert.strictEqual(result.source, 'system');
  assert.strictEqual(fetchCalled, false);
});

test('resolveNodeBinary: ignoriert System-Node, wenn Version < 18, und laedt Tarball', async () => {
  const homeDir = '/Users/lehrkraft';
  const systemNodePath = '/usr/local/bin/node';
  const kurspilotBinary = path.join(homeDir, '.kurspilot', 'node', 'bin', 'node');

  let fetchedUrl = null;
  let extracted = false;

  const result = await resolveNodeBinary({
    homeDir,
    platform: 'darwin',
    arch: 'arm64',
    pathEnv: '/usr/local/bin',
    existsSync: filePath => filePath === systemNodePath,
    isExecutable: filePath => filePath === systemNodePath,
    getSystemNodeVersion: () => 'v16.2.0',
    fetch: async (url) => { fetchedUrl = url; return Buffer.from('tarball-bytes'); },
    extract: async () => { extracted = true; },
  });

  assert.ok(fetchedUrl, 'fetch sollte fuer Tarball-Download aufgerufen werden');
  assert.strictEqual(extracted, true);
  assert.strictEqual(result.binaryPath, kurspilotBinary);
  assert.strictEqual(result.source, 'downloaded');
});

test('resolveNodeBinary: laedt und entpackt Tarball architektur-passend, wenn weder Kurspilot- noch System-Node existieren (macOS arm64)', async () => {
  const homeDir = '/Users/lehrkraft';
  const targetDir = path.join(homeDir, '.kurspilot', 'node');

  let fetchedUrl = null;
  let extractArgs = null;

  const result = await resolveNodeBinary({
    homeDir,
    platform: 'darwin',
    arch: 'arm64',
    pathEnv: '',
    existsSync: () => false,
    fetch: async (url) => { fetchedUrl = url; return Buffer.from('tarball-bytes'); },
    extract: async (buffer, destDir) => { extractArgs = { buffer, destDir }; },
  });

  assert.ok(fetchedUrl.includes('darwin-arm64'));
  assert.strictEqual(extractArgs.destDir, targetDir);
  assert.strictEqual(result.source, 'downloaded');
  assert.strictEqual(result.binaryPath, path.join(targetDir, 'bin', 'node'));
});

test('resolveNodeBinary: laedt Tarball architektur-passend fuer macOS x64', async () => {
  let fetchedUrl = null;

  await resolveNodeBinary({
    homeDir: '/Users/lehrkraft',
    platform: 'darwin',
    arch: 'x64',
    pathEnv: '',
    existsSync: () => false,
    fetch: async (url) => { fetchedUrl = url; return Buffer.from('x'); },
    extract: async () => {},
  });

  assert.ok(fetchedUrl.includes('darwin-x64'));
});

test('resolveNodeBinary: laedt Tarball architektur-passend fuer Windows x64', async () => {
  let fetchedUrl = null;
  const homeDir = 'C:\\Users\\Lehrkraft';
  const localAppData = 'C:\\Users\\Lehrkraft\\AppData\\Local';

  const result = await resolveNodeBinary({
    homeDir,
    platform: 'win32',
    arch: 'x64',
    pathEnv: '',
    localAppData,
    existsSync: () => false,
    fetch: async (url) => { fetchedUrl = url; return Buffer.from('x'); },
    extract: async () => {},
  });

  assert.ok(fetchedUrl.includes('win-x64'));
  assert.strictEqual(
    result.binaryPath,
    path.join(localAppData, 'Kurspilot', 'node', 'node.exe')
  );
});

test('resolveNodeBinary: laedt Tarball architektur-passend fuer Windows arm64', async () => {
  let fetchedUrl = null;

  await resolveNodeBinary({
    homeDir: 'C:\\Users\\Lehrkraft',
    platform: 'win32',
    arch: 'arm64',
    pathEnv: '',
    localAppData: 'C:\\Users\\Lehrkraft\\AppData\\Local',
    existsSync: () => false,
    fetch: async (url) => { fetchedUrl = url; return Buffer.from('x'); },
    extract: async () => {},
  });

  assert.ok(fetchedUrl.includes('win-arm64'));
});

test('resolveNodeBinary: wirft verstaendlichen Fehler bei unbekannter OS+Arch-Kombination', async () => {
  await assert.rejects(
    () => resolveNodeBinary({
      homeDir: '/home/lehrkraft',
      platform: 'linux',
      arch: 'arm64',
      pathEnv: '',
      existsSync: () => false,
      fetch: fakeFetch(Buffer.from('')),
      extract: async () => {},
    }),
    /nicht unterstuetzt|not supported/i
  );
});

test('NODE_DOWNLOAD_TABLE: ist eine Datentabelle (Objekt) mit allen vier Zielen', () => {
  assert.strictEqual(typeof NODE_DOWNLOAD_TABLE, 'object');
  const keys = Object.keys(NODE_DOWNLOAD_TABLE);
  assert.ok(keys.includes('darwin-arm64'));
  assert.ok(keys.includes('darwin-x64'));
  assert.ok(keys.includes('win32-x64'));
  assert.ok(keys.includes('win32-arm64'));
});

test('getKurspilotNodeDir: macOS/Linux nutzt ~/.kurspilot/node', () => {
  const dir = getKurspilotNodeDir({ homeDir: '/Users/lehrkraft', platform: 'darwin' });
  assert.strictEqual(dir, path.join('/Users/lehrkraft', '.kurspilot', 'node'));
});

test('getKurspilotNodeDir: Windows nutzt %LOCALAPPDATA%\\Kurspilot\\node', () => {
  const dir = getKurspilotNodeDir({
    homeDir: 'C:\\Users\\Lehrkraft',
    platform: 'win32',
    localAppData: 'C:\\Users\\Lehrkraft\\AppData\\Local',
  });
  assert.strictEqual(dir, path.join('C:\\Users\\Lehrkraft\\AppData\\Local', 'Kurspilot', 'node'));
});
