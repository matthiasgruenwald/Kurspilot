'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeFilename,
  saveMaterial,
  getMaterialsPath,
} = require('../lib/material');

const { getFachprofilPath } = require('../lib/local-context-paths');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'material-test-'));
}

function writeFile(filePath, content = 'demo') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ─────────────────────────────────────────────────────────────
// normalizeFilename
// ─────────────────────────────────────────────────────────────

test('normalizeFilename: baut Pattern <topic>_<description>.<ext>', () => {
  const result = normalizeFilename('IMG_1234.png', {
    topic: 'wellen',
    description: 'amplitude-skizze',
  });
  assert.strictEqual(result, 'wellen_amplitude-skizze.png');
});

test('normalizeFilename: transliteriert Umlaute (ae/oe/ue/ss) in topic und description', () => {
  const result = normalizeFilename('Foto.JPG', {
    topic: 'Schülerübung',
    description: 'Größenmaß für Bär',
  });
  // Umlaute -> ae/oe/ue/ss, Lowercase, Spaces -> _
  assert.match(result, /^schueleruebung_groessenmass_fuer_baer\.jpg$/);
});

test('normalizeFilename: entfernt/ersetzt problematische Sonderzeichen', () => {
  const result = normalizeFilename('scan.pdf', {
    topic: 'physik/optik',
    description: 'Linse (Brennpunkt)!',
  });
  // Slashes, Klammern, Ausrufezeichen werden zu _ oder entfernt
  assert.doesNotMatch(result, /[/()!]/);
  assert.match(result, /^physik_optik_linse_brennpunkt\.pdf$/);
});

test('normalizeFilename: lowercased Extension uebernimmt aus Originalnamen', () => {
  const result = normalizeFilename('TAFELBILD.JPEG', {
    topic: 'wellen',
    description: 'frequenz',
  });
  assert.ok(result.endsWith('.jpeg'));
});

test('normalizeFilename: fuegt Index-Suffix vor der Extension ein, wenn index angegeben', () => {
  const result = normalizeFilename('a.png', {
    topic: 'wellen',
    description: 'amplitude',
    index: 2,
  });
  assert.strictEqual(result, 'wellen_amplitude_2.png');
});

test('normalizeFilename: index 1 erzeugt kein Suffix (erstes Vorkommen)', () => {
  const result = normalizeFilename('a.png', {
    topic: 'wellen',
    description: 'amplitude',
    index: 1,
  });
  assert.strictEqual(result, 'wellen_amplitude.png');
});

test('normalizeFilename: kollabiert mehrfache Trennzeichen zu einem Unterstrich', () => {
  const result = normalizeFilename('x.png', {
    topic: '  wellen   physik  ',
    description: '---amplitude___skizze---',
  });
  // keine doppelten Unterstriche, kein fuehrender/abschliessender Unterstrich
  assert.doesNotMatch(result, /__/);
  assert.doesNotMatch(result, /^_|_\./);
  assert.match(result, /^wellen_physik_amplitude_skizze\.png$/);
});

test('normalizeFilename: behandelt fehlende Extension robust', () => {
  const result = normalizeFilename('namelos', {
    topic: 'wellen',
    description: 'notiz',
  });
  // Ohne Extension: kein Punkt, kein leeres .-Suffix
  assert.strictEqual(result, 'wellen_notiz');
});

test('normalizeFilename: wirft Fehler bei leerem topic', () => {
  assert.throws(
    () => normalizeFilename('a.png', { topic: '', description: 'x' }),
    /topic/i
  );
});

test('normalizeFilename: wirft Fehler bei leerer description', () => {
  assert.throws(
    () => normalizeFilename('a.png', { topic: 'wellen', description: '   ' }),
    /description/i
  );
});

// ─────────────────────────────────────────────────────────────
// saveMaterial
// ─────────────────────────────────────────────────────────────

test('saveMaterial: speichert Original und normalisierte Kopie im richtigen Ordner', () => {
  const baseDir = makeTmpDir();
  const src = writeFile(path.join(baseDir, 'src', 'IMG_1234.png'), 'pixels');

  const result = saveMaterial(src, {
    schuljahr: '2025-26',
    klasse: '7a',
    unterrichtsordner: 'naturwissenschaften',
    topic: 'wellen',
    description: 'amplitude-skizze',
    contextRoot: baseDir,
  });

  // Erwartete Verzeichnisstruktur: materials liegt im Fachprofil-Ordner
  const materialsDir = path.join(
    baseDir,
    getFachprofilPath('2025-26', '7a', 'naturwissenschaften'),
    'materials',
    'wellen'
  );

  // Original wurde nach materials/<topic>/original/ kopiert (Original-Dateiname bleibt)
  const expectedOriginal = path.join(materialsDir, 'original', 'IMG_1234.png');
  // Normalisierte Kopie
  const expectedNormalized = path.join(materialsDir, 'wellen_amplitude-skizze.png');

  assert.ok(fs.existsSync(expectedOriginal), 'original soll existieren');
  assert.ok(fs.existsSync(expectedNormalized), 'normalisierte Kopie soll existieren');

  assert.strictEqual(result.originalPath, expectedOriginal);
  assert.strictEqual(result.normalizedPath, expectedNormalized);

  // Quelle wurde nicht entfernt
  assert.ok(fs.existsSync(src), 'Quelle bleibt erhalten');
});

