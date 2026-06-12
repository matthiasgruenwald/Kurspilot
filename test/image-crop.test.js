'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const { cropImage, isImageMagickAvailable } = require('../lib/image-crop');

const SKIP_REASON = 'ImageMagick ("convert") ist auf diesem System nicht installiert (siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md)';
const hasImageMagick = isImageMagickAvailable();

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'image-crop-test-'));
}

/**
 * Erzeugt eine winzige unkomprimierte RGB-PNG-Datei mit der angegebenen
 * Groesse als Test-Fixture, ohne externe Tools/Binaries.
 */
function writeTestPng(filePath, width, height) {
  const bytesPerPixel = 3;
  const raw = Buffer.alloc(height * (1 + width * bytesPerPixel));
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      raw[pos++] = (x * 251) % 256;
      raw[pos++] = (y * 251) % 256;
      raw[pos++] = 100;
    }
  }
  const idat = zlib.deflateSync(raw);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(filePath, png);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Liest Breite/Hoehe einer PNG-Datei aus dem IHDR-Chunk. */
function readPngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  // IHDR beginnt bei Byte 16 (8 Signatur + 4 Laenge + 4 Typ), Breite/Hoehe je 4 Byte
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

test(
  'cropImage: schneidet Bereich aus und schreibt PNG mit erwarteter Groesse',
  { skip: !hasImageMagick && SKIP_REASON },
  () => {
    const dir = makeTmpDir();
    const sourcePath = path.join(dir, 'source.png');
    const destPath = path.join(dir, 'crop.png');

    writeTestPng(sourcePath, 10, 10);

    cropImage(sourcePath, { x: 2, y: 1, width: 4, height: 3 }, destPath);

    assert.ok(fs.existsSync(destPath), 'Zieldatei wurde nicht erzeugt');

    const size = readPngSize(destPath);
    assert.strictEqual(size.width, 4);
    assert.strictEqual(size.height, 3);
  }
);

test(
  'cropImage: wirft Fehler, wenn Quelldatei nicht existiert',
  { skip: !hasImageMagick && SKIP_REASON },
  () => {
    const dir = makeTmpDir();
    const sourcePath = path.join(dir, 'does-not-exist.png');
    const destPath = path.join(dir, 'crop.png');

    assert.throws(
      () => cropImage(sourcePath, { x: 0, y: 0, width: 2, height: 2 }, destPath),
      /Quelldatei nicht gefunden/
    );
  }
);

test('cropImage: wirft Fehler bei ungueltiger region (negativ/0)', () => {
  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');

  writeTestPng(sourcePath, 10, 10);

  assert.throws(
    () => cropImage(sourcePath, { x: -1, y: 0, width: 2, height: 2 }, destPath),
    /region\.x/
  );
  assert.throws(
    () => cropImage(sourcePath, { x: 0, y: 0, width: 0, height: 2 }, destPath),
    /region\.width/
  );
});

test('isImageMagickAvailable: liefert boolean', () => {
  assert.strictEqual(typeof isImageMagickAvailable(), 'boolean');
});
