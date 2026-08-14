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

const { buildZipBuffer, writeZipFile, assertSafeZipEntryName, readZipEntries } = require('../lib/kurspilot-zip');
const { unzipAvailable } = require('./helpers/unzip-available');
const zlib = require('node:zlib');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-zip-test-'));
}

const HAS_UNZIP = unzipAvailable();

/**
 * Baut ein minimales STORE-ZIP mit genau einem Eintrag komplett unabhaengig
 * von buildZipBuffer/assertSafeZipEntryName - fuer boesartige Testfaelle
 * (Traversal, Symlink-Attribute, kaputte Pruefsumme), die die produktive
 * Schreibfunktion absichtlich verweigert.
 *
 * @param {{name: string, data: Buffer, externalAttributes?: number, crc32Override?: number}} entry
 * @returns {Buffer}
 */
function buildRawSingleEntryZip({ name, data, externalAttributes = 0o100644 << 16, crc32Override }) {
  const nameBuffer = Buffer.from(name, 'utf8');
  const crc32 = crc32Override !== undefined ? crc32Override : zlib.crc32(data) >>> 0;

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc32, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const localSection = Buffer.concat([localHeader, nameBuffer, data]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc32, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(externalAttributes >>> 0, 38);
  centralHeader.writeUInt32LE(0, 42);

  const centralSection = Buffer.concat([centralHeader, nameBuffer]);

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralSection.length, 12);
  endRecord.writeUInt32LE(localSection.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localSection, centralSection, endRecord]);
}

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

test('readZipEntries: liest ein mit writeZipFile geschriebenes Archiv unveraendert zurueck', () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'roundtrip.zip');
  const binaryData = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x10, 0x20, 0x30]);

  writeZipFile(
    [
      { name: 'manifest.md', data: Buffer.from('# Manifest\n\nHallo Welt äöüß\n', 'utf8') },
      { name: 'ordner/unterordner/datei.txt', data: Buffer.from('Inhalt einer Textdatei', 'utf8') },
      { name: 'bild.bin', data: binaryData },
    ],
    zipPath
  );

  const entries = readZipEntries(zipPath);
  const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry.data]));

  assert.strictEqual(entries.length, 3);
  assert.strictEqual(byName['manifest.md'].toString('utf8'), '# Manifest\n\nHallo Welt äöüß\n');
  assert.strictEqual(byName['ordner/unterordner/datei.txt'].toString('utf8'), 'Inhalt einer Textdatei');
  assert.deepStrictEqual(byName['bild.bin'], binaryData);
});

test('readZipEntries: weist eine abgeschnittene/beschaedigte Datei ab', () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'beschaedigt.zip');
  writeZipFile([{ name: 'a.txt', data: Buffer.from('Inhalt') }], zipPath);

  const truncated = fs.readFileSync(zipPath).subarray(0, 10);
  fs.writeFileSync(zipPath, truncated);

  assert.throws(() => readZipEntries(zipPath), /beschaedigt/);
});

test('readZipEntries: weist eine leere/keine ZIP-Datei ab', () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'leer.zip');
  fs.writeFileSync(zipPath, 'kein zip');

  assert.throws(() => readZipEntries(zipPath), /beschaedigt/);
});

test('readZipEntries: weist einen Eintrag mit Pfadtraversierung ab, bevor irgendetwas entpackt wird', () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'traversal.zip');
  fs.writeFileSync(zipPath, buildRawSingleEntryZip({ name: '../ausserhalb.txt', data: Buffer.from('boese') }));

  assert.throws(() => readZipEntries(zipPath), /Pfadabschnitt|absoluter Pfad/);
});

test('readZipEntries: weist einen Eintrag mit absolutem Pfad ab', () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'absolut.zip');
  fs.writeFileSync(zipPath, buildRawSingleEntryZip({ name: '/etc/passwd', data: Buffer.from('boese') }));

  assert.throws(() => readZipEntries(zipPath), /absoluter Pfad/);
});

test('readZipEntries: weist einen Eintrag mit Symlink-Attribut (externes Linkziel) ab', () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'symlink.zip');
  // Unix-Modus S_IFLNK (0xA000) in den oberen 16 Bit der externen Attribute,
  // wie es "echte" ZIP-Symlink-Eintraege (z.B. von `zip -y`) setzen.
  const symlinkExternalAttributes = (0xa1ff << 16) >>> 0;
  fs.writeFileSync(
    zipPath,
    buildRawSingleEntryZip({
      name: 'verweis.txt',
      data: Buffer.from('/etc/passwd'),
      externalAttributes: symlinkExternalAttributes,
    })
  );

  assert.throws(() => readZipEntries(zipPath), /Verweis \(Symlink\)/);
});

test('readZipEntries: weist einen Eintrag mit manipulierter Pruefsumme ab', () => {
  const dir = makeTmpDir();
  const zipPath = path.join(dir, 'crc.zip');
  fs.writeFileSync(
    zipPath,
    buildRawSingleEntryZip({ name: 'a.txt', data: Buffer.from('Inhalt'), crc32Override: 0xdeadbeef })
  );

  assert.throws(() => readZipEntries(zipPath), /Pruefsumme/);
});
