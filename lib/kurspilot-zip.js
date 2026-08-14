/**
 * kurspilot-zip.js
 *
 * Minimaler, gekapselter ZIP-Writer ohne Shell-Aufruf und ohne
 * Laufzeit-Dependency (siehe CLAUDE.md: keine npm-Laufzeit-Dependencies;
 * docs/specs/0011, Implementation Decisions: "Das Paketmodul erstellt
 * ZIP-Dateien ueber eine gekapselte, plattformunabhaengige
 * Archiv-Implementierung. Es benutzt keine Shell-ZIP-Befehle und erhaelt
 * Dateinamen sowie Binaerdateien unveraendert.").
 *
 * Schreibt ausschliesslich unkomprimierte ("STORE") Eintraege: Das reicht
 * fuer ein von Standard-Tools (unzip, Archive Utility, Windows Explorer)
 * lesbares Archiv, ohne eine Deflate-Implementierung selbst schreiben zu
 * muessen (ponytail/YAGNI). CRC32 kommt aus node:zlib.crc32 (verfuegbar ab
 * Node 22+, siehe CLAUDE.md fuer die Mindestversion).
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');

const ZIP_VERSION_NEEDED = 20;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

/**
 * Lehnt Eintragsnamen ab, die Pfadtraversierung oder unzulaessige Pfade in
 * ein Archiv einschleusen koennten (AC "Traversal oder unzulaessige Pfade
 * gelangen nicht ins Archiv"). ZIP-Eintragsnamen sind laut Format immer
 * "/"-getrennt, unabhaengig vom Host-Betriebssystem.
 *
 * @param {string} name
 */
function assertSafeZipEntryName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('ZIP-Eintragsname darf nicht leer sein.');
  }
  if (name.includes('\\')) {
    throw new Error(`ZIP-Eintragsname darf keine Backslashes enthalten: "${name}"`);
  }
  if (path.posix.isAbsolute(name) || name.startsWith('/')) {
    throw new Error(`ZIP-Eintragsname darf kein absoluter Pfad sein: "${name}"`);
  }
  const segments = name.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new Error(`ZIP-Eintragsname enthaelt einen unzulaessigen Pfadabschnitt: "${name}"`);
  }
}

function dosDateTimeFor(date) {
  const d = date || new Date();
  const dosTime =
    ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Baut den vollstaendigen ZIP-Inhalt (STORE, unkomprimiert) fuer eine Liste
 * von Eintraegen im Speicher auf.
 *
 * @param {{name: string, data: Buffer}[]} entries
 * @param {{date?: Date}} [options]
 * @returns {Buffer}
 */
function buildZipBuffer(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('ZIP-Archiv braucht mindestens einen Eintrag.');
  }

  const { dosTime, dosDate } = dosDateTimeFor(options.date);
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    assertSafeZipEntryName(entry.name);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const crc32 = zlib.crc32(data) >>> 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(0, 8); // compression method: 0 = store
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localChunks.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    centralHeader.writeUInt16LE(ZIP_VERSION_NEEDED, 4); // version made by
    centralHeader.writeUInt16LE(ZIP_VERSION_NEEDED, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
    centralHeader.writeUInt16LE(0, 10); // compression method
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc32, 16);
    centralHeader.writeUInt32LE(data.length, 20); // compressed size
    centralHeader.writeUInt32LE(data.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // file comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external file attributes (unix -rw-r--r--)
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralChunks.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const localSection = Buffer.concat(localChunks);
  const centralSection = Buffer.concat(centralChunks);

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endRecord.writeUInt16LE(0, 4); // number of this disk
  endRecord.writeUInt16LE(0, 6); // disk where central directory starts
  endRecord.writeUInt16LE(entries.length, 8); // records on this disk
  endRecord.writeUInt16LE(entries.length, 10); // total records
  endRecord.writeUInt32LE(centralSection.length, 12); // size of central directory
  endRecord.writeUInt32LE(localSection.length, 16); // offset of central directory
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localSection, centralSection, endRecord]);
}

/**
 * Schreibt ein ZIP-Archiv aus `entries` nach `outputPath`.
 *
 * @param {{name: string, data: Buffer}[]} entries
 * @param {string} outputPath
 * @param {{date?: Date}} [options]
 */
function writeZipFile(entries, outputPath, options = {}) {
  const buffer = buildZipBuffer(entries, options);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

module.exports = {
  assertSafeZipEntryName,
  buildZipBuffer,
  writeZipFile,
};
