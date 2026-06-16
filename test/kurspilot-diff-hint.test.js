'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { formatKurspilotDiffHint } = require('../lib/kurspilot-diff-hint');
const { setupUnterrichtsvorhabenWorkspace } = require('../lib/unterrichtsvorhaben-workspace');
const { runKurspilotUmsetzenGuard } = require('../lib/kurspilot-umsetzen-guard');
const { createPlan, addSection, addActivity } = require('../lib/implementation-plan');
const { renderUnterrichtsvorhabenStatus } = require('../lib/unterrichtsvorhaben-status');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-diff-hint-'));
}

function createPlanFixture() {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Abschnitt 1' });
  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Infoseite',
    content: '<p>Einordnung</p>',
  });
  plan = addActivity(plan, 1, {
    type: 'assign',
    name: 'Arbeitsauftrag',
    description: '<p>Arbeite die Aufgabe aus.</p>',
    isGate: true,
    hasDigitalSubmission: false,
  });
  return plan;
}

function createWorkspaceWithStatus(baseDir, status) {
  const workspaceRoot = path.join(baseDir, 'local-context', '2025-26', '7a', 'nawi', 'photosynthese');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'plan.md'), '# Plan\n\n- Infoseite\n- Arbeitsauftrag\n', 'utf8');
  fs.writeFileSync(
    path.join(workspaceRoot, 'status.md'),
    renderUnterrichtsvorhabenStatus({
      unterrichtsvorhaben: 'photosynthese',
      status,
      lastUpdateDate: '2026-06-15',
      updatingSkill: 'kurspilot-planen',
      planState: status === 'freigegeben' ? 'Freigegebener Implementierungsplan' : 'Planentwurf',
      moodleTarget: 'Moodle-Kurs 42',
      implementationPoint: '_(noch nicht erfasst)_',
      moodleEntries: ['_(noch nicht erfasst)_'],
      openPoints: ['Keine'],
      nextRecommendedStep: 'Mit der Umsetzung beginnen.',
    }),
    'utf8'
  );
  return workspaceRoot;
}

test('formatKurspilotDiffHint: plan.md nennt Planinhalt, Moodle-Ziel, Aktivitaetsreihenfolge und Freigabehinweis', () => {
  const hint = formatKurspilotDiffHint([{ fileName: 'plan.md', kind: 'plan' }], { planApproved: true });

  assert.match(hint, /plan\.md/);
  assert.match(hint, /Planinhalt/);
  assert.match(hint, /Moodle-Ziel/);
  assert.match(hint, /Aktivitaetsreihenfolge/);
  assert.match(hint, /Freigabe/);
  assert.doesNotMatch(hint, /<p>|# Plan|Infoseite/);
});

test('formatKurspilotDiffHint: status.md nennt Statuswert, offene Punkte, Wiederaufsetzpunkt und naechsten Schritt', () => {
  const hint = formatKurspilotDiffHint([{ fileName: 'status.md', kind: 'status' }]);

  assert.match(hint, /status\.md/);
  assert.match(hint, /Statuswert/);
  assert.match(hint, /Moodle-Ziel/);
  assert.match(hint, /offene Punkte/);
  assert.match(hint, /Wiederaufsetzpunkt/);
  assert.match(hint, /naechsten empfohlenen Schritt/);
  assert.doesNotMatch(hint, /Moodle-Kurs 42|Keine/);
});

test('setupUnterrichtsvorhabenWorkspace: liefert einen diffHint fuer die neu angelegten Arbeitsdateien', () => {
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

  assert.match(result.diffHint, /plan\.md/);
  assert.match(result.diffHint, /status\.md/);
  assert.match(result.diffHint, /Freigabe/);
});

test('runKurspilotUmsetzenGuard: schreibt beim Abschluss einen diffHint fuer status.md', async () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'freigegeben');
  const plan = createPlanFixture();
  const client = {
    moodle_get_course_catalog: async () => ({
      source: 'aus Moodle gelesen',
      courseid: 42,
      sections: [
        {
          sectionnum: 1,
          name: 'Abschnitt 1',
          modules: [],
        },
      ],
    }),
    moodle_create_page: async () => ({ cmid: 101 }),
    moodle_create_assign: async () => ({ cmid: 102 }),
    moodle_set_completion: async () => {},
    moodle_set_restriction: async () => {},
  };

  const result = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client,
    now: '2026-06-15',
  });

  assert.strictEqual(result.outcome, 'completed');
  assert.match(result.diffHint, /status\.md/);
  assert.match(result.diffHint, /Statuswert/);
  assert.match(result.diffHint, /Wiederaufsetzpunkt/);
});
