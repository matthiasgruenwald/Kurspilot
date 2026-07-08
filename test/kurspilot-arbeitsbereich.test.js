'use strict';

/**
 * Integrationstests fuer das schmale Modul lib/kurspilot-arbeitsbereich.js
 * (Issue #149). Das Modul buendelt lib/local-context-paths.js,
 * lib/kurspilot-context-resolver.js, lib/kurspilot-workspace-config.js,
 * lib/journal.js und lib/unterrichtsvorhaben-workspace.js hinter einer
 * kleinen, einheitlichen Funktionsmenge (laden, Kontextdokumente lesen,
 * Journal-/Statusbericht schreiben) mit konsistenter Rueckgabeform.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ladeArbeitsbereich,
  leseKontextdokumente,
  schreibeUmsetzungsbericht,
} = require('../lib/kurspilot-arbeitsbereich');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-arbeitsbereich-test-'));
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

test('ladeArbeitsbereich: liefert einheitliches Format {ok, contextRoot} bei konfiguriertem Arbeitsbereich', () => {
  const baseDir = makeTmpDir();

  const result = ladeArbeitsbereich(withConfiguredWorkspace(baseDir));

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contextRoot, path.resolve(baseDir));
});

test('ladeArbeitsbereich: liefert einheitliches Format {ok: false, message} ohne konfigurierten Arbeitsbereich', () => {
  const result = ladeArbeitsbereich({
    readWorkspaceSetting: () => ({
      ok: false,
      status: 'missing',
      configPath: '/nirgendwo/config.json',
      message: 'Arbeitsbereich-Einstellung fehlt. Bitte das Kurspilot-Konfigurationsprogramm ausfuehren.',
    }),
  });

  assert.strictEqual(result.ok, false);
  assert.match(result.message, /Konfigurationsprogramm/);
});

test('leseKontextdokumente: liefert einheitliches Format mit Dokumentenliste, von spezifisch nach allgemein', () => {
  const baseDir = makeTmpDir();
  const fachprofilDir = path.join(baseDir, 'local-context', '2025-26', '7a', 'nawi');
  fs.mkdirSync(fachprofilDir, { recursive: true });
  fs.writeFileSync(path.join(fachprofilDir, 'CONTEXT.md'), '# Fachprofil NaWi\n', 'utf8');

  const result = leseKontextdokumente(
    {
      schuljahr: '2025-26',
      klasseOderLerngruppe: '7a',
      unterrichtsordner: 'nawi',
    },
    withConfiguredWorkspace(baseDir)
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.contextRoot, path.resolve(baseDir));
  assert.ok(Array.isArray(result.documents));
  assert.ok(result.availableDocuments.some((doc) => doc.kind === 'unterrichtsordner'));
  assert.ok(result.missingDocuments.some((doc) => doc.kind === 'lerngruppenprofil'));
});

test('Integration: Plan umgesetzt -> Umsetzungsbericht landet im korrekten Journal', () => {
  const baseDir = makeTmpDir();
  const options = withConfiguredWorkspace(baseDir);

  // Arbeitsbereich laden (wie kurspilot-umsetzen es vor jedem Schreibzugriff tut).
  const workspace = ladeArbeitsbereich(options);
  assert.strictEqual(workspace.ok, true);

  // Ergebnis eines umgesetzten Plans (Form von applyPlan() aus implementation-plan.js).
  const planResult = {
    created: [
      { activityLabel: 'Textseite', name: 'Infoseite Photosynthese', cmid: 501, link: 'https://moodle.example/mod/page/view.php?id=501' },
      { activityLabel: 'Aufgabe', name: 'Arbeitsauftrag Photosynthese', cmid: 502 },
    ],
    errors: [],
    openTasks: ['Quiz-Fragen noch mit Fachkonferenz abstimmen.'],
  };

  const result = schreibeUmsetzungsbericht(
    {
      schuljahr: '2025-26',
      klasse: '7a',
      unterrichtsordner: 'nawi',
      planResult,
    },
    options
  );

  assert.strictEqual(result.ok, true);
  assert.ok(result.journalPath.includes(path.join('local-context', '2025-26', '7a', 'nawi')));
  assert.ok(fs.existsSync(result.journalPath), 'Journal-Datei muss angelegt worden sein');

  const journalContent = fs.readFileSync(result.journalPath, 'utf8');
  assert.match(journalContent, /## Erfolge/);
  assert.match(journalContent, /Textseite: Infoseite Photosynthese \(Moodle-ID 501\)/);
  assert.match(journalContent, /## Fehler/);
  assert.match(journalContent, /_\(keine\)_/);
  assert.match(journalContent, /## Offene Nacharbeit/);
  assert.match(journalContent, /Quiz-Fragen noch mit Fachkonferenz abstimmen\./);

  // Landet im Unterrichtsordner-Journal, nicht im Klassen-Journal.
  assert.match(result.journalPath, /nawi[\\/]journal-\d{4}-\d{2}-\d{2}\.md$/);
});

test('schreibeUmsetzungsbericht: zweiter Aufruf am selben Tag haengt an, ueberschreibt bestehenden Eintrag nicht', () => {
  const baseDir = makeTmpDir();
  const options = withConfiguredWorkspace(baseDir);
  const date = '2026-06-11';

  const first = schreibeUmsetzungsbericht(
    {
      schuljahr: '2025-26',
      klasse: '7a',
      unterrichtsordner: 'nawi',
      date,
      planResult: { created: [{ name: 'Erster Eintrag' }], errors: [], openTasks: [] },
    },
    options
  );

  const second = schreibeUmsetzungsbericht(
    {
      schuljahr: '2025-26',
      klasse: '7a',
      unterrichtsordner: 'nawi',
      date,
      planResult: { created: [{ name: 'Zweiter Eintrag' }], errors: [], openTasks: [] },
    },
    options
  );

  assert.strictEqual(first.journalPath, second.journalPath);
  const journalContent = fs.readFileSync(second.journalPath, 'utf8');
  assert.match(journalContent, /Erster Eintrag/);
  assert.match(journalContent, /Zweiter Eintrag/);
});
