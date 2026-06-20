'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  setupUnterrichtsvorhabenWorkspace,
} = require('../lib/unterrichtsvorhaben-workspace');
const {
  renderUnterrichtsvorhabenStatus,
} = require('../lib/unterrichtsvorhaben-status');
const {
  getUnterrichtsvorhabenPath,
} = require('../lib/local-context-paths');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'unterrichtsvorhaben-test-'));
}

test('Unterrichtsvorhaben liegt direkt unter dem Unterrichtsordner und schreibt in der Vorschau nicht', () => {
  const baseDir = makeTmpDir();

  const result = setupUnterrichtsvorhabenWorkspace(
    {
      schuljahr: '2025-26',
      klasseOderLerngruppe: '7a',
      unterrichtsordner: 'naturwissenschaften',
      unterrichtsvorhaben: 'photosynthese',
    },
    {
      confirmed: false,
      readWorkspaceSetting: () => ({
        ok: true,
        status: 'configured',
        configPath: path.join(baseDir, 'config.json'),
        contextRoot: baseDir,
      }),
    }
  );

  assert.strictEqual(
    getUnterrichtsvorhabenPath('2025-26', '7a', 'naturwissenschaften', 'photosynthese'),
    path.join('local-context', '2025-26', '7a', 'naturwissenschaften', 'photosynthese')
  );
  assert.strictEqual(result.status, 'preview');
  assert.strictEqual(result.createdFiles.length, 0);
  assert.ok(!result.planFile.includes(`${path.sep}vorhaben${path.sep}`));
  assert.ok(!result.statusFile.includes(`${path.sep}vorhaben${path.sep}`));
  assert.ok(result.teacherFacingText.includes('Vorschau'));
  assert.match(result.teacherFacingText, /Kurspilot-Arbeitsbereich/);
  assert.match(result.teacherFacingText, new RegExp(baseDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(!fs.existsSync(path.join(baseDir, 'local-context')));
});

test('bestätigte Anlage schreibt plan.md und status.md als lesbares Markdown', () => {
  const baseDir = makeTmpDir();

  const result = setupUnterrichtsvorhabenWorkspace(
    baseDir,
    {
      schuljahr: '2025-26',
      klasseOderLerngruppe: '7a',
      unterrichtsordner: 'naturwissenschaften',
      unterrichtsvorhaben: 'photosynthese',
      thema: 'Photosynthese',
      ziel: 'Die Lernenden erklaeren die Grundschritte der Photosynthese.',
    },
    { confirmed: true }
  );

  assert.strictEqual(result.status, 'created');
  assert.deepStrictEqual(result.createdFiles.sort(), [result.planFile, result.statusFile].sort());
  assert.ok(fs.existsSync(result.planFile));
  assert.ok(fs.existsSync(result.statusFile));

  const planContent = fs.readFileSync(result.planFile, 'utf8');
  const statusContent = fs.readFileSync(result.statusFile, 'utf8');

  assert.match(planContent, /^# Unterrichtsvorhaben: photosynthese/m);
  assert.match(planContent, /## Plan/);
  assert.doesNotMatch(planContent, /^---$/m);
  assert.doesNotMatch(planContent, /^\s*\{/m);

  assert.match(statusContent, /^# Status zum Unterrichtsvorhaben: photosynthese/m);
  assert.match(statusContent, /## Aktueller Status/);
  assert.match(statusContent, /\| Aktueller Status \| in_planung \|/);
  assert.doesNotMatch(statusContent, /^---$/m);
  assert.doesNotMatch(statusContent, /^\s*\{/m);
});

test('bestaetigte Anlage kann eine Freigabe als V1-Status erzeugen', () => {
  const baseDir = makeTmpDir();

  const result = setupUnterrichtsvorhabenWorkspace(
    baseDir,
    {
      schuljahr: '2025-26',
      klasseOderLerngruppe: '7a',
      unterrichtsordner: 'naturwissenschaften',
      unterrichtsvorhaben: 'photosynthese',
      thema: 'Photosynthese',
      ziel: 'Die Lernenden erklaeren die Grundschritte der Photosynthese.',
    },
    { confirmed: true, statusEvent: 'approval' }
  );

  const statusContent = fs.readFileSync(result.statusFile, 'utf8');

  assert.match(statusContent, /\| Aktueller Status \| freigegeben \|/);
  assert.match(statusContent, /\| Planstand \| Freigegebener Implementierungsplan \|/);
});

test('vorhandenes plan.md oder status.md wird vor dem Schreiben erkannt', () => {
  const baseDir = makeTmpDir();
  const fields = {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7b',
    unterrichtsordner: 'englisch',
    unterrichtsvorhaben: 'grammatik',
  };

  const workspacePath = path.join(
    baseDir,
    'local-context',
    '2025-26',
    '7b',
    'englisch',
    'grammatik'
  );
  fs.mkdirSync(workspacePath, { recursive: true });
  const existingPlan = path.join(workspacePath, 'plan.md');
  const existingStatus = path.join(workspacePath, 'status.md');
  fs.writeFileSync(existingPlan, '# Vorhandener Plan\n\nBleibt erhalten.', 'utf8');
  fs.writeFileSync(existingStatus, '# Vorhandener Status\n\nBleibt erhalten.', 'utf8');

  const result = setupUnterrichtsvorhabenWorkspace(baseDir, fields, { confirmed: true });

  assert.strictEqual(result.status, 'existing');
  assert.deepStrictEqual(result.existingFiles.sort(), [existingPlan, existingStatus].sort());
  assert.deepStrictEqual(result.decisionOptions, ['Zusammenfassen', 'Fortsetzen', 'Ueberarbeiten']);
  assert.match(result.teacherFacingText, /zusammenfassen/);
  assert.match(result.teacherFacingText, /fortsetzen/);
  assert.match(result.teacherFacingText, /ueberarbeiten/);
  assert.strictEqual(fs.readFileSync(existingPlan, 'utf8'), '# Vorhandener Plan\n\nBleibt erhalten.');
  assert.strictEqual(fs.readFileSync(existingStatus, 'utf8'), '# Vorhandener Status\n\nBleibt erhalten.');
});

test('vor einem Edit eines freigegebenen Plans wird der Freigabeverlust transparent gemacht', () => {
  const baseDir = makeTmpDir();
  const fields = {
    schuljahr: '2025-26',
    klasseOderLerngruppe: '7d',
    unterrichtsordner: 'geschichte',
    unterrichtsvorhaben: 'mittelalter',
    thema: 'Das Mittelalter',
    ziel: 'Die Lernenden ordnen zentrale Entwicklungen des Mittelalters ein.',
  };

  const workspacePath = path.join(
    baseDir,
    'local-context',
    '2025-26',
    '7d',
    'geschichte',
    'mittelalter'
  );
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'plan.md'), '# Freigegebener Plan\n', 'utf8');
  fs.writeFileSync(
    path.join(workspacePath, 'status.md'),
    renderUnterrichtsvorhabenStatus(
      {
        unterrichtsvorhaben: 'mittelalter',
        status: 'freigegeben',
        lastUpdateDate: '2026-06-15',
        updatingSkill: 'Kurspilot',
        planState: 'Freigegebener Implementierungsplan',
        moodleTarget: 'Geschichte 7d',
        openPoints: ['Keine'],
        nextRecommendedStep: 'Mit der Umsetzung beginnen.',
      }
    ),
    'utf8'
  );

  const result = setupUnterrichtsvorhabenWorkspace(baseDir, fields, { confirmed: true });

  assert.strictEqual(result.status, 'existing');
  assert.match(result.teacherFacingText, /freigegebene Plan/);
  assert.match(result.teacherFacingText, /neue Freigabe/);
});
