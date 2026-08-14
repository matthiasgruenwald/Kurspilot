'use strict';

/**
 * Tests fuer lib/kurspilot-eingangspaket.js (Issue #278: Eingangspakete
 * sicher uebernehmen). Deckt die drei Akzeptanzkriterien ab:
 * unveraendert nachvollziehbares Eingangspaket bis zur Bestaetigung,
 * konfliktfreier neuer Ordner statt Ueberschreiben/Mergen bei
 * Namensgleichheit, sowie Abweisung beschaedigter/traversalhaltiger/
 * verweisender Archive vor jeder Dateioperation.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { uebernehmeEingangspaket } = require('../lib/kurspilot-eingangspaket');
const { erstelleMaterialpaket } = require('../lib/kurspilot-materialpaket');
const { buildFrontmatterBlock, todayIso } = require('../lib/kurspilot-frontmatter');
const { writeZipFile } = require('../lib/kurspilot-zip');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-eingangspaket-test-'));
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

/**
 * Erzeugt ein echtes Materialpaket-ZIP (ueber die bereits getestete
 * Exportfunktion, Issue #276) als Empfangs-Fixture fuer Uebernahmetests -
 * kein Mock der Archivimplementierung, sondern der reale Produktionscode.
 */
function buildMaterialpaketZip(baseDir, zipPath) {
  const vorhabenDir = path.join(baseDir, 'senderarchiv', '2025-26', '7a', 'nawi', 'photosynthese');
  fs.mkdirSync(vorhabenDir, { recursive: true });
  const today = todayIso();
  fs.writeFileSync(
    path.join(vorhabenDir, 'CONTEXT.md'),
    `${buildFrontmatterBlock({
      type: 'vorhaben',
      title: 'Photosynthese',
      tags: ['bio'],
      status: 'aktiv',
      created: today,
      updated: today,
      about: 'nawi',
      gradeLevel: '7',
      kurspilot: { personenbezug: false, weitergabe: 'schulintern' },
    })}\n\n## Kurzbeschreibung\n\nPhotosynthese fuer Klasse 7.\n`,
    'utf8'
  );
  fs.writeFileSync(path.join(vorhabenDir, 'plan.md'), '# Unterrichtsvorhaben: Photosynthese\n\nPlan-Text.\n', 'utf8');

  const senderOptions = withConfiguredWorkspace(path.join(baseDir, 'senderarchiv'));
  const result = erstelleMaterialpaket(
    {
      schuljahr: '2025-26',
      klasseOderLerngruppe: '7a',
      unterrichtsordner: 'nawi',
      unterrichtsvorhaben: 'photosynthese',
      outputPath: zipPath,
    },
    { ...senderOptions, confirmed: true }
  );
  assert.strictEqual(result.ok, true, `Fixture-Export fehlgeschlagen: ${result.message}`);
  return zipPath;
}

test('Vorschau: entpackt sicher in den Eingangsort, ohne die Chronologie zu beruehren', () => {
  const baseDir = makeTmpDir();
  const empfaengerRoot = path.join(baseDir, 'empfaenger');
  fs.mkdirSync(empfaengerRoot, { recursive: true });
  const zipPath = buildMaterialpaketZip(baseDir, path.join(baseDir, 'photosynthese-materialpaket.zip'));

  const options = withConfiguredWorkspace(empfaengerRoot);
  const result = uebernehmeEingangspaket({ archivePath: zipPath, eingangsort: '_eingang/photosynthese' }, options);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, 'preview');
  assert.strictEqual(result.inhaltsordner, 'photosynthese');
  assert.match(result.manifest, /Modus: Material/);

  const eingangsort = path.join(empfaengerRoot, '_eingang', 'photosynthese');
  assert.ok(fs.existsSync(path.join(eingangsort, 'manifest.md')));
  assert.ok(fs.existsSync(path.join(eingangsort, 'photosynthese', 'CONTEXT.md')));
  assert.strictEqual(
    fs.readFileSync(path.join(eingangsort, 'photosynthese', 'plan.md'), 'utf8'),
    '# Unterrichtsvorhaben: Photosynthese\n\nPlan-Text.\n'
  );

  // Vorschau legt noch keinen Ordner in der Chronologie an.
  assert.deepStrictEqual(
    fs.readdirSync(empfaengerRoot).filter((name) => name !== '_eingang'),
    []
  );
});

