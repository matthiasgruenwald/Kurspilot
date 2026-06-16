'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createPlan,
  addSection,
  addActivity,
} = require('../lib/implementation-plan');
const {
  runKurspilotUmsetzenGuard,
} = require('../lib/kurspilot-umsetzen-guard');
const {
  renderUnterrichtsvorhabenStatus,
} = require('../lib/unterrichtsvorhaben-status');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-umsetzen-guard-'));
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

function createCatalogFixture({ modules = [] } = {}) {
  return {
    source: 'aus Moodle gelesen',
    courseid: 42,
    sections: [
      {
        sectionnum: 1,
        name: 'Abschnitt 1',
        modules,
      },
    ],
  };
}

function createWorkspaceWithStatus(baseDir, status, extraFields = {}) {
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
      planState: extraFields.planState || 'Freigegebener Implementierungsplan',
      moodleTarget: 'Moodle-Kurs 42',
      implementationPoint: extraFields.implementationPoint,
      moodleEntries: extraFields.moodleEntries,
      openPoints: extraFields.openPoints || ['Keine'],
      nextRecommendedStep: extraFields.nextRecommendedStep || 'Mit der Umsetzung beginnen.',
    }),
    'utf8'
  );
  return workspaceRoot;
}

test('runKurspilotUmsetzenGuard: in_planung verweigert Moodle-Schreibzugriffe und nennt kurspilot-planen als naechsten Schritt', async () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'in_planung', {
    planState: 'Planentwurf',
    nextRecommendedStep: 'Plan pruefen.',
  });
  const plan = createPlanFixture();
  const calls = [];
  const client = {
    moodle_create_page: async () => { calls.push('moodle_create_page'); return { cmid: 101 }; },
    moodle_create_assign: async () => { calls.push('moodle_create_assign'); return { cmid: 102 }; },
    moodle_set_completion: async () => { calls.push('moodle_set_completion'); },
    moodle_set_restriction: async () => { calls.push('moodle_set_restriction'); },
  };

  const result = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client,
    now: '2026-06-15',
  });

  assert.strictEqual(result.outcome, 'refused');
  assert.strictEqual(calls.length, 0);
  assert.match(result.nextRecommendedStep, /kurspilot-planen/);
  assert.match(fs.readFileSync(path.join(workspaceRoot, 'status.md'), 'utf8'), /\| Aktueller Status \| in_planung \|/);
});

test('runKurspilotUmsetzenGuard: freigegeben setzt den bestehenden Write-Pfad fort und schreibt umgesetzt mit Moodle-IDs', async () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'freigegeben');
  const plan = createPlanFixture();
  const calls = [];
  const client = {
    moodle_get_course_catalog: async () => createCatalogFixture(),
    moodle_create_page: async () => {
      calls.push('moodle_create_page');
      return { cmid: 101, link: 'https://moodle.example/mod/page/view.php?id=101' };
    },
    moodle_create_assign: async () => {
      calls.push('moodle_create_assign');
      return { cmid: 102, link: 'https://moodle.example/mod/assign/view.php?id=102' };
    },
    moodle_set_completion: async () => { calls.push('moodle_set_completion'); },
    moodle_set_restriction: async () => { calls.push('moodle_set_restriction'); },
  };

  const result = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client,
    now: '2026-06-15',
  });

  assert.strictEqual(result.outcome, 'completed');
  assert.deepStrictEqual(calls, [
    'moodle_create_page',
    'moodle_create_assign',
    'moodle_set_completion',
  ]);

  const statusContent = fs.readFileSync(path.join(workspaceRoot, 'status.md'), 'utf8');
  assert.match(statusContent, /\| Aktueller Status \| umgesetzt \|/);
  assert.match(statusContent, /Infoseite \(Moodle-ID 101\)/);
  assert.match(statusContent, /Arbeitsauftrag \(Moodle-ID 102\)/);
  assert.match(statusContent, /https:\/\/moodle\.example\/mod\/page\/view\.php\?id=101/);
});

