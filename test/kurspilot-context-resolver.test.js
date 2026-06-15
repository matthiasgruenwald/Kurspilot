'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveKurspilotContextDocuments,
  readKurspilotContextDocuments,
} = require('../lib/kurspilot-context-resolver');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-context-test-'));
}

test('Resolver liefert Vorhaben, Fachprofil und Lerngruppenprofil in expliziter Precedence-Reihenfolge', () => {
  const baseDir = makeTmpDir();
  const vorhabenDir = path.join(
    baseDir,
    'local-context',
    '2025-26',
    '7a',
    'naturwissenschaften',
    'photosynthese'
  );
  const fachprofilDir = path.join(baseDir, 'local-context', '2025-26', '7a', 'naturwissenschaften');
  const lerngruppenDir = path.join(baseDir, 'local-context', '2025-26', '7a');
  fs.mkdirSync(vorhabenDir, { recursive: true });
  fs.mkdirSync(fachprofilDir, { recursive: true });
  fs.mkdirSync(lerngruppenDir, { recursive: true });
  fs.writeFileSync(path.join(vorhabenDir, 'CONTEXT.md'), '# Vorhaben\n', 'utf8');
  fs.writeFileSync(path.join(fachprofilDir, 'CONTEXT.md'), '# Fachprofil\n', 'utf8');
  fs.writeFileSync(path.join(lerngruppenDir, 'CONTEXT.md'), '# Lerngruppe\n', 'utf8');

  const result = resolveKurspilotContextDocuments(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    unterrichtsordner: 'naturwissenschaften',
    unterrichtsvorhaben: 'photosynthese',
  });

  assert.deepStrictEqual(
    result.documents.map((doc) => doc.kind),
    ['unterrichtsvorhaben', 'unterrichtsordner', 'lerngruppenprofil']
  );
  assert.deepStrictEqual(
    result.documents.map((doc) => doc.precedence),
    [0, 1, 2]
  );
  assert.ok(result.documents.every((doc) => doc.exists));
  assert.ok(result.documents[0].precedence < result.documents[1].precedence);
  assert.ok(result.documents[1].precedence < result.documents[2].precedence);
  assert.match(result.resolutionPolicy, /spezifisch/i);
});

test('Resolver haelt fehlende optionale Kontextdateien fest ohne den Ruf nach Lerngruppenkontext zu verlieren', () => {
  const baseDir = makeTmpDir();
  const lerngruppenDir = path.join(baseDir, 'local-context', '2025-26', '7b');
  fs.mkdirSync(lerngruppenDir, { recursive: true });
  fs.writeFileSync(path.join(lerngruppenDir, 'CONTEXT.md'), '# Lerngruppe\n', 'utf8');

  const result = resolveKurspilotContextDocuments(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7b',
    unterrichtsordner: 'englisch',
    unterrichtsvorhaben: 'grammatik',
  });

  assert.deepStrictEqual(
    result.documents.map((doc) => `${doc.kind}:${doc.exists}`),
    ['unterrichtsvorhaben:false', 'unterrichtsordner:false', 'lerngruppenprofil:true']
  );
  assert.deepStrictEqual(result.availableDocuments.map((doc) => doc.kind), ['lerngruppenprofil']);
  assert.strictEqual(result.missingDocuments.length, 2);
  assert.ok(result.missingDocuments.every((doc) => doc.optional));
});

test('readKurspilotContextDocuments liest nur vorhandene Dateien und behaelt die Precedence sichtbar', () => {
  const baseDir = makeTmpDir();
  const fachprofilDir = path.join(baseDir, 'local-context', '2025-26', '7c', 'mathematik');
  const lerngruppenDir = path.join(baseDir, 'local-context', '2025-26', '7c');
  fs.mkdirSync(fachprofilDir, { recursive: true });
  fs.mkdirSync(lerngruppenDir, { recursive: true });
  fs.writeFileSync(path.join(fachprofilDir, 'CONTEXT.md'), '# Fachprofil\nFachlich.', 'utf8');
  fs.writeFileSync(path.join(lerngruppenDir, 'CONTEXT.md'), '# Lerngruppe\nAllgemein.', 'utf8');

  const result = readKurspilotContextDocuments(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7c',
    unterrichtsordner: 'mathematik',
  });

  assert.deepStrictEqual(
    result.documents.map((doc) => `${doc.kind}:${doc.precedence}`),
    ['unterrichtsordner:0', 'lerngruppenprofil:1']
  );
  assert.deepStrictEqual(
    result.documents.map((doc) => doc.content.trim()),
    ['# Fachprofil\nFachlich.', '# Lerngruppe\nAllgemein.']
  );
  assert.deepStrictEqual(result.missingDocuments, []);
});