test('AC1: Eingangspaket bleibt bis zur Bestaetigung unveraendert - auch nach Vorschau und nach der Uebernahme', () => {
  const baseDir = makeTmpDir();
  const empfaengerRoot = path.join(baseDir, 'empfaenger');
  fs.mkdirSync(empfaengerRoot, { recursive: true });
  const zipPath = buildMaterialpaketZip(baseDir, path.join(baseDir, 'photosynthese-materialpaket.zip'));
  const options = withConfiguredWorkspace(empfaengerRoot);
  const fields = { archivePath: zipPath, eingangsort: '_eingang/photosynthese', zielVerzeichnis: '2025-26/7b/nawi' };

  const preview = uebernehmeEingangspaket(fields, options);
  assert.strictEqual(preview.status, 'preview');
  const planVorher = fs.readFileSync(path.join(preview.eingangsort, 'photosynthese', 'plan.md'), 'utf8');

  const uebernahme = uebernehmeEingangspaket(fields, { ...options, confirmed: true });
  assert.strictEqual(uebernahme.ok, true);
  assert.strictEqual(uebernahme.status, 'uebernommen');

  // Eingangsort bleibt nach der Uebernahme unangetastet bestehen.
  assert.ok(fs.existsSync(preview.eingangsort));
  assert.strictEqual(fs.readFileSync(path.join(preview.eingangsort, 'photosynthese', 'plan.md'), 'utf8'), planVorher);

  // Zielordner enthaelt eine eigene Kopie.
  assert.ok(fs.existsSync(path.join(uebernahme.zielOrdner, 'plan.md')));
  assert.notStrictEqual(uebernahme.zielOrdner, path.join(preview.eingangsort, 'photosynthese'));
});

test('AC2: Namensgleichheit erzeugt einen neuen eindeutigen Ordner, beide Staende bleiben erhalten', () => {
  const baseDir = makeTmpDir();
  const empfaengerRoot = path.join(baseDir, 'empfaenger');
  fs.mkdirSync(empfaengerRoot, { recursive: true });
  const zipPath = buildMaterialpaketZip(baseDir, path.join(baseDir, 'photosynthese-materialpaket.zip'));
  const options = withConfiguredWorkspace(empfaengerRoot);

  // Bereits ein eigenes Vorhaben gleichen Namens in der Zielchronologie.
  const bestehenderOrdner = path.join(empfaengerRoot, '2025-26', '7b', 'nawi', 'photosynthese');
  fs.mkdirSync(bestehenderOrdner, { recursive: true });
  fs.writeFileSync(path.join(bestehenderOrdner, 'CONTEXT.md'), 'eigenes-vorhaben', 'utf8');

  const result = uebernehmeEingangspaket(
    { archivePath: zipPath, eingangsort: '_eingang/photosynthese', zielVerzeichnis: '2025-26/7b/nawi' },
    { ...options, confirmed: true }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.umbenannt, true);
  assert.strictEqual(path.basename(result.zielOrdner), 'photosynthese-2');

  // Beide Staende existieren nebeneinander, keiner wurde ueberschrieben/gemergt.
  assert.strictEqual(fs.readFileSync(path.join(bestehenderOrdner, 'CONTEXT.md'), 'utf8'), 'eigenes-vorhaben');
  assert.ok(fs.existsSync(path.join(result.zielOrdner, 'CONTEXT.md')));
  assert.match(fs.readFileSync(path.join(result.zielOrdner, 'CONTEXT.md'), 'utf8'), /title: Photosynthese/);
});

test('AC2: Bei erneuter Namensgleichheit wird weitergezaehlt (photosynthese-3)', () => {
  const baseDir = makeTmpDir();
  const empfaengerRoot = path.join(baseDir, 'empfaenger');
  fs.mkdirSync(empfaengerRoot, { recursive: true });
  const zipPath = buildMaterialpaketZip(baseDir, path.join(baseDir, 'photosynthese-materialpaket.zip'));
  const options = withConfiguredWorkspace(empfaengerRoot);

  fs.mkdirSync(path.join(empfaengerRoot, '2025-26', '7b', 'nawi', 'photosynthese'), { recursive: true });
  fs.mkdirSync(path.join(empfaengerRoot, '2025-26', '7b', 'nawi', 'photosynthese-2'), { recursive: true });

  const result = uebernehmeEingangspaket(
    { archivePath: zipPath, eingangsort: '_eingang/photosynthese', zielVerzeichnis: '2025-26/7b/nawi' },
    { ...options, confirmed: true }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(path.basename(result.zielOrdner), 'photosynthese-3');
});

test('AC3: beschaedigtes Archiv wird abgewiesen, bevor der Eingangsort beschrieben wird', () => {
  const baseDir = makeTmpDir();
  const empfaengerRoot = path.join(baseDir, 'empfaenger');
  fs.mkdirSync(empfaengerRoot, { recursive: true });
  const zipPath = path.join(baseDir, 'kaputt.zip');
  writeZipFile([{ name: 'manifest.md', data: Buffer.from('# Manifest\n') }], zipPath);
  fs.writeFileSync(zipPath, fs.readFileSync(zipPath).subarray(0, 10)); // Datei abschneiden

  const options = withConfiguredWorkspace(empfaengerRoot);
  const result = uebernehmeEingangspaket({ archivePath: zipPath, eingangsort: '_eingang/kaputt' }, options);

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /nicht sicher entpackt|beschaedigt/);
  assert.strictEqual(fs.existsSync(path.join(empfaengerRoot, '_eingang')), false);
});

