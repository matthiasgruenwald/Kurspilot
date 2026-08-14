'use strict';

/**
 * Tests fuer lib/kurspilot-zip.js. Verifiziert den ZIP-Inhalt durch
 * unabhaengiges Auslesen mit dem System-`unzip` statt durch Mocken der
 * Archiv-Implementierung (siehe docs/specs/0011, Testing Decisions).
 * `unzip` ist nur eine Test-Abhaengigkeit, keine Laufzeit-Dependency des
 * Projekts (siehe CLAUDE.md).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { buildZipBuffer, writeZipFile, assertSafeZipEntryName } = require('../lib/kurspilot-zip');
const { unzipAvailable } = require('./helpers/unzip-available');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-zip-test-'));
}

const HAS_UNZIP = unzipAvailable();

test('assertSafeZipEntryName: lehnt Traversal, absolute und Backslash-Pfade ab', () => {
  assert.throws(() => assertSafeZipEntryName('../ausserhalb.txt'), /Pfadabschnitt/);
  assert.throws(() => assertSafeZipEntryName('a/../../b.txt'), /Pfadabschnitt/);
  assert.throws(() => assertSafeZipEntryName('/etc/passwd'), /absoluter Pfad/);
  assert.throws(() => assertSafeZipEntryName('a\\b.txt'), /Backslashes/);
  assert.throws(() => assertSafeZipEntryName(''), /leer/);
  assert.doesNotThrow(() => assertSafeZipEntryName('ordner/datei.md'));
});

test('buildZipBuffer: verweigert ein leeres Archiv', () => {
  assert.throws(() => buildZipBuffer([]), /mindestens einen Eintrag/);
});

test('writeZipFile: schreibt ein von unzip lesbares Archiv mit unveraendertem Inhalt', { skip: !HAS_UNZIP && 'unzip nicht verfuegbar' }, () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'paket.zip');
  const binaryData = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x10, 0x20, 0x30]);

  writeZipFile(
    [
      { name: 'manifest.md', data: Buffer.from('# Manifest\n\nHallo Welt äöüß\n', 'utf8') },
      { name: 'ordner/unterordner/datei.txt', data: Buffer.from('Inhalt einer Textdatei', 'utf8') },
      { name: 'bild.bin', data: binaryData },
    ],
    zipPath
  );

  assert.ok(fs.existsSync(zipPath));

  const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
  assert.match(listing, /manifest\.md/);
  assert.match(listing, /ordner\/unterordner\/datei\.txt/);
  assert.match(listing, /bild\.bin/);

  const manifestContent = execFileSync('unzip', ['-p', zipPath, 'manifest.md']);
  assert.strictEqual(manifestContent.toString('utf8'), '# Manifest\n\nHallo Welt äöüß\n');

  const binaryContent = execFileSync('unzip', ['-p', zipPath, 'bild.bin']);
  assert.deepStrictEqual(binaryContent, binaryData);

  // "unzip -t" prueft u.a. die CRC32-Pruefsumme jedes Eintrags.
  const testOutput = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
  assert.match(testOutput, /No errors detected/);
});

test('writeZipFile: mkdir noetig? nein - Parent muss bereits existieren, aber Datei selbst wird neu angelegt', () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'nested.zip');

  writeZipFile([{ name: 'a.txt', data: Buffer.from('a') }], zipPath);

  assert.ok(fs.existsSync(zipPath));
});
