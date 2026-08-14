'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createLerngruppenprofil,
  createFachprofil,
  createVorhabenContext,
  setupKurspilotWorkspace,
} = require('../lib/local-context-setup');
const {
  getLerngruppenContextFile,
  getFachprofilContextFile,
  getUnterrichtsvorhabenContextFile,
} = require('../lib/local-context-paths');
const { readFrontmatterFile } = require('../lib/kurspilot-frontmatter');

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

test('createLerngruppenprofil schreibt gueltiges OKF-Frontmatter mit Kurspilot-Block', () => {
  const baseDir = makeTmpDir();

  const filePath = createLerngruppenprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
  });

  const { data } = readFrontmatterFile(filePath);
  assert.strictEqual(data.type, 'lerngruppe');
  assert.strictEqual(data.status, 'aktiv');
  assert.strictEqual(data.title, '7a');
  assert.deepStrictEqual(data.kurspilot, { personenbezug: true, weitergabe: 'schulintern' });
});

test('createLerngruppenprofil erzwingt personenbezug: true, auch bei widersprechendem Override', () => {
  const baseDir = makeTmpDir();

  const filePath = createLerngruppenprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    frontmatter: { kurspilot: { personenbezug: false, weitergabe: 'offen' } },
  });

  const { data } = readFrontmatterFile(filePath);
  assert.strictEqual(data.kurspilot.personenbezug, true);
});

test('createFachprofil schreibt gueltiges OKF-Frontmatter mit Kurspilot-Block', () => {
  const baseDir = makeTmpDir();

  const filePath = createFachprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    unterrichtsordner: 'naturwissenschaften',
  });

  const { data } = readFrontmatterFile(filePath);
  assert.strictEqual(data.type, 'fach');
  assert.strictEqual(data.status, 'aktiv');
  assert.strictEqual(data.about, 'naturwissenschaften');
  assert.deepStrictEqual(data.kurspilot, { personenbezug: false, weitergabe: 'schulintern' });
});

test('createVorhabenContext legt CONTEXT.md fuer ein Unterrichtsvorhaben mit OKF-Frontmatter an', () => {
  const baseDir = makeTmpDir();

  const filePath = createVorhabenContext(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    unterrichtsordner: 'naturwissenschaften',
    unterrichtsvorhaben: 'photosynthese',
    kurzbeschreibung: 'Grundlagen der Photosynthese.',
  });

  const expectedPath = path.join(
    baseDir,
    getUnterrichtsvorhabenContextFile('2025-26', '7a', 'naturwissenschaften', 'photosynthese')
  );
  assert.strictEqual(filePath, expectedPath);

  const { data, body } = readFrontmatterFile(filePath);
  assert.strictEqual(data.type, 'vorhaben');
  assert.strictEqual(data.title, 'photosynthese');
  assert.deepStrictEqual(data.kurspilot, { personenbezug: false, weitergabe: 'schulintern' });
  assert.match(body, /Grundlagen der Photosynthese\./);
});

test('createVorhabenContext traegt das neue Vorhaben automatisch in index.md ein', () => {
  const baseDir = makeTmpDir();

  createVorhabenContext(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    unterrichtsordner: 'naturwissenschaften',
    unterrichtsvorhaben: 'photosynthese',
    kurzbeschreibung: 'Grundlagen der Photosynthese.',
  });

  const indexPath = path.join(baseDir, 'index.md');
  assert.ok(fs.existsSync(indexPath));
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  assert.match(indexContent, /### photosynthese/);
  assert.match(indexContent, /## Aktive Vorhaben/);
});

test('createVorhabenContext warnt sichtbar, wenn index.md konfligiert, ohne das Anlegen zu blockieren', () => {
  const baseDir = makeTmpDir();
  fs.writeFileSync(
    path.join(baseDir, 'index.md'),
    ['# Thematischer Index', '', '<!-- kurspilot:eintrag ohne-abschluss -->'].join('\n'),
    'utf8'
  );
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);

  let filePath;
  try {
    filePath = createVorhabenContext(baseDir, {
      schuljahr: '2025-26',
      klasseOderLerngruppe: '7a',
      unterrichtsordner: 'naturwissenschaften',
      unterrichtsvorhaben: 'photosynthese',
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(fs.existsSync(filePath));
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /nicht lesbar|widerspr/i);
});

test('createVorhabenContext ueberschreibt eine bestehende Datei nicht', () => {
  const baseDir = makeTmpDir();
  const fields = {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a',
    unterrichtsordner: 'naturwissenschaften',
    unterrichtsvorhaben: 'photosynthese',
  };

  createVorhabenContext(baseDir, fields);
  assert.throws(() => createVorhabenContext(baseDir, fields), /existiert bereits/);
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
    verwandterKontext: '7a-e-kurs-nawi (Teilgruppe NaWi, siehe 2025-26/7a-e-kurs-nawi/CONTEXT.md)',
  });

  const pathB = createLerngruppenprofil(baseDir, {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7a-e-kurs-nawi',
    verwandterKontext: '7a (Stammklasse, siehe 2025-26/7a/CONTEXT.md)',
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

  assert.strictEqual(result.workspaceRoot, path.join(baseDir, '2025-26', '7a', 'naturwissenschaften'));
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