test('saveMaterial: bei Namenskollision wird Index-Suffix hochgezaehlt', () => {
  const baseDir = makeTmpDir();
  const srcA = writeFile(path.join(baseDir, 'src', 'a.png'), 'A');
  const srcB = writeFile(path.join(baseDir, 'src', 'b.png'), 'B');
  const srcC = writeFile(path.join(baseDir, 'src', 'c.png'), 'C');

  const ctx = {
    schuljahr: '2025-26',
    klasse: '7a',
    unterrichtsordner: 'naturwissenschaften',
    topic: 'wellen',
    description: 'amplitude',
    contextRoot: baseDir,
  };

  const a = saveMaterial(srcA, ctx);
  const b = saveMaterial(srcB, ctx);
  const c = saveMaterial(srcC, ctx);

  assert.match(a.normalizedPath, /wellen_amplitude\.png$/);
  assert.match(b.normalizedPath, /wellen_amplitude_2\.png$/);
  assert.match(c.normalizedPath, /wellen_amplitude_3\.png$/);

  // Alle drei normalisierten Dateien existieren
  assert.ok(fs.existsSync(a.normalizedPath));
  assert.ok(fs.existsSync(b.normalizedPath));
  assert.ok(fs.existsSync(c.normalizedPath));
});

test('saveMaterial: schreibt Journal-Eintrag mit Original- und neuem Namen', () => {
  const baseDir = makeTmpDir();
  const src = writeFile(path.join(baseDir, 'src', 'IMG_1234.png'), 'pixels');

  const result = saveMaterial(src, {
    schuljahr: '2025-26',
    klasse: '7a',
    unterrichtsordner: 'naturwissenschaften',
    topic: 'wellen',
    description: 'amplitude-skizze',
    contextRoot: baseDir,
    date: '2026-06-12',
  });

  assert.ok(result.journalPath, 'journalPath wird zurueckgegeben');
  assert.ok(fs.existsSync(result.journalPath), 'Journal-Datei existiert');

  const content = fs.readFileSync(result.journalPath, 'utf8');
  // Beide Namen muessen erscheinen
  assert.match(content, /IMG_1234\.png/);
  assert.match(content, /wellen_amplitude-skizze\.png/);
  // Topic wird mit aufgefuehrt
  assert.match(content, /wellen/);
});

test('saveMaterial: bei Kollision dokumentiert Journal den Index-Namen', () => {
  const baseDir = makeTmpDir();
  const srcA = writeFile(path.join(baseDir, 'src', 'first.png'), 'A');
  const srcB = writeFile(path.join(baseDir, 'src', 'second.png'), 'B');

  const ctx = {
    schuljahr: '2025-26',
    klasse: '7a',
    unterrichtsordner: 'naturwissenschaften',
    topic: 'wellen',
    description: 'amplitude',
    contextRoot: baseDir,
    date: '2026-06-12',
  };

  saveMaterial(srcA, ctx);
  const b = saveMaterial(srcB, ctx);

  const content = fs.readFileSync(b.journalPath, 'utf8');
  // Journal enthaelt den Indexnamen fuer den zweiten Eintrag
  assert.match(content, /wellen_amplitude_2\.png/);
  // Original "second.png" steht im Eintrag
  assert.match(content, /second\.png/);
});

test('saveMaterial: wirft Fehler, wenn Quelldatei nicht existiert', () => {
  const baseDir = makeTmpDir();
  assert.throws(
    () => saveMaterial(path.join(baseDir, 'nicht-da.png'), {
      schuljahr: '2025-26',
      klasse: '7a',
      unterrichtsordner: 'naturwissenschaften',
      topic: 'wellen',
      description: 'amplitude',
      contextRoot: baseDir,
    }),
    /nicht gefunden|not found|ENOENT/i
  );
});

test('saveMaterial: liest den Kurspilot-Arbeitsbereich aus der Arbeitsbereich-Einstellung', () => {
  const baseDir = makeTmpDir();
  const src = writeFile(path.join(baseDir, 'src', 'tafelbild.png'), 'pixels');

  const result = saveMaterial(
    src,
    {
      schuljahr: '2025-26',
      klasse: '7c',
      unterrichtsordner: 'geschichte',
      topic: 'rom',
      description: 'tafelbild',
    },
    {
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        configPath: path.join(baseDir, 'config.json'),
        contextRoot: baseDir,
      }),
    }
  );

  assert.strictEqual(
    result.normalizedPath,
    path.join(
      baseDir,
      'local-context',
      '2025-26',
      '7c',
      'geschichte',
      'materials',
      'rom',
      'rom_tafelbild.png'
    )
  );
});

// ─────────────────────────────────────────────────────────────
// getMaterialsPath (Helper)
// ─────────────────────────────────────────────────────────────

test('getMaterialsPath: liefert materials/<topic> relativ zum Fachprofil-Ordner', () => {
  const result = getMaterialsPath('2025-26', '7a', 'naturwissenschaften', 'wellen');
  assert.strictEqual(
    result,
    path.join(
      getFachprofilPath('2025-26', '7a', 'naturwissenschaften'),
      'materials',
      'wellen'
    )
  );
});
