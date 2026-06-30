'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const childProcess = require('node:child_process');
const path = require('node:path');
const zlib = require('node:zlib');

const { cropImage, isImageMagickAvailable, isSipsAvailable, toSipsCropOffset } = require('../lib/image-crop');

const SKIP_REASON = 'ImageMagick ("convert") ist auf diesem System nicht installiert (siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md)';
const hasImageMagick = isImageMagickAvailable();
// Auf macOS nutzt cropImage() jetzt "sips" (siehe Issue #135), das ohne
// ImageMagick auskommt. Tests, die echte (ungemockte) cropImage()-Aufrufe
// machen, brauchen daher nur EIN auf der jeweiligen Plattform passendes
// Crop-Tool - nicht zwingend ImageMagick.
const hasCropTool = os.platform() === 'darwin' ? isSipsAvailable() : hasImageMagick;

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
  { skip: !hasCropTool && SKIP_REASON },
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
  { skip: !hasCropTool && SKIP_REASON },
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

test('cropImage: ruft unter Windows "magick" statt "convert" auf (#116)', (t) => {
  t.mock.method(os, 'platform', () => 'win32');
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {});

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  cropImage(sourcePath, { x: 0, y: 0, width: 2, height: 2 }, destPath);

  assert.strictEqual(execMock.mock.calls.length, 1);
  assert.strictEqual(execMock.mock.calls[0].arguments[0], 'magick');
});

test('isImageMagickAvailable: prueft unter Windows "magick" statt "convert" (#116)', (t) => {
  t.mock.method(os, 'platform', () => 'win32');
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {});

  isImageMagickAvailable();

  assert.strictEqual(execMock.mock.calls.length, 1);
  assert.strictEqual(execMock.mock.calls[0].arguments[0], 'magick');
});

test('cropImage: ruft unter Linux weiterhin "convert" auf', (t) => {
  t.mock.method(os, 'platform', () => 'linux');
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {});

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  cropImage(sourcePath, { x: 0, y: 0, width: 2, height: 2 }, destPath);

  assert.strictEqual(execMock.mock.calls[0].arguments[0], 'convert');
});

test('cropImage: nutzt auf Windows vollen Kurspilot-Pfad, wenn "magick" nicht im PATH aber im Kurspilot-Verzeichnis liegt', (t) => {
  // Dieser Fall tritt auf, wenn setup-kurspilot.js ImageMagick nach
  // %LOCALAPPDATA%\Kurspilot\imagemagick installiert hat, aber PATH unver-
  // aendert blieb (z.B. Parallels ARM64 mit frischer Installation).
  const { getKurspilotImageMagickDir } = require('../lib/imagemagick-setup');
  t.mock.method(os, 'platform', () => 'win32');
  t.mock.method(os, 'homedir', () => 'C:\\Users\\mg');
  const fullPath = path.join(
    getKurspilotImageMagickDir({ homeDir: 'C:\\Users\\mg', platform: 'win32' }),
    'magick.exe'
  );
  const realExistsSync = fs.existsSync;
  t.mock.method(fs, 'existsSync', (p) => (p === fullPath ? true : realExistsSync(p)));

  const execMock = t.mock.method(childProcess, 'execFileSync', () => {});

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  cropImage(sourcePath, { x: 0, y: 0, width: 2, height: 2 }, destPath);

  const cropCall = execMock.mock.calls.find(c => c.arguments[0] === fullPath);
  assert.ok(cropCall, `muss vollen Pfad "${fullPath}" nutzen, nicht "magick"`);
});

test('cropImage: ruft unter macOS "sips" statt "convert" auf (#135)', (t) => {
  t.mock.method(os, 'platform', () => 'darwin');
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {});

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  const result = cropImage(sourcePath, { x: 2, y: 1, width: 4, height: 3 }, destPath);

  assert.strictEqual(execMock.mock.calls.length, 1);
  assert.strictEqual(execMock.mock.calls[0].arguments[0], 'sips');
  assert.strictEqual(result.backend, 'sips');
});

test('cropImage: sips-Aufruf nutzt -c <height> <width> und --cropOffset <offsetY> <offsetX> (#135)', (t) => {
  t.mock.method(os, 'platform', () => 'darwin');
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {});

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  cropImage(sourcePath, { x: 2, y: 1, width: 4, height: 3 }, destPath);

  const sipsArgs = execMock.mock.calls[0].arguments[1];
  assert.deepStrictEqual(sipsArgs, [
    '-c', '3', '4',
    '--cropOffset', '1', '2',
    sourcePath,
    '--out', destPath,
  ]);
});

test('cropImage: sips-Aufruf weicht bei region (0,0) auf Offset (-1,-1) aus, statt sips-Sonderfall "zentriert" auszuloesen (#135)', (t) => {
  t.mock.method(os, 'platform', () => 'darwin');
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {});

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  cropImage(sourcePath, { x: 0, y: 0, width: 4, height: 3 }, destPath);

  const sipsArgs = execMock.mock.calls[0].arguments[1];
  assert.deepStrictEqual(sipsArgs, [
    '-c', '3', '4',
    '--cropOffset', ' -1', ' -1',
    sourcePath,
    '--out', destPath,
  ]);
});

