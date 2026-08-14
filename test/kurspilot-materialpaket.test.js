'use strict';

/**
 * Tests fuer lib/kurspilot-materialpaket.js (Issue #276: Materialpaket
 * sicher vorschauen und exportieren). Deckt die drei Akzeptanzkriterien ab:
 * Vorschau ohne Schreiben, bestaetigter Export mit genau dem
 * nicht-personenbezogenen Vorhabensbaum + manifest.md/AGENTS.md, sowie
 * Erhalt von Binaer-/Originaldateien ohne Traversal.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { erstelleMaterialpaket } = require('../lib/kurspilot-materialpaket');
const { buildFrontmatterBlock, todayIso } = require('../lib/kurspilot-frontmatter');
const { unzipAvailable } = require('./helpers/unzip-available');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-materialpaket-test-'));
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

function vorhabenContextFrontmatter(overrides = {}) {
  const today = todayIso();
  return buildFrontmatterBlock({
    type: 'vorhaben',
    title: 'Photosynthese',
    tags: ['bio'],
    status: 'aktiv',
    created: today,
    updated: today,
    about: 'nawi',
    gradeLevel: '7',
    kurspilot: { personenbezug: false, weitergabe: 'schulintern' },
    ...overrides,
  });
}

function setUpVorhaben(baseDir, { contextOverrides = {} } = {}) {
  const vorhabenDir = path.join(baseDir, '2025-26', '7a', 'nawi', 'photosynthese');
  fs.mkdirSync(vorhabenDir, { recursive: true });

  fs.writeFileSync(
    path.join(vorhabenDir, 'CONTEXT.md'),
    `${vorhabenContextFrontmatter(contextOverrides)}\n\n## Kurzbeschreibung\n\nPhotosynthese fuer Klasse 7.\n`,
    'utf8'
  );
  fs.writeFileSync(path.join(vorhabenDir, 'plan.md'), '# Unterrichtsvorhaben: Photosynthese\n\nPlan-Text.\n', 'utf8');
  fs.writeFileSync(path.join(vorhabenDir, 'status.md'), '# Status\n\nin_planung\n', 'utf8');

  return vorhabenDir;
}

function fields(overrides = {}) {
  return {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    unterrichtsordner: 'nawi',
    unterrichtsvorhaben: 'photosynthese',
    ...overrides,
  };
}

test('Vorschau: benennt Paketinhalt, ausgeschlossene Dateien und schreibt nichts', () => {
  const baseDir = makeTmpDir();
  const vorhabenDir = setUpVorhaben(baseDir);
  const options = withConfiguredWorkspace(baseDir);

  const beforeEntries = fs.readdirSync(vorhabenDir);

  const result = erstelleMaterialpaket(fields(), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'preview');
  assert.ok(result.included.some((entry) => entry.endsWith('CONTEXT.md')));
  assert.ok(result.included.some((entry) => entry.endsWith('plan.md')));
  assert.ok(result.included.some((entry) => entry.endsWith('status.md')));
  assert.deepStrictEqual(result.excluded, []);
  assert.strictEqual(result.canExport, true);
  assert.deepStrictEqual(result.missingMetadata, []);

  // Vorschau schreibt nichts: Verzeichnis unveraendert, kein ZIP im Baum.
  assert.deepStrictEqual(fs.readdirSync(vorhabenDir).sort(), beforeEntries.sort());
});

test('Vorschau: schliesst personenbezogenes Sidecar und nicht_weitergeben-Datei aus, nennt Grund', () => {
  const baseDir = makeTmpDir();
  const vorhabenDir = setUpVorhaben(baseDir);
  const options = withConfiguredWorkspace(baseDir);
  const today = todayIso();

  fs.writeFileSync(
    path.join(vorhabenDir, 'CONTEXT.personen.md'),
    `${buildFrontmatterBlock({
      type: 'vorhaben',
      title: 'Photosynthese (personenbezogen)',
      tags: [],
      status: 'aktiv',
      created: today,
      updated: today,
      about: 'nawi',
      gradeLevel: '7',
      kurspilot: { personenbezug: true, weitergabe: 'nicht_weitergeben' },
    })}\n\nBeobachtung zu einzelnen Lernenden.\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(vorhabenDir, 'entwurf.md'),
    `${buildFrontmatterBlock({
      type: 'material',
      title: 'Interner Entwurf',
      tags: [],
      status: 'aktiv',
      created: today,
      updated: today,
      about: 'nawi',
      gradeLevel: '7',
      kurspilot: { personenbezug: false, weitergabe: 'nicht_weitergeben' },
    })}\n\nNoch nicht fuer Weitergabe freigegeben.\n`,
    'utf8'
  );

  const result = erstelleMaterialpaket(fields(), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.excluded.length, 2);
  const reasons = Object.fromEntries(result.excluded.map((entry) => [entry.path, entry.reason]));
  assert.match(reasons['CONTEXT.personen.md'], /personenbezogen/);
  assert.match(reasons['entwurf.md'], /nicht_weitergeben/);
  assert.ok(!result.included.some((entry) => entry.includes('CONTEXT.personen.md')));
  assert.ok(!result.included.some((entry) => entry.includes('entwurf.md')));
});

test('Vorschau: Vorhaben komplett als nicht_weitergeben markiert -> canExport false mit Nachforderung', () => {
  const baseDir = makeTmpDir();
  setUpVorhaben(baseDir, { contextOverrides: { kurspilot: { personenbezug: false, weitergabe: 'nicht_weitergeben' } } });
  const options = withConfiguredWorkspace(baseDir);

  const result = erstelleMaterialpaket(fields(), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.canExport, false);
  assert.match(result.missingMetadata.join(' '), /nicht_weitergeben/);
});

test('Vorschau: offene Weitergabe ohne Lizenz -> canExport false mit konkreter Nachforderung', () => {
  const baseDir = makeTmpDir();
  setUpVorhaben(baseDir, { contextOverrides: { kurspilot: { personenbezug: false, weitergabe: 'offen' } } });
  const options = withConfiguredWorkspace(baseDir);

  const result = erstelleMaterialpaket(fields(), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.canExport, false);
  assert.match(result.missingMetadata.join(' '), /Lizenz/);
});

test('Vorschau: offene Weitergabe MIT Lizenz -> canExport true', () => {
  const baseDir = makeTmpDir();
  setUpVorhaben(baseDir, {
    contextOverrides: { kurspilot: { personenbezug: false, weitergabe: 'offen' }, license: 'CC BY-SA 4.0' },
  });
  const options = withConfiguredWorkspace(baseDir);

  const result = erstelleMaterialpaket(fields(), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.canExport, true);
  assert.deepStrictEqual(result.missingMetadata, []);
});

test('Export ohne Bestaetigung schreibt nicht (confirmed fehlt)', () => {
  const baseDir = makeTmpDir();
  setUpVorhaben(baseDir);
  const options = withConfiguredWorkspace(baseDir);
  const zipPath = path.join(baseDir, 'export.zip');

  const result = erstelleMaterialpaket(fields({ outputPath: zipPath }), options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'preview');
  assert.strictEqual(fs.existsSync(zipPath), false);
});

test('Export blockiert bei fehlender Lizenz trotz confirmed: true, schreibt kein Paket', () => {
  const baseDir = makeTmpDir();
  setUpVorhaben(baseDir, { contextOverrides: { kurspilot: { personenbezug: false, weitergabe: 'offen' } } });
  const options = withConfiguredWorkspace(baseDir);
  const zipPath = path.join(baseDir, 'export.zip');

  const result = erstelleMaterialpaket(fields({ outputPath: zipPath }), { ...options, confirmed: true });

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /Lizenz/);
  assert.strictEqual(fs.existsSync(zipPath), false);
});

const HAS_UNZIP = unzipAvailable();

test(
  'Bestaetigter Export: ZIP enthaelt genau den nicht-personenbezogenen Vorhabensbaum + manifest.md + katalog.md + AGENTS.md',
  { skip: !HAS_UNZIP && 'unzip nicht verfuegbar' },
  () => {
    const baseDir = makeTmpDir();
    const vorhabenDir = setUpVorhaben(baseDir);
    const today = todayIso();

    fs.writeFileSync(
      path.join(vorhabenDir, 'CONTEXT.personen.md'),
      `${buildFrontmatterBlock({
        type: 'vorhaben',
        title: 'Photosynthese (personenbezogen)',
        tags: [],
        status: 'aktiv',
        created: today,
        updated: today,
        about: 'nawi',
        gradeLevel: '7',
        kurspilot: { personenbezug: true, weitergabe: 'nicht_weitergeben' },
      })}\n\nBeobachtung.\n`,
      'utf8'
    );

    const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]);
    fs.mkdirSync(path.join(vorhabenDir, 'material'), { recursive: true });
    fs.writeFileSync(path.join(vorhabenDir, 'material', 'arbeitsblatt.pdf'), binaryData);

    const options = withConfiguredWorkspace(baseDir);
    const zipPath = path.join(baseDir, 'photosynthese-materialpaket.zip');

    const result = erstelleMaterialpaket(fields({ outputPath: zipPath, absender: 'A. Lehrkraft', schule: 'IGS' }), {
      ...options,
      confirmed: true,
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 'exported');
    assert.strictEqual(result.archivePath, zipPath);
    assert.ok(fs.existsSync(zipPath));

    const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
    assert.match(listing, /manifest\.md/);
    assert.match(listing, /katalog\.md/);
    assert.match(listing, /AGENTS\.md/);
    assert.match(listing, /photosynthese\/CONTEXT\.md/);
    assert.match(listing, /photosynthese\/plan\.md/);
    assert.match(listing, /photosynthese\/status\.md/);
    assert.match(listing, /photosynthese\/material\/arbeitsblatt\.pdf/);
    assert.doesNotMatch(listing, /CONTEXT\.personen\.md/);

    const manifestContent = execFileSync('unzip', ['-p', zipPath, 'manifest.md'], { encoding: 'utf8' });
    assert.match(manifestContent, /Modus: Material/);
    assert.match(manifestContent, /Photosynthese/);
    assert.match(manifestContent, /A\. Lehrkraft/);
    assert.match(manifestContent, /IGS/);

    const katalogContent = execFileSync('unzip', ['-p', zipPath, 'katalog.md'], { encoding: 'utf8' });
    assert.match(katalogContent, /Katalogblatt/);
    assert.match(katalogContent, /Photosynthese/);
    assert.match(katalogContent, /Fach: nawi/);
    assert.match(katalogContent, /Jahrgangsstufe: 7/);

    const agentsContent = execFileSync('unzip', ['-p', zipPath, 'AGENTS.md'], { encoding: 'utf8' });
    assert.match(agentsContent, /AGENTS\.md/);
    assert.match(agentsContent, /katalog\.md/);

    // Binaerdatei bleibt unveraendert erhalten (STORE, kein Umschreiben).
    const extractedBinary = execFileSync('unzip', ['-p', zipPath, 'photosynthese/material/arbeitsblatt.pdf']);
    assert.deepStrictEqual(extractedBinary, binaryData);

    const planContent = execFileSync('unzip', ['-p', zipPath, 'photosynthese/plan.md'], { encoding: 'utf8' });
    assert.strictEqual(planContent, '# Unterrichtsvorhaben: Photosynthese\n\nPlan-Text.\n');
  }
);

test('Symlink ausserhalb des Vorhabens wird ausgeschlossen statt aufgenommen', { skip: process.platform === 'win32' }, () => {
  const baseDir = makeTmpDir();
  const vorhabenDir = setUpVorhaben(baseDir);
  const outsideFile = path.join(baseDir, 'geheim.txt');
  fs.writeFileSync(outsideFile, 'nicht fuer die Weitergabe', 'utf8');
  fs.symlinkSync(outsideFile, path.join(vorhabenDir, 'verweis.txt'));

  const options = withConfiguredWorkspace(baseDir);
  const result = erstelleMaterialpaket(fields(), options);

  assert.strictEqual(result.ok, true);
  const excludedPaths = result.excluded.map((entry) => entry.path);
  assert.ok(excludedPaths.includes('verweis.txt'));
  assert.ok(!result.included.some((entry) => entry.endsWith('verweis.txt')));
});

test('Fehlt das Vorhaben (keine CONTEXT.md), liefert die Vorschau {ok: false, message}', () => {
  const baseDir = makeTmpDir();
  fs.mkdirSync(path.join(baseDir, '2025-26', '7a', 'nawi'), { recursive: true });
  const options = withConfiguredWorkspace(baseDir);

  const result = erstelleMaterialpaket(fields(), options);

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /nicht gefunden/);
});

test('Ohne konfigurierten Arbeitsbereich liefert die Vorschau {ok: false, message}', () => {
  const result = erstelleMaterialpaket(fields(), {
    readWorkspaceSetting: () => ({ ok: false, status: 'missing', message: 'Arbeitsbereich-Einstellung fehlt.' }),
  });

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /Arbeitsbereich-Einstellung fehlt/);
});
