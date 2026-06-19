'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  journalPath,
  appendJournalEntry,
  chooseWorkflowNoteScope,
  formatDecisionNote,
  recordWorkflowNote,
  formatUmsetzungsbericht,
  findOpenNacharbeit,
} = require('../lib/journal');

const {
  getLerngruppenPath,
  getFachprofilPath,
} = require('../lib/local-context-paths');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'journal-test-'));
}

// ─────────────────────────────────────────────────────────────
// journalPath
// ─────────────────────────────────────────────────────────────

test('journalPath: scope "klasse" liefert datierte Datei im Lerngruppen-Ordner', () => {
  const result = journalPath(
    { schuljahr: '2025-26', klasse: '7a' },
    'klasse',
    '2026-06-11'
  );

  assert.strictEqual(
    result,
    path.join(getLerngruppenPath('2025-26', '7a'), 'journal-2026-06-11.md')
  );
});

test('journalPath: scope "unterrichtsordner" liefert datierte Datei im Fachprofil-Ordner', () => {
  const result = journalPath(
    { schuljahr: '2025-26', klasse: '7a', unterrichtsordner: 'naturwissenschaften' },
    'unterrichtsordner',
    '2026-06-11'
  );

  assert.strictEqual(
    result,
    path.join(
      getFachprofilPath('2025-26', '7a', 'naturwissenschaften'),
      'journal-2026-06-11.md'
    )
  );
});

test('journalPath: akzeptiert ein Date-Objekt und formatiert es als YYYY-MM-DD', () => {
  const date = new Date(Date.UTC(2026, 0, 5)); // 2026-01-05
  const result = journalPath({ schuljahr: '2025-26', klasse: '7a' }, 'klasse', date);

  assert.strictEqual(
    result,
    path.join(getLerngruppenPath('2025-26', '7a'), 'journal-2026-01-05.md')
  );
});

test('journalPath: scope "unterrichtsordner" ohne unterrichtsordner wirft Fehler', () => {
  assert.throws(
    () => journalPath({ schuljahr: '2025-26', klasse: '7a' }, 'unterrichtsordner', '2026-06-11'),
    /Unterrichtsordner/
  );
});

test('journalPath: unbekannter scope wirft Fehler', () => {
  assert.throws(
    () => journalPath({ schuljahr: '2025-26', klasse: '7a' }, 'sonstwas', '2026-06-11'),
    /scope/i
  );
});

// ─────────────────────────────────────────────────────────────
// appendJournalEntry
// ─────────────────────────────────────────────────────────────

test('appendJournalEntry: legt Datei mit Header an, wenn sie noch nicht existiert', () => {
  const baseDir = makeTmpDir();
  const filePath = path.join(baseDir, 'journal-2026-06-11.md');

  appendJournalEntry(filePath, '## 09:00 Uhr\n\nErster Eintrag.');

  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /# Journal/);
  assert.match(content, /Erster Eintrag\./);
});

test('appendJournalEntry: haengt weiteren Eintrag an, ohne den ersten zu ueberschreiben', () => {
  const baseDir = makeTmpDir();
  const filePath = path.join(baseDir, 'journal-2026-06-11.md');

  appendJournalEntry(filePath, '## 09:00 Uhr\n\nErster Eintrag.');
  appendJournalEntry(filePath, '## 14:00 Uhr\n\nZweiter Eintrag.');

  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /Erster Eintrag\./);
  assert.match(content, /Zweiter Eintrag\./);

  // Reihenfolge: erster Eintrag steht vor dem zweiten
  const firstIndex = content.indexOf('Erster Eintrag.');
  const secondIndex = content.indexOf('Zweiter Eintrag.');
  assert.ok(firstIndex < secondIndex);
});

test('appendJournalEntry: legt fehlende Ordner an', () => {
  const baseDir = makeTmpDir();
  const filePath = path.join(baseDir, 'tief', 'verschachtelt', 'journal-2026-06-11.md');

  appendJournalEntry(filePath, 'Eintrag in neuem Ordner.');

  assert.ok(fs.existsSync(filePath));
  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /Eintrag in neuem Ordner\./);
});

