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
  getUnterrichtsvorhabenPath,
} = require('../lib/local-context-paths');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'unterrichtsvorhaben-test-'));
}

test('Unterrichtsvorhaben liegt direkt unter dem Unterrichtsordner und schreibt in der Vorschau nicht', () => {
  const baseDir = makeTmpDir();

  const result = setupUnterrichtsvorhabenWorkspace(
    baseDir,
    {
      schuljahr: '2025-26',
      klasseOderLerngruppe: '7a',
      unterrichtsordner: 'naturwissenschaften',
      unterrichtsvorhaben: 'photosynthese',
    },
    { confirmed: false }
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
  assert.doesNotMatch(statusContent, /^---$/m);
  assert.doesNotMatch(statusContent, /^\s*\{/m);
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