test('AC3: Archiv mit Pfadtraversierung wird abgewiesen, bevor irgendeine Datei geschrieben wird', () => {
  const baseDir = makeTmpDir();
  const empfaengerRoot = path.join(baseDir, 'empfaenger');
  fs.mkdirSync(empfaengerRoot, { recursive: true });

  // Rohes ZIP mit Traversal-Eintrag, unabhaengig von der (sicheren)
  // Schreibfunktion gebaut - die wuerde einen solchen Namen selbst ablehnen.
  const zlib = require('node:zlib');
  const nameBuffer = Buffer.from('../ausserhalb.txt', 'utf8');
  const data = Buffer.from('boesartig');
  const crc32 = zlib.crc32(data) >>> 0;
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt32LE(crc32, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  const localSection = Buffer.concat([localHeader, nameBuffer, data]);
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt32LE(crc32, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  centralHeader.writeUInt32LE(0, 42);
  const centralSection = Buffer.concat([centralHeader, nameBuffer]);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralSection.length, 12);
  endRecord.writeUInt32LE(localSection.length, 16);
  const zipPath = path.join(baseDir, 'traversal.zip');
  fs.writeFileSync(zipPath, Buffer.concat([localSection, centralSection, endRecord]));

  const options = withConfiguredWorkspace(empfaengerRoot);
  const result = uebernehmeEingangspaket({ archivePath: zipPath, eingangsort: '_eingang/boesartig' }, options);

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /Pfadabschnitt/);
  assert.strictEqual(fs.existsSync(path.join(empfaengerRoot, '_eingang')), false);
  assert.strictEqual(fs.existsSync(path.join(empfaengerRoot, '..', 'ausserhalb.txt')), false);
});

test('Eingangsort und Zielverzeichnis muessen innerhalb des Arbeitsbereichs liegen', () => {
  const baseDir = makeTmpDir();
  const empfaengerRoot = path.join(baseDir, 'empfaenger');
  fs.mkdirSync(empfaengerRoot, { recursive: true });
  const zipPath = buildMaterialpaketZip(baseDir, path.join(baseDir, 'photosynthese-materialpaket.zip'));
  const options = withConfiguredWorkspace(empfaengerRoot);

  const result = uebernehmeEingangspaket({ archivePath: zipPath, eingangsort: '../ausserhalb' }, options);

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /Arbeitsbereich/);
});

test('Wiederverwendeter Eingangsort mit Inhalt eines ANDEREN Archivs wird abgewiesen statt still weiterzuverwenden', () => {
  const baseDir = makeTmpDir();
  const empfaengerRoot = path.join(baseDir, 'empfaenger');
  fs.mkdirSync(empfaengerRoot, { recursive: true });
  const optionen = withConfiguredWorkspace(empfaengerRoot);

  const ersteZip = buildMaterialpaketZip(baseDir, path.join(baseDir, 'photosynthese-materialpaket.zip'));
  const ersteVorschau = uebernehmeEingangspaket({ archivePath: ersteZip, eingangsort: '_eingang/paket' }, optionen);
  assert.strictEqual(ersteVorschau.ok, true);

  // Anderes Archiv (andere Datei) wird versehentlich in denselben, bereits
  // befuellten Eingangsort geleitet.
  const zweiteZip = path.join(baseDir, 'anderes-paket.zip');
  fs.writeFileSync(zweiteZip, fs.readFileSync(ersteZip));
  fs.utimesSync(zweiteZip, new Date(), new Date(Date.now() + 60_000));

  const zweiteVorschau = uebernehmeEingangspaket({ archivePath: zweiteZip, eingangsort: '_eingang/paket' }, optionen);

  assert.strictEqual(zweiteVorschau.ok, false);
  assert.match(zweiteVorschau.message, /anderen Pakets/);
});

test('Fehlendes Archiv liefert {ok: false, message}', () => {
  const baseDir = makeTmpDir();
  const options = withConfiguredWorkspace(baseDir);

  const result = uebernehmeEingangspaket(
    { archivePath: path.join(baseDir, 'nicht-vorhanden.zip'), eingangsort: '_eingang/x' },
    options
  );

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /nicht gefunden/);
});
