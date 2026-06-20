'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createLerngruppenprofil,
  createFachprofil,
  setupKurspilotWorkspace,
} = require('../lib/local-context-setup');
const {
  getLerngruppenContextFile,
  getFachprofilContextFile,
} = require('../lib/local-context-paths');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'local-context-test-'));
}

test('createLerngruppenprofil legt CONTEXT.md mit Pflichtfeldern an', () => {
  const baseDir = makeTmpDir();

  const filePath = createLerngruppenprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
  });

  const expectedPath = path.join(baseDir, getLerngruppenContextFile('2025-26', '7a'));
  assert.strictEqual(filePath, expectedPath);
  assert.ok(fs.existsSync(filePath));

  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /2025-26/);
  assert.match(content, /7a/);
  assert.match(content, /Optionaler Planungskontext/);
});

test('createFachprofil legt CONTEXT.md im Unterrichtsordner an', () => {
  const baseDir = makeTmpDir();

  const filePath = createFachprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    unterrichtsordner: 'naturwissenschaften',
  });

  const expectedPath = path.join(
    baseDir,
    getFachprofilContextFile('2025-26', '7a', 'naturwissenschaften')
  );
  assert.strictEqual(filePath, expectedPath);
  assert.ok(fs.existsSync(filePath));

  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /naturwissenschaften/);
  assert.match(content, /Lerngruppenprofil: `\.\.\/CONTEXT\.md`/);
});

test('optionaler Planungskontext wird nur eingetragen, wenn explizit angegeben', () => {
  const baseDir = makeTmpDir();

  const filePath = createLerngruppenprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7b',
    optionalContext: {
      leistungsstand: 'Heterogen, drei Lernende mit Foerderbedarf Mathematik',
    },
  });

  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /Heterogen, drei Lernende mit Foerderbedarf Mathematik/);
});

test('Verwandter Kontext: zwei sich gegenseitig referenzierende Lerngruppenprofile', () => {
  const baseDir = makeTmpDir();

  const pathA = createLerngruppenprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    verwandterKontext: '7a-e-kurs-nawi (Teilgruppe NaWi, siehe local-context/2025-26/7a-e-kurs-nawi/CONTEXT.md)',
  });

  const pathB = createLerngruppenprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a-e-kurs-nawi',
    verwandterKontext: '7a (Stammklasse, siehe local-context/2025-26/7a/CONTEXT.md)',
    optionalContext: {
      gruppendynamik: 'Geheimnis B: nur in diesem Profil sichtbar',
    },
  });

  const contentA = fs.readFileSync(pathA, 'utf8');
  const contentB = fs.readFileSync(pathB, 'utf8');

  // Beide Profile enthalten den jeweils anderen nur als Verweis-Text ...
  assert.match(contentA, /7a-e-kurs-nawi \(Teilgruppe NaWi/);
  assert.match(contentB, /7a \(Stammklasse/);

  // ... aber Inhalte aus B werden NICHT automatisch in A uebernommen
  // (kein automatisches gegenseitiges Lesen/Inhalts-Mischen ohne explizite Anfrage)
  assert.doesNotMatch(contentA, /Geheimnis B/);
});

test('setupKurspilotWorkspace legt den Kurspilot-Arbeitsbereich an und nennt die Abschlussweiche', () => {
  const baseDir = makeTmpDir();

  const result = setupKurspilotWorkspace(
    {
      schuljahr: '2025-26',
      klasseOderLerngruppe: '7a',
      unterrichtsordner: 'naturwissenschaften',
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

  assert.strictEqual(result.workspaceRoot, path.join(baseDir, 'local-context', '2025-26', '7a', 'naturwissenschaften'));
  assert.ok(fs.existsSync(result.lerngruppenContextFile));
  assert.ok(fs.existsSync(result.fachprofilContextFile));
  assert.match(result.teacherFacingText, /Kurspilot/i);
  assert.match(result.teacherFacingText, /Kurspilot-Arbeitsbereich/);
  assert.match(result.teacherFacingText, new RegExp(baseDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.teacherFacingText, /Setup-Abschlussweiche/i);
  assert.match(result.teacherFacingText, /Plan jetzt/i);
});

test('setupKurspilotWorkspace fragt erst Pflichtkontext und bietet optionale Planungskontexte mit Skip an', () => {
  const baseDir = makeTmpDir();

  const result = setupKurspilotWorkspace(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7b',
    unterrichtsordner: 'englisch',
  });

  assert.deepStrictEqual(
    result.flow.requiredPrompts.map((prompt) => prompt.label),
    ['Schuljahr', 'Klasse oder Lerngruppe', 'Unterrichtsordner']
  );
  assert.deepStrictEqual(
    result.flow.optionalPlanningPrompts.map((prompt) => prompt.label),
    [
      'Leistungsstand',
      'Sprachstand',
      'Besondere Lernbedarfe',
      'Gruppendynamik',
      'Technische Bedingungen',
    ]
  );
  assert.ok(result.flow.optionalPlanningPrompts.every((prompt) => prompt.answerMode === 'frei oder skip'));

  const content = fs.readFileSync(result.lerngruppenContextFile, 'utf8');
  assert.match(content, /Optionaler Planungskontext/);
  assert.match(content, /_\((?:noch nicht erfasst|noch nicht erfasst)\)_/);
});

test('setupKurspilotWorkspace bestaetigt vorhandene Dateien ohne sie zu ueberschreiben', () => {
  const baseDir = makeTmpDir();
  const fields = {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7c',
    unterrichtsordner: 'mathematik',
  };

  const existingLerngruppenPath = createLerngruppenprofil(baseDir, {
    ...fields,
    beobachtungen: 'Bereits erfasst',
  });
  const existingFachprofilPath = createFachprofil(baseDir, fields);
  const originalContent = fs.readFileSync(existingLerngruppenPath, 'utf8');
  const originalFachprofilContent = fs.readFileSync(existingFachprofilPath, 'utf8');

  const result = setupKurspilotWorkspace(baseDir, fields);

  assert.strictEqual(result.status, 'confirmed');
  assert.ok(result.existingFiles.includes(existingLerngruppenPath));
  assert.ok(result.existingFiles.includes(existingFachprofilPath));
  assert.ok(fs.existsSync(result.fachprofilContextFile));
  assert.strictEqual(fs.readFileSync(existingLerngruppenPath, 'utf8'), originalContent);
  assert.strictEqual(fs.readFileSync(existingFachprofilPath, 'utf8'), originalFachprofilContent);
});

test('setupKurspilotWorkspace bricht ohne Arbeitsbereich-Einstellung mit Verweis aufs Konfigurationsprogramm ab', () => {
  assert.throws(
    () => setupKurspilotWorkspace(
      {
        schuljahr: '2025-26',
        klasseOderLerngruppe: '7d',
        unterrichtsordner: 'geschichte',
      },
      {
        readWorkspaceSetting: () => ({
          ok: false,
          status: 'missing',
          message: 'Arbeitsbereich-Einstellung fehlt. Bitte das Kurspilot-Konfigurationsprogramm ausfuehren.',
        }),
      }
    ),
    /Konfigurationsprogramm/
  );
});
