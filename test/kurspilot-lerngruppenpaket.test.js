'use strict';

/**
 * Tests fuer lib/kurspilot-lerngruppenpaket.js (Issue #277: Lerngruppenpaket
 * schulintern exportieren). Deckt die drei Akzeptanzkriterien ab: genau ein
 * Lerngruppenordner fuer ein benanntes Schuljahr ohne implizite Vorjahre,
 * INTERN-Kennzeichnung in Paketname/Manifest inkl. Zweck/Zustaendigkeit/
 * Pruefzeitpunkt, sowie ein klarer Hinweis auf lokale Verantwortung fuer
 * Speicherort und Uebergabekanal in der Vorschau.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { erstelleLerngruppenpaket } = require('../lib/kurspilot-lerngruppenpaket');
const { buildFrontmatterBlock, todayIso } = require('../lib/kurspilot-frontmatter');
const { unzipAvailable } = require('./helpers/unzip-available');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-lerngruppenpaket-test-'));
}

function withConfiguredWorkspace(contextRoot) {
  return {
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: path.join(contextRoot, 'config.json'),
      contextRoot,
    }),
  };
}

function lerngruppenFrontmatter(overrides = {}) {
  const today = todayIso();
  return buildFrontmatterBlock({
    type: 'lerngruppe',
    title: '7a',
    tags: [],
    status: 'aktiv',
    created: today,
    updated: today,
    about: 'Klasse 7a',
    gradeLevel: '7',
    kurspilot: { personenbezug: true, weitergabe: 'schulintern' },
    ...overrides,
  });
}

function setUpLerngruppe(baseDir, schuljahr, { contextOverrides = {} } = {}) {
  const lerngruppenDir = path.join(baseDir, schuljahr, '7a');
  fs.mkdirSync(lerngruppenDir, { recursive: true });
  fs.writeFileSync(
    path.join(lerngruppenDir, 'CONTEXT.md'),
    `${lerngruppenFrontmatter(contextOverrides)}\n\n## Profil\n\nLerngruppe 7a.\n`,
    'utf8'
  );
  return lerngruppenDir;
}

function fields(overrides = {}) {
  return { schuljahr: '2025-26', klasseOderLerngruppe: '7a', ...overrides };
}

test('Vorschau: nennt genau den Lerngruppenordner des benannten Schuljahres, kein implizites Vorjahr', () => {
  const baseDir = makeTmpDir();
  setUpLerngruppe(baseDir, '2025-26');
  setUpLerngruppe(baseDir, '2024-25');
  const options = withConfiguredWorkspace(baseDir);

  const result = erstelleLerngruppenpaket(fields(), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'preview');
  assert.ok(result.included.every((entry) => entry.startsWith('2025-26/7a/')));
  assert.ok(!result.included.some((entry) => entry.startsWith('2024-25/')));
});

test('Vorschau: weist klar auf lokale Verantwortung fuer Speicherort und Uebergabekanal hin', () => {
  const baseDir = makeTmpDir();
  setUpLerngruppe(baseDir, '2025-26');
  const options = withConfiguredWorkspace(baseDir);

  const result = erstelleLerngruppenpaket(fields(), options);

  assert.match(result.teacherFacingText, /Speicherort/);
  assert.match(result.teacherFacingText, /Uebergabekanal|Übergabekanal/i);
});

test('Vorschau: als nicht_weitergeben markierte Lerngruppe -> canExport false mit Nachforderung', () => {
  const baseDir = makeTmpDir();
  setUpLerngruppe(baseDir, '2025-26', {
    contextOverrides: { kurspilot: { personenbezug: true, weitergabe: 'nicht_weitergeben' } },
  });
  const options = withConfiguredWorkspace(baseDir);

  const result = erstelleLerngruppenpaket(fields(), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.canExport, false);
  assert.match(result.missingMetadata.join(' '), /nicht_weitergeben/);
});

test('Export ohne Bestaetigung schreibt nicht (confirmed fehlt)', () => {
  const baseDir = makeTmpDir();
  setUpLerngruppe(baseDir, '2025-26');
  const options = withConfiguredWorkspace(baseDir);
  const zipPath = path.join(baseDir, 'INTERN-7a.zip');

  const result = erstelleLerngruppenpaket(fields({ outputPath: zipPath }), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'preview');
  assert.strictEqual(fs.existsSync(zipPath), false);
});

test('Export lehnt Dateinamen ohne "INTERN" ab', () => {
  const baseDir = makeTmpDir();
  setUpLerngruppe(baseDir, '2025-26');
  const options = withConfiguredWorkspace(baseDir);
  const zipPath = path.join(baseDir, '7a-export.zip');

  const result = erstelleLerngruppenpaket(fields({ outputPath: zipPath }), { ...options, confirmed: true });

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /INTERN/);
  assert.strictEqual(fs.existsSync(zipPath), false);
});

const HAS_UNZIP = unzipAvailable();

test(
  'Bestaetigter Export: ZIP enthaelt genau einen Lerngruppenordner + manifest.md (INTERN, Zweck/Zustaendigkeit/Pruefzeitpunkt) + AGENTS.md',
  { skip: !HAS_UNZIP && 'unzip nicht verfuegbar' },
  () => {
    const baseDir = makeTmpDir();
    const lerngruppenDir = setUpLerngruppe(baseDir, '2025-26');
    fs.mkdirSync(path.join(lerngruppenDir, 'nawi'), { recursive: true });
    fs.writeFileSync(path.join(lerngruppenDir, 'nawi', 'notiz.md'), '# Notiz\n\nFachnotiz.\n', 'utf8');

    const options = withConfiguredWorkspace(baseDir);
    const zipPath = path.join(baseDir, 'INTERN-7a-2025-26.zip');

    const result = erstelleLerngruppenpaket(
      fields({
        outputPath: zipPath,
        absender: 'A. Lehrkraft',
        schule: 'IGS',
        zweck: 'Kursuebergabe',
        zustaendigkeit: 'B. Lehrkraft',
        pruefzeitpunkt: '2026-08-01',
      }),
      { ...options, confirmed: true }
    );

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'exported');
    assert.ok(fs.existsSync(zipPath));

    const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    assert.match(listing, /manifest\.md/);
    assert.match(listing, /AGENTS\.md/);
    assert.match(listing, /2025-26\/7a\/CONTEXT\.md/);
    assert.match(listing, /2025-26\/7a\/nawi\/notiz\.md/);

    const manifestContent = execFileSync('unzip', ['-p', zipPath, 'manifest.md'], { encoding: 'utf8' });
    assert.match(manifestContent, /INTERN/);
    assert.match(manifestContent, /Zweck: Kursuebergabe/);
    assert.match(manifestContent, /Zustaendigkeit: B\. Lehrkraft/);
    assert.match(manifestContent, /Pruefzeitpunkt: 2026-08-01/);
  }
);

test('Fehlt die Lerngruppe (keine CONTEXT.md), liefert die Vorschau {ok: false, message}', () => {
  const baseDir = makeTmpDir();
  fs.mkdirSync(path.join(baseDir, '2025-26'), { recursive: true });
  const options = withConfiguredWorkspace(baseDir);

  const result = erstelleLerngruppenpaket(fields(), options);

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /nicht gefunden/);
});
