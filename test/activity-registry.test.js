'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTIVITIES,
  getActivity,
  listActivities,
  getDefaultBundle,
  resolveDependencies,
  isApiSupported,
} = require('../lib/activity-registry');

// --- Registry-Grundgeruest --------------------------------------------------

test('Registry enthaelt die bekannten Aktivitaeten mit korrekten Defaults', () => {
  assert.strictEqual(getActivity('page').default, true);
  assert.strictEqual(getActivity('label').default, true);
  assert.strictEqual(getActivity('url').default, true);
  assert.strictEqual(getActivity('assign').default, true);
  assert.strictEqual(getActivity('quiz').default, true);
  assert.strictEqual(getActivity('fragensammlung').default, true);
});

test('getActivity wirft bei unbekannter Aktivitaet einen Fehler', () => {
  assert.throws(() => getActivity('nicht-vorhanden'), /unbekannte aktivitaet/i);
});

test('listActivities gibt alle Registry-Eintraege als Array zurueck', () => {
  const activities = listActivities();
  assert.ok(Array.isArray(activities));
  assert.ok(activities.length >= 6);
  const ids = activities.map((a) => a.id);
  assert.ok(ids.includes('quiz'));
  assert.ok(ids.includes('fragensammlung'));
});

test('Quiz deklariert Fragensammlung als Abhaengigkeit', () => {
  const quiz = getActivity('quiz');
  assert.deepStrictEqual(quiz.dependsOn, ['fragensammlung']);
});

test('Page/Label/URL/Assign/Fragensammlung haben keine Abhaengigkeiten', () => {
  for (const id of ['page', 'label', 'url', 'assign', 'fragensammlung']) {
    assert.deepStrictEqual(getActivity(id).dependsOn, []);
  }
});

// --- getDefaultBundle -------------------------------------------------------

test('getDefaultBundle liefert nur die per Default aktiven Aktivitaets-IDs', () => {
  const bundle = getDefaultBundle();
  assert.ok(bundle.includes('page'));
  assert.ok(bundle.includes('label'));
  assert.ok(bundle.includes('url'));
  assert.ok(bundle.includes('assign'));
  assert.ok(bundle.includes('quiz'));
  assert.ok(bundle.includes('fragensammlung'));
});

test('getDefaultBundle ist transitiv abhaengigkeitsvollstaendig', () => {
  const bundle = getDefaultBundle();
  for (const id of bundle) {
    for (const dep of getActivity(id).dependsOn) {
      assert.ok(bundle.includes(dep), `Default-Bundle fehlt Abhaengigkeit ${dep} von ${id}`);
    }
  }
});

// --- resolveDependencies (transitiv) ----------------------------------------

test('resolveDependencies zieht bei Quiz automatisch Fragensammlung mit', () => {
  const resolved = resolveDependencies(['quiz']);
  assert.ok(resolved.includes('quiz'));
  assert.ok(resolved.includes('fragensammlung'));
});

test('resolveDependencies dedupliziert bei mehreren Selektionen mit gemeinsamer Abhaengigkeit', () => {
  const resolved = resolveDependencies(['quiz', 'fragensammlung']);
  assert.deepStrictEqual([...resolved].sort(), ['fragensammlung', 'quiz']);
});

test('resolveDependencies laesst Aktivitaeten ohne Abhaengigkeiten unveraendert', () => {
  const resolved = resolveDependencies(['page', 'label']);
  assert.deepStrictEqual([...resolved].sort(), ['label', 'page']);
});

test('resolveDependencies wirft bei unbekannter Aktivitaets-ID', () => {
  assert.throws(() => resolveDependencies(['nicht-vorhanden']), /unbekannte aktivitaet/i);
});

test('resolveDependencies gibt ein neues Array zurueck, mutiert Eingabe nicht (Immutability)', () => {
  const input = ['quiz'];
  const resolved = resolveDependencies(input);
  assert.deepStrictEqual(input, ['quiz']);
  assert.notStrictEqual(resolved, input);
});

// --- isApiSupported ----------------------------------------------------------

test('isApiSupported meldet true fuer aktuell per Plugin unterstuetzte Aktivitaeten', () => {
  assert.strictEqual(isApiSupported('page'), true);
  assert.strictEqual(isApiSupported('quiz'), true);
  assert.strictEqual(isApiSupported('fragensammlung'), true);
});

test('isApiSupported wirft bei unbekannter Aktivitaets-ID', () => {
  assert.throws(() => isApiSupported('nicht-vorhanden'), /unbekannte aktivitaet/i);
});

// --- reines Modul, keine Seiteneffekte --------------------------------------

test('ACTIVITIES-Datenstruktur ist von aussen nicht veraenderbar (frozen)', () => {
  assert.throws(() => {
    ACTIVITIES.page.default = false;
  });
});