test('runKurspilotUmsetzenGuard: Umsetzungsvorpruefung blockiert bei abweichendem Moodle-Abschnitt und schreibt nicht', async () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'freigegeben');
  const plan = createPlanFixture();
  const calls = [];
  const client = {
    moodle_get_course_catalog: async (args) => {
      calls.push(['moodle_get_course_catalog', args]);
      return {
        ...createCatalogFixture(),
        sections: [{ sectionnum: 1, name: 'Veralteter Abschnitt', modules: [] }],
      };
    },
    moodle_create_page: async () => { calls.push(['moodle_create_page']); return { cmid: 101 }; },
    moodle_create_assign: async () => { calls.push(['moodle_create_assign']); return { cmid: 102 }; },
    moodle_set_completion: async () => { calls.push(['moodle_set_completion']); },
    moodle_set_restriction: async () => { calls.push(['moodle_set_restriction']); },
  };

  const result = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client,
    now: '2026-06-15',
  });

  assert.strictEqual(result.outcome, 'blocked');
  assert.deepStrictEqual(calls, [
    ['moodle_get_course_catalog', { courseid: 42, sectionnum: -1, detail: 'compact' }],
  ]);
  assert.match(result.nextRecommendedStep, /Kursstand-Abgleich/);
  assert.match(result.nextRecommendedStep, /kurspilot-planen/);

  const statusContent = fs.readFileSync(path.join(workspaceRoot, 'status.md'), 'utf8');
  assert.match(statusContent, /\| Aktueller Status \| blockiert \|/);
  assert.match(statusContent, /Abschnitt 1/);
  assert.match(statusContent, /Veralteter Abschnitt/);
});

test('runKurspilotUmsetzenGuard: Teilfehler schreibt teilweise_umgesetzt mit Wiederaufsetzpunkt und laesst sich daran fortsetzen', async () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'freigegeben');
  const plan = createPlanFixture();
  const firstActivityId = plan.sections[0].activities[0].id;
  const firstRunCalls = [];
  const firstClient = {
    moodle_get_course_catalog: async () => createCatalogFixture(),
    moodle_create_page: async () => {
      firstRunCalls.push('moodle_create_page');
      return { cmid: 101 };
    },
    moodle_create_assign: async () => {
      firstRunCalls.push('moodle_create_assign');
      throw new Error('Assign fehlgeschlagen');
    },
    moodle_set_completion: async () => { firstRunCalls.push('moodle_set_completion'); },
    moodle_set_restriction: async () => { firstRunCalls.push('moodle_set_restriction'); },
  };

  const partialResult = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client: firstClient,
    now: '2026-06-15',
  });

  assert.strictEqual(partialResult.outcome, 'partial');
  assert.deepStrictEqual(firstRunCalls, [
    'moodle_create_page',
    'moodle_create_assign',
  ]);

  const partialStatus = fs.readFileSync(path.join(workspaceRoot, 'status.md'), 'utf8');
  assert.match(partialStatus, /\| Aktueller Status \| teilweise_umgesetzt \|/);
  assert.match(partialStatus, new RegExp(`Infoseite \\(Plan-ID ${firstActivityId}, Moodle-ID 101\\)`));
  assert.match(partialStatus, /Assign fehlgeschlagen/);

  const resumedCalls = [];
  const resumedClient = {
    moodle_get_course_catalog: async () => createCatalogFixture({
      modules: [{ cmid: 101, modname: 'page', name: 'Infoseite' }],
    }),
    moodle_create_page: async () => {
      resumedCalls.push('moodle_create_page');
      return { cmid: 201 };
    },
    moodle_create_assign: async () => {
      resumedCalls.push('moodle_create_assign');
      return { cmid: 202 };
    },
    moodle_set_completion: async () => { resumedCalls.push('moodle_set_completion'); },
    moodle_set_restriction: async () => { resumedCalls.push('moodle_set_restriction'); },
  };

  const resumedResult = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client: resumedClient,
    now: '2026-06-16',
  });

  assert.strictEqual(resumedResult.outcome, 'completed');
  assert.deepStrictEqual(resumedCalls, [
    'moodle_create_assign',
    'moodle_set_completion',
  ]);
});

test('runKurspilotUmsetzenGuard: teilweise_umgesetzt ohne Wiederaufsetzpunkt bleibt blockiert und schreibt nichts', async () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'teilweise_umgesetzt', {
    implementationPoint: '_(noch nicht erfasst)_',
    nextRecommendedStep: 'Fehler analysieren.',
  });
  const plan = createPlanFixture();
  const calls = [];
  const client = {
    moodle_create_page: async () => { calls.push('moodle_create_page'); return { cmid: 1 }; },
    moodle_create_assign: async () => { calls.push('moodle_create_assign'); return { cmid: 2 }; },
    moodle_set_completion: async () => { calls.push('moodle_set_completion'); },
    moodle_set_restriction: async () => { calls.push('moodle_set_restriction'); },
  };

  const result = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client,
    now: '2026-06-15',
  });

  assert.strictEqual(result.outcome, 'blocked');
  assert.strictEqual(calls.length, 0);
  assert.match(result.nextRecommendedStep, /Wiederaufsetzpunkt|kurspilot-planen/);
  assert.match(fs.readFileSync(path.join(workspaceRoot, 'status.md'), 'utf8'), /\| Aktueller Status \| blockiert \|/);
});

