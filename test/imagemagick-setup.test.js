'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  isImageMagickInstalled,
  installImageMagickWindows,
  installImageMagick,
  getKurspilotImageMagickDir,
  IMAGEMAGICK_DOWNLOAD_TABLE,
  WINDOWS_PORTABLE_ZIP_URL,
} = require('../lib/imagemagick-setup');

test('isImageMagickInstalled: true, wenn "magick -version" ohne Fehler laeuft', () => {
  const calls = [];
  const result = isImageMagickInstalled({
    execFileSync: (command, args) => {
      calls.push({ command, args });
      return 'Version: ImageMagick 7.1.1-39\n';
    },
  });

  assert.strictEqual(result, true);
  assert.deepStrictEqual(calls, [{ command: 'magick', args: ['-version'] }]);
});

test('isImageMagickInstalled: false, wenn "magick" fehlschlaegt oder fehlt', () => {
  const result = isImageMagickInstalled({
    execFileSync: () => {
      throw new Error('magick ist nicht gefunden');
    },
  });

  assert.strictEqual(result, false);
});

test('installImageMagickWindows: laedt das portable Zip per PowerShell ohne winget/UAC und meldet Erfolg', () => {
  const calls = [];
  const result = installImageMagickWindows({
    platform: 'win32',
    homeDir: 'C:\\Users\\Lehrkraft',
    localAppData: 'C:\\Users\\Lehrkraft\\AppData\\Local',
    execFileSync: (command, args) => {
      calls.push({ command, args });
      return '';
    },
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.strictEqual(calls[0].command, 'powershell.exe');
  assert.ok(calls[0].args.includes('-NoProfile'));
  const psCommand = calls[0].args[calls[0].args.length - 1];
  assert.match(psCommand, /Invoke-WebRequest/);
  assert.match(psCommand, /Expand-Archive/);
  assert.ok(psCommand.includes(WINDOWS_PORTABLE_ZIP_URL), 'muss die portable Zip-URL nutzen (kein winget/UAC)');
});

test('installImageMagickWindows: meldet Fehler, wenn der PowerShell-Download fehlschlaegt', () => {
  const result = installImageMagickWindows({
    platform: 'win32',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: () => {
      throw new Error('Download fehlgeschlagen');
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /Download fehlgeschlagen/);
});

test('installImageMagickWindows: gibt echten PowerShell-stderr statt nur "Command failed" weiter (Issue #129)', () => {
  const result = installImageMagickWindows({
    platform: 'win32',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: () => {
      const err = new Error('Command failed: powershell.exe -NoProfile -Command ...');
      err.stderr = Buffer.from('Invoke-WebRequest : Der Remoteserver hat einen Fehler zurueckgegeben: (403) Verboten.\n');
      throw err;
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /403/);
  assert.doesNotMatch(result.error, /Command failed/);
});

test('installImageMagickWindows: meldet auf Nicht-Windows-Plattformen nicht-unterstuetzt, ohne PowerShell aufzurufen', () => {
  let called = false;
  const result = installImageMagickWindows({
    platform: 'darwin',
    execFileSync: () => {
      called = true;
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /nur unter Windows/);
  assert.strictEqual(called, false);
});

// --- installImageMagick: arch-erkennend, OS-uebergreifend -------------------

test('installImageMagick: erkennt vorhandene Installation plattformuebergreifend und installiert nicht erneut', () => {
  let execCalled = false;
  let fetchCalled = false;
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    execFileSync: () => {
      execCalled = true;
      return 'Version: ImageMagick 7.1.1-39\n';
    },
    fetch: async () => { fetchCalled = true; return Buffer.from(''); },
    extract: async () => {},
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.strictEqual(execCalled, true, 'muss magick -version pruefen');
  assert.strictEqual(fetchCalled, false, 'darf bei vorhandener Installation nicht laden');
});

test('installImageMagick: Windows x64 laedt das portable Zip per PowerShell (kein winget/UAC)', () => {
  let calls = [];
  const result = installImageMagick({
    platform: 'win32',
    arch: 'x64',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: (command, args) => {
      if (command === 'magick') throw new Error('nicht gefunden');
      calls.push({ command, args });
      return '';
    },
    fetch: async () => Buffer.from(''),
    extract: async () => {},
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.strictEqual(calls[0].command, 'powershell.exe');
  const psCommand = calls[0].args[calls[0].args.length - 1];
  assert.ok(psCommand.includes(WINDOWS_PORTABLE_ZIP_URL));
});

test('installImageMagick: Windows arm64 nutzt portables Zip aus der Datentabelle', async () => {
  const homeDir = 'C:\\Users\\Lehrkraft';
  const localAppData = 'C:\\Users\\Lehrkraft\\AppData\\Local';
  const expectedDir = getKurspilotImageMagickDir({ homeDir, platform: 'win32', localAppData });

  let fetchedUrl = null;
  let extractArgs = null;

  const result = await installImageMagick({
    platform: 'win32',
    arch: 'arm64',
    homeDir,
    localAppData,
    execFileSync: () => { throw new Error('magick nicht gefunden'); },
    fetch: async (url) => { fetchedUrl = url; return Buffer.from('zip-bytes'); },
    extract: async (buffer, destDir, archiveType) => { extractArgs = { buffer, destDir, archiveType }; },
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.ok(fetchedUrl, 'muss von der Datentabelle-URL laden');
  assert.strictEqual(extractArgs.destDir, expectedDir);
});

test('installImageMagick: macOS (arm64 oder x64) ohne stabile Bezugsquelle degradiert sauber mit Fehlermeldung statt zu crashen', async () => {
  let execCalled = false;
  const result = await installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    homeDir: '/Users/lehrkraft',
    execFileSync: () => { execCalled = true; throw new Error('magick nicht gefunden'); },
    fetch: async () => { throw new Error('fetch sollte nicht aufgerufen werden'); },
    extract: async () => { throw new Error('extract sollte nicht aufgerufen werden'); },
  });

  assert.strictEqual(execCalled, true);
  assert.strictEqual(result.installed, false);
  assert.ok(result.error, 'muss verstaendliche Fehlermeldung liefern statt zu crashen');
  assert.match(result.error, /macOS/);
});

test('installImageMagick: Linux ist als Tabelleneintrag vorbereitet (AppImage), aber nicht aktiv getestet', () => {
  assert.ok(IMAGEMAGICK_DOWNLOAD_TABLE['linux-x64'], 'Linux-x64-Eintrag muss in der Datentabelle vorbereitet sein');
  assert.strictEqual(IMAGEMAGICK_DOWNLOAD_TABLE['linux-x64'].method, 'appimage');
});

test('installImageMagick: unbekannte OS+Arch-Kombination meldet Fehler statt zu crashen', async () => {
  const result = await installImageMagick({
    platform: 'sunos',
    arch: 'sparc',
    homeDir: '/home/lehrkraft',
    execFileSync: () => { throw new Error('magick nicht gefunden'); },
    fetch: async () => Buffer.from(''),
    extract: async () => {},
  });

  assert.strictEqual(result.installed, false);
  assert.ok(result.error);
});

test('installImageMagick: meldet Fehler, wenn der PowerShell-Download fehlschlaegt (Windows)', () => {
  const result = installImageMagick({
    platform: 'win32',
    arch: 'x64',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: (command) => {
      if (command === 'magick') throw new Error('nicht gefunden');
      throw new Error('Download fehlgeschlagen');
    },
    fetch: async () => Buffer.from(''),
    extract: async () => {},
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /Download fehlgeschlagen/);
});

test('getKurspilotImageMagickDir: macOS/Linux nutzt ~/.kurspilot/imagemagick', () => {
  const dir = getKurspilotImageMagickDir({ homeDir: '/Users/lehrkraft', platform: 'darwin' });
  assert.strictEqual(dir, path.join('/Users/lehrkraft', '.kurspilot', 'imagemagick'));
});

test('getKurspilotImageMagickDir: Windows nutzt %LOCALAPPDATA%\\Kurspilot\\imagemagick', () => {
  const dir = getKurspilotImageMagickDir({
    homeDir: 'C:\\Users\\Lehrkraft',
    platform: 'win32',
    localAppData: 'C:\\Users\\Lehrkraft\\AppData\\Local',
  });
  assert.strictEqual(dir, path.join('C:\\Users\\Lehrkraft\\AppData\\Local', 'Kurspilot', 'imagemagick'));
});