test('appendJournalEntry: mehrfacher Append am selben Tag ueberschreibt keinen bestehenden Eintrag', () => {
  const baseDir = makeTmpDir();
  const filePath = path.join(baseDir, 'journal-2026-06-11.md');

  appendJournalEntry(filePath, 'Eintrag A');
  appendJournalEntry(filePath, 'Eintrag B');
  appendJournalEntry(filePath, 'Eintrag C');

  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /Eintrag A/);
  assert.match(content, /Eintrag B/);
  assert.match(content, /Eintrag C/);
});

// ─────────────────────────────────────────────────────────────
// Entscheidungsnotizen / Dokumentationsroutine
// ─────────────────────────────────────────────────────────────

test('chooseWorkflowNoteScope: Lerngruppenentscheidungen landen im Klassenjournal', () => {
  assert.strictEqual(chooseWorkflowNoteScope({ type: 'lerngruppe' }), 'klasse');
});

test('chooseWorkflowNoteScope: fachliche Entscheidungen landen im Unterrichtsordner-Journal', () => {
  assert.strictEqual(chooseWorkflowNoteScope({ type: 'material' }), 'unterrichtsordner');
  assert.strictEqual(chooseWorkflowNoteScope({ type: 'test' }), 'unterrichtsordner');
  assert.strictEqual(chooseWorkflowNoteScope({ type: 'moodle-planung' }), 'unterrichtsordner');
});

test('chooseWorkflowNoteScope: Kontextentscheidungen nutzen vorhandenen Unterrichtsordner, sonst Klasse', () => {
  assert.strictEqual(
    chooseWorkflowNoteScope({ type: 'kontext' }, { unterrichtsordner: 'naturwissenschaften' }),
    'unterrichtsordner'
  );
  assert.strictEqual(chooseWorkflowNoteScope({ type: 'kontext' }, {}), 'klasse');
});