test('runKurspilotUmsetzenGuard: Umsetzungsvorpruefung blockiert Fortsetzung bei fehlender Moodle-ID', async () => {
  const baseDir = makeTmpDir();
  const plan = createPlanFixture();
  const firstActivityId = plan.sections[0].activities[0].id;
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'teilweise_umgesetzt', {
    implementationPoint: `Infoseite (Plan-ID ${firstActivityId}, Moodle-ID 101)`,
    moodleEntries: ['Infoseite (Moodle-ID 101)'],
  });
  const calls = [];
  const client = {
    moodle_get_course_catalog: async (args) => {
      calls.push(['moodle_get_course_catalog', args]);
      return createCatalogFixture();
    },
    moodle_create_assign: async () => { calls.push(['moodle_create_assign']); return { cmid: 102 }; },
    moodle_set_completion: async () => { calls.push(['moodle_set_completion']); },
    moodle_set_restriction: async () => { calls.push(['moodle_set_restriction']); },
  };

  const result = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client,
    now: '2026-06-16',
  });

  assert.strictEqual(result.outcome, 'blocked');
  assert.deepStrictEqual(calls, [
    ['moodle_get_course_catalog', { courseid: 42, sectionnum: -1, detail: 'compact' }],
  ]);
  assert.match(fs.readFileSync(path.join(workspaceRoot, 'status.md'), 'utf8'), /Moodle-ID 101/);
});

test('runKurspilotUmsetzenGuard: Fehler vor erster erfolgreichen Aktivitaet setzt status.md auf blockiert mit offenem Punkt', async () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'freigegeben');
  const plan = createPlanFixture();
  const calls = [];
  const client = {
    moodle_get_course_catalog: async () => createCatalogFixture(),
    moodle_create_page: async () => {
      calls.push('moodle_create_page');
      throw new Error('Page fehlgeschlagen');
    },
    moodle_create_assign: async () => {
      calls.push('moodle_create_assign');
      return { cmid: 2 };
    },
    moodle_set_completion: async () => { calls.push('moodle_set_completion'); },
    moodle_set_restriction: async () => { calls.push('moodle_set_restriction'); },
  };

  const result = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client,
    now: '2026-06-15',
  });

  assert.strictEqual(result.outcome, 'blocked');
  assert.deepStrictEqual(calls, ['moodle_create_page']);

  const statusContent = fs.readFileSync(path.join(workspaceRoot, 'status.md'), 'utf8');
  assert.match(statusContent, /\| Aktueller Status \| blockiert \|/);
  assert.match(statusContent, /Page fehlgeschlagen/);
  assert.match(statusContent, /Naechster empfohlener Schritt/);
});

test('runKurspilotUmsetzenGuard: Fehler nach erfolgreichem Create behaelt Moodle-ID als Wiederaufsetzpunkt', async () => {
  const baseDir = makeTmpDir();
  const workspaceRoot = createWorkspaceWithStatus(baseDir, 'freigegeben');
  const plan = createPlanFixture();
  const assignActivityId = plan.sections[0].activities[1].id;
  const calls = [];
  const client = {
    moodle_get_course_catalog: async () => createCatalogFixture(),
    moodle_create_page: async () => {
      calls.push('moodle_create_page');
      return { cmid: 301 };
    },
    moodle_create_assign: async () => {
      calls.push('moodle_create_assign');
      return { cmid: 302 };
    },
    moodle_set_completion: async () => {
      calls.push('moodle_set_completion');
      throw new Error('Completion fehlgeschlagen');
    },
    moodle_set_restriction: async () => { calls.push('moodle_set_restriction'); },
  };

  const result = await runKurspilotUmsetzenGuard(workspaceRoot, {
    plan,
    client,
    now: '2026-06-15',
  });

  assert.strictEqual(result.outcome, 'partial');
  assert.deepStrictEqual(calls, [
    'moodle_create_page',
    'moodle_create_assign',
    'moodle_set_completion',
  ]);

  const statusContent = fs.readFileSync(path.join(workspaceRoot, 'status.md'), 'utf8');
  assert.match(statusContent, /\| Aktueller Status \| teilweise_umgesetzt \|/);
  assert.match(statusContent, new RegExp(`Arbeitsauftrag \\(Plan-ID ${assignActivityId}, Moodle-ID 302\\)`));
  assert.match(statusContent, /Completion fehlgeschlagen/);
});