test('toSipsCropOffset: bildet top-left region (x,y) auf [offsetY, offsetX] ab (#135)', () => {
  assert.deepStrictEqual(toSipsCropOffset({ x: 2, y: 1 }), [1, 2]);
  assert.deepStrictEqual(toSipsCropOffset({ x: 5, y: 8 }), [8, 5]);
  assert.deepStrictEqual(toSipsCropOffset({ x: 0, y: 5 }), [5, 0]);
  assert.deepStrictEqual(toSipsCropOffset({ x: 5, y: 0 }), [0, 5]);
});

test('toSipsCropOffset: region (0,0) ist Sonderfall -> [-1,-1] statt [0,0] ("kein Offset"/zentriert bei sips) (#135)', () => {
  assert.deepStrictEqual(toSipsCropOffset({ x: 0, y: 0 }), [-1, -1]);
});

test('cropImage: faellt auf macOS bei sips-Fehlschlag automatisch auf ImageMagick zurueck (#139)', (t) => {
  t.mock.method(os, 'platform', () => 'darwin');
  let call = 0;
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {
    call += 1;
    if (call === 1) {
      throw new Error('sips ist kaputt');
    }
    return Buffer.alloc(0);
  });

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  const result = cropImage(sourcePath, { x: 0, y: 0, width: 2, height: 2 }, destPath);

  assert.strictEqual(execMock.mock.calls.length, 2);
  assert.strictEqual(execMock.mock.calls[0].arguments[0], 'sips');
  assert.strictEqual(execMock.mock.calls[1].arguments[0], 'convert');
  assert.strictEqual(result.backend, 'imagemagick');
});

test('cropImage: bevorzugt ImageMagick auf macOS, wenn options.preferredBackend es vorgibt (#139)', (t) => {
  t.mock.method(os, 'platform', () => 'darwin');
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {});

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  const result = cropImage(sourcePath, { x: 0, y: 0, width: 2, height: 2 }, destPath, { preferredBackend: 'imagemagick' });

  assert.strictEqual(execMock.mock.calls.length, 1);
  assert.strictEqual(execMock.mock.calls[0].arguments[0], 'convert');
  assert.strictEqual(result.backend, 'imagemagick');
});

test('cropImage: wirft den letzten Fehler, wenn beide Backends auf macOS scheitern (#139)', (t) => {
  t.mock.method(os, 'platform', () => 'darwin');
  t.mock.method(childProcess, 'execFileSync', () => {
    throw new Error('Tool nicht verfuegbar');
  });

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  assert.throws(
    () => cropImage(sourcePath, { x: 0, y: 0, width: 2, height: 2 }, destPath),
    /ImageMagick-Crop fehlgeschlagen/
  );
});

test('cropImage: kein Fallback auf sips unter Windows/Linux (nicht verfuegbar)', (t) => {
  t.mock.method(os, 'platform', () => 'win32');
  const execMock = t.mock.method(childProcess, 'execFileSync', () => {
    throw new Error('ImageMagick fehlt');
  });

  const dir = makeTmpDir();
  const sourcePath = path.join(dir, 'source.png');
  const destPath = path.join(dir, 'crop.png');
  writeTestPng(sourcePath, 10, 10);

  assert.throws(() => cropImage(sourcePath, { x: 0, y: 0, width: 2, height: 2 }, destPath));
  assert.strictEqual(execMock.mock.calls.length, 1, 'kein zweiter Versuch, da sips dort nicht existiert');
});

test(
  'cropImage (sips, macOS, real): liefert pixelidentisches Ergebnis zum ImageMagick-Crop (#135)',
  { skip: (os.platform() !== 'darwin' || !isSipsAvailable() || !hasImageMagick) && 'sips und/oder ImageMagick nicht verfuegbar (nur auf macOS mit beiden Tools pruefbar)' },
  () => {
    const dir = makeTmpDir();
    const sourcePath = path.join(dir, 'source.png');
    const magickDestPath = path.join(dir, 'crop-magick.png');
    const sipsDestPath = path.join(dir, 'crop-sips.png');

    writeTestPng(sourcePath, 20, 20);
    const region = { x: 5, y: 3, width: 7, height: 9 };

    // ImageMagick direkt aufrufen (Referenz), unabhaengig von der
    // Plattform-Weiche in cropImage().
    childProcess.execFileSync('convert', [sourcePath, '-crop', '7x9+5+3', '+repage', magickDestPath], {
      stdio: 'ignore',
    });

    const result = cropImage(sourcePath, region, sipsDestPath);
    assert.strictEqual(result.backend, 'sips');

    // Beide Dateien ueber ImageMagick nach PPM (unkomprimiert, kein
    // PNG-Filter-Rauschen) konvertieren und Byte-fuer-Byte vergleichen, um
    // AE/Pixel-Diff = 0 zu pruefen.
    const magickPpm = path.join(dir, 'crop-magick.ppm');
    const sipsPpm = path.join(dir, 'crop-sips.ppm');
    childProcess.execFileSync('convert', [magickDestPath, magickPpm], { stdio: 'ignore' });
    childProcess.execFileSync('convert', [sipsDestPath, sipsPpm], { stdio: 'ignore' });

    assert.deepStrictEqual(fs.readFileSync(magickPpm), fs.readFileSync(sipsPpm));
  }
);
