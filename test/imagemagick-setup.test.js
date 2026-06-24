'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isImageMagickInstalled, installImageMagickWindows, WINGET_PACKAGE_ID } = require('../lib/imagemagick-setup');

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

test('installImageMagickWindows: ruft winget mit erwarteten Argumenten auf und meldet Erfolg', () => {
  const calls = [];
  const result = installImageMagickWindows({
    platform: 'win32',
    execFileSync: (command, args) => {
      calls.push({ command, args });
      return '';
    },
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.strictEqual(calls[0].command, 'winget');
  assert.deepStrictEqual(calls[0].args, [
    'install',
    '--id', WINGET_PACKAGE_ID,
    '-e',
    '--accept-package-agreements',
    '--accept-source-agreements',
    '--silent',
  ]);
});

test('installImageMagickWindows: meldet Fehler, wenn winget fehlschlaegt', () => {
  const result = installImageMagickWindows({
    platform: 'win32',
    execFileSync: () => {
      throw new Error('winget nicht gefunden');
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /winget nicht gefunden/);
});

test('installImageMagickWindows: meldet auf Nicht-Windows-Plattformen nicht-unterstuetzt, ohne winget aufzurufen', () => {
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
