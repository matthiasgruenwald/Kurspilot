'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  createPlan,
  addSection,
  addActivity,
} = require('../lib/implementation-plan');
const {
  findImplementationPreflightConflicts,
} = require('../lib/kurspilot-umsetzen-guard');

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

function createCatalogFixture({ courseid = 42, sections } = {}) {
  return {
    source: 'aus Moodle gelesen',
    courseid,
    sections: sections || [
      {
        sectionnum: 1,
        name: 'Abschnitt 1',
        modules: [],
      },
    ],
  };
}

test('findImplementationPreflightConflicts: keine Konflikte bei passendem Katalog', async () => {
  const plan = createPlanFixture();
  const catalog = createCatalogFixture();

  const conflicts = await findImplementationPreflightConflicts(plan, catalog);

  assert.deepStrictEqual(conflicts, []);
});

test('findImplementationPreflightConflicts: fehlender Katalog meldet Konflikt statt zu werfen', async () => {
  const plan = createPlanFixture();

  const conflicts = await findImplementationPreflightConflicts(plan, null);

  assert.strictEqual(conflicts.length, 1);
  assert.match(conflicts[0], /Moodle-Ziel passt nicht zum freigegebenen Plan/);
});

test('findImplementationPreflightConflicts: abweichende Kurs-ID blockiert', async () => {
  const plan = createPlanFixture();
  const catalog = createCatalogFixture({ courseid: 99 });

  const conflicts = await findImplementationPreflightConflicts(plan, catalog);

  assert.strictEqual(conflicts.length, 1);
  assert.match(conflicts[0], /erwartet Kurs 42, Katalog meldet 99/);
});

test('findImplementationPreflightConflicts: fehlender Abschnitt im Katalog blockiert', async () => {
  const plan = createPlanFixture();
  const catalog = createCatalogFixture({ sections: [] });

  const conflicts = await findImplementationPreflightConflicts(plan, catalog);

  assert.strictEqual(conflicts.length, 1);
  assert.match(conflicts[0], /Abschnitt 1 fehlt im Moodle-Ziel/);
});

test('findImplementationPreflightConflicts: abweichender Abschnittsname blockiert', async () => {
  const plan = createPlanFixture();
  const catalog = createCatalogFixture({
    sections: [{ sectionnum: 1, name: 'Veralteter Abschnitt', modules: [] }],
  });

  const conflicts = await findImplementationPreflightConflicts(plan, catalog);

  assert.strictEqual(conflicts.length, 1);
  assert.match(conflicts[0], /geplant "Abschnitt 1", aus Moodle gelesen "Veralteter Abschnitt"/);
});

test('findImplementationPreflightConflicts: Wiederaufsetzpunkt ohne passende Moodle-ID blockiert', async () => {
  const plan = createPlanFixture();
  const catalog = createCatalogFixture();

  const conflicts = await findImplementationPreflightConflicts(plan, catalog, {
    implementationPoint: 'Infoseite (Plan-ID abc123, Moodle-ID 101)',
  });

  assert.strictEqual(conflicts.length, 1);
  assert.match(conflicts[0], /Wiederaufsetzpunkt stimmt nicht mit Moodle ueberein.*Moodle-ID 101/);
});

test('findImplementationPreflightConflicts: Wiederaufsetzpunkt mit passender Moodle-ID im Katalog ist konfliktfrei', async () => {
  const plan = createPlanFixture();
  const catalog = createCatalogFixture({
    sections: [
      {
        sectionnum: 1,
        name: 'Abschnitt 1',
        modules: [{ cmid: 101, modname: 'page', name: 'Infoseite' }],
      },
    ],
  });

  const conflicts = await findImplementationPreflightConflicts(plan, catalog, {
    implementationPoint: 'Infoseite (Plan-ID abc123, Moodle-ID 101)',
  });

  assert.deepStrictEqual(conflicts, []);
});