test('formatDecisionNote: formatiert Entscheidung, Begruendung und offene Fragen', () => {
  const note = formatDecisionNote({
    type: 'test',
    decision: 'Lerncheck bleibt zeitoffen mit 80 Prozent Bestehensgrenze.',
    reason: 'Die Lerngruppe soll vor der Arbeit mehrfach ueben koennen.',
    openQuestions: ['Soll der Intensivmodus fuer Wiederholungsfragen spaeter ergaenzt werden?'],
    date: '2026-06-14',
  });

  assert.match(note, /## 2026-06-14 Entscheidungsnotiz/);
  assert.match(note, /Typ: test/);
  assert.match(note, /Lerncheck bleibt zeitoffen/);
  assert.match(note, /Die Lerngruppe soll/);
  assert.match(note, /Offene Anschlussfragen/);
  assert.match(note, /Intensivmodus/);
});

test('recordWorkflowNote: schreibt Lerngruppenentscheidung ins Klassenjournal', () => {
  const baseDir = makeTmpDir();

  const result = recordWorkflowNote(baseDir, {
    schuljahr: '2025-26',
    klasse: '7a',
    date: '2026-06-14',
    note: {
      type: 'lerngruppe',
      decision: 'Partnerarbeit nur mit klaren Rollen planen.',
      reason: 'Die Gruppendynamik kippt sonst bei offenen Aufgaben.',
    },
  });

  assert.strictEqual(result.scope, 'klasse');
  assert.strictEqual(
    result.journalPath,
    path.join(baseDir, 'local-context', '2025-26', '7a', 'journal-2026-06-14.md')
  );

  const content = fs.readFileSync(result.journalPath, 'utf8');
  assert.match(content, /Partnerarbeit nur mit klaren Rollen/);
  assert.match(content, /Gruppendynamik/);
});

test('recordWorkflowNote: schreibt Materialentscheidung ins Unterrichtsordner-Journal', () => {
  const baseDir = makeTmpDir();

  const result = recordWorkflowNote(baseDir, {
    schuljahr: '2025-26',
    klasse: '7a',
    unterrichtsordner: 'naturwissenschaften',
    date: '2026-06-14',
    note: {
      type: 'material',
      decision: 'Schulbuchscan wird per OCR als Textseite umgesetzt.',
      reason: 'Der Text soll durchsuchbar sein und spaeter fuer Testfeedback dienen.',
      openQuestions: ['Abbildung noch als gezielter Bildausschnitt pruefen.'],
    },
  });

  assert.strictEqual(result.scope, 'unterrichtsordner');
  assert.strictEqual(
    result.journalPath,
    path.join(
      baseDir,
      'local-context',
      '2025-26',
      '7a',
      'naturwissenschaften',
      'journal-2026-06-14.md'
    )
  );

  const content = fs.readFileSync(result.journalPath, 'utf8');
  assert.match(content, /Schulbuchscan wird per OCR/);
  assert.match(content, /Abbildung noch/);
});

test('recordWorkflowNote: fachliche Notiz ohne Unterrichtsordner wirft klaerenden Fehler', () => {
  const baseDir = makeTmpDir();

  assert.throws(
    () => recordWorkflowNote(baseDir, {
      schuljahr: '2025-26',
      klasse: '7a',
      date: '2026-06-14',
      note: {
        type: 'moodle-planung',
        decision: 'Abschnitt 6.2 wird fuer das Unterthema genutzt.',
      },
    }),
    /Unterrichtsordner/
  );
});

test('recordWorkflowNote: liest den Kurspilot-Arbeitsbereich aus der Arbeitsbereich-Einstellung', () => {
  const baseDir = makeTmpDir();

  const result = recordWorkflowNote(
    {
      schuljahr: '2025-26',
      klasse: '7b',
      date: '2026-06-15',
      note: {
        type: 'lerngruppe',
        decision: 'Vokabeltests kuerzer takten.',
      },
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
    result.journalPath,
    path.join(baseDir, 'local-context', '2025-26', '7b', 'journal-2026-06-15.md')
  );
  assert.match(fs.readFileSync(result.journalPath, 'utf8'), /Vokabeltests kuerzer takten/);
});

// ─────────────────────────────────────────────────────────────
// formatUmsetzungsbericht
// ─────────────────────────────────────────────────────────────

test('formatUmsetzungsbericht: formatiert Erfolge mit Moodle-IDs aus applyPlan-Resultat', () => {
  const planResult = {
    created: [
      { activityId: 'activity-1', name: 'Infoseite', cmid: 101 },
      { activityId: 'activity-2', name: 'Reflexionsauftrag', cmid: 102 },
    ],
  };

  const report = formatUmsetzungsbericht(planResult);

  assert.match(report, /## Erfolge/);
  assert.match(report, /Infoseite.*101/);
  assert.match(report, /Reflexionsauftrag.*102/);
  assert.match(report, /## Fehler/);
  assert.match(report, /## Offene Nacharbeit/);
});

test('formatUmsetzungsbericht: ohne Erfolge zeigt Hinweistext im Abschnitt', () => {
  const report = formatUmsetzungsbericht({ created: [] });

  assert.match(report, /## Erfolge/);
  assert.match(report, /keine|Keine/);
});

test('formatUmsetzungsbericht: Fehler-Liste wird im Abschnitt "Fehler" aufgefuehrt', () => {
  const planResult = {
    created: [{ activityId: 'activity-1', name: 'Infoseite', cmid: 101 }],
    errors: [
      { activityName: 'Reflexionsauftrag', message: 'Moodle-Webservice antwortete mit Fehler 500' },
    ],
  };

  const report = formatUmsetzungsbericht(planResult);

  assert.match(report, /## Fehler/);
  assert.match(report, /Reflexionsauftrag/);
  assert.match(report, /Fehler 500/);
});

test('formatUmsetzungsbericht: Offene Nacharbeit wird im Abschnitt "Offene Nacharbeit" aufgefuehrt', () => {
  const planResult = {
    created: [{ activityId: 'activity-1', name: 'Infoseite', cmid: 101 }],
    openTasks: [
      'Restriction fuer "Vertiefungsaufgabe" manuell pruefen, da cmid noch unbekannt war.',
    ],
  };

  const report = formatUmsetzungsbericht(planResult);

  assert.match(report, /## Offene Nacharbeit/);
  assert.match(report, /Vertiefungsaufgabe/);
});

test('formatUmsetzungsbericht: nutzt optionalen Link, wenn ein erstelltes Element ihn mitliefert', () => {
  const planResult = {
    created: [
      { activityId: 'activity-1', name: 'Infoseite', cmid: 101, link: 'https://moodle.example/mod/page/view.php?id=101' },
    ],
  };

  const report = formatUmsetzungsbericht(planResult);
  assert.match(report, /https:\/\/moodle\.example\/mod\/page\/view\.php\?id=101/);
});

// ─────────────────────────────────────────────────────────────
// findOpenNacharbeit
// ─────────────────────────────────────────────────────────────

test('findOpenNacharbeit: findet Eintraege aus dem Abschnitt "Offene Nacharbeit" ueber mehrere Dateien', () => {
  const baseDir = makeTmpDir();
  const fileA = path.join(baseDir, 'journal-2026-06-10.md');
  const fileB = path.join(baseDir, 'journal-2026-06-11.md');

  appendJournalEntry(fileA, [
    '## Umsetzungsbericht 2026-06-10',
    '',
    '### Erfolge',
    '',
    '- Infoseite (Moodle-ID 101)',
    '',
    '### Fehler',
    '',
    '_(keine)_',
    '',
    '### Offene Nacharbeit',
    '',
    '- Restriction fuer "Vertiefungsaufgabe" manuell pruefen.',
  ].join('\n'));

  appendJournalEntry(fileB, [
    '## Umsetzungsbericht 2026-06-11',
    '',
    '### Erfolge',
    '',
    '- Reflexionsauftrag (Moodle-ID 102)',
    '',
    '### Fehler',
    '',
    '_(keine)_',
    '',
    '### Offene Nacharbeit',
    '',
    '- Feedback fuer Distraktor "B" noch ergaenzen.',
    '- Materialluecke bei Frage 3 klaeren.',
  ].join('\n'));

  const result = findOpenNacharbeit([fileA, fileB]);

  assert.strictEqual(result.length, 3);

  assert.ok(result.some(entry => /Vertiefungsaufgabe/.test(entry.text)));
  assert.ok(result.some(entry => /Distraktor/.test(entry.text)));
  assert.ok(result.some(entry => /Materialluecke/.test(entry.text)));

  for (const entry of result) {
    assert.ok(entry.file === fileA || entry.file === fileB);
    assert.ok(typeof entry.date === 'string');
  }
});

test('findOpenNacharbeit: ignoriert Dateien ohne Abschnitt "Offene Nacharbeit"', () => {
  const baseDir = makeTmpDir();
  const fileA = path.join(baseDir, 'journal-2026-06-10.md');

  appendJournalEntry(fileA, [
    '## Notiz 2026-06-10',
    '',
    'Nur eine allgemeine Notiz ohne offene Punkte.',
  ].join('\n'));

  const result = findOpenNacharbeit([fileA]);
  assert.deepStrictEqual(result, []);
});

test('findOpenNacharbeit: ignoriert "(keine)"-Platzhalter als offenen Punkt', () => {
  const baseDir = makeTmpDir();
  const fileA = path.join(baseDir, 'journal-2026-06-10.md');

  appendJournalEntry(fileA, [
    '## Umsetzungsbericht 2026-06-10',
    '',
    '### Offene Nacharbeit',
    '',
    '_(keine)_',
  ].join('\n'));

  const result = findOpenNacharbeit([fileA]);
  assert.deepStrictEqual(result, []);
});

test('findOpenNacharbeit: ueberspringt nicht existierende Dateien', () => {
  const baseDir = makeTmpDir();
  const missing = path.join(baseDir, 'journal-2026-06-09.md');

  const result = findOpenNacharbeit([missing]);
  assert.deepStrictEqual(result, []);
});
