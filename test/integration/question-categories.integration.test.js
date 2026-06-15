'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

// Wird auf der Test-Moodle-Instanz noch ausgerollt (Plugin-Update ist ein
// HITL-Folgeschritt nach Merge). Solange die Webservice-Funktionen dort
// unbekannt sind, werden die Tests sauber uebersprungen.
const UNKNOWN_FUNCTION_ERRORCODES = ['invalidwsfunction', 'invalidrecord'];

function isUnknownFunctionError(err) {
  return UNKNOWN_FUNCTION_ERRORCODES.some((code) => err.message.includes(code))
    || err.message.includes('invalid_parameter_exception')
    || err.message.includes('Unknown function');
}

const TEST_CATEGORY_NAME = `7.2 Stoffe und ihre Eigenschaften (Integrationstest ${Date.now()})`;

test(
  'local_aicoursecreator_create_question_category legt Kategorie im Kurs-Fragenkontext an (idempotent)',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    let created;
    try {
      created = await callMoodle('local_aicoursecreator_create_question_category', {
        courseid: MOODLE_TEST_COURSEID,
        name: TEST_CATEGORY_NAME,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Webservice-Funktion lokal_aicoursecreator_create_question_category noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(created.id > 0, 'Kategorie sollte eine gueltige ID erhalten');
    assert.strictEqual(typeof created.created, 'boolean');

    // Abrufen: Kategorie muss in der Liste auftauchen.
    const categories = await callMoodle('local_aicoursecreator_get_question_categories', {
      courseid: MOODLE_TEST_COURSEID,
    });

    assert.ok(Array.isArray(categories));
    const found = categories.find((c) => c.id === created.id);
    assert.ok(found, 'Neu angelegte Kategorie muss in get_question_categories auftauchen');
    assert.strictEqual(found.name, TEST_CATEGORY_NAME);

    // Erneutes Anlegen mit identischem Namen: idempotent, keine Dublette.
    const second = await callMoodle('local_aicoursecreator_create_question_category', {
      courseid: MOODLE_TEST_COURSEID,
      name: TEST_CATEGORY_NAME,
    });

    assert.strictEqual(second.id, created.id, 'Erneutes Anlegen muss die bestehende Kategorie-ID zurueckgeben');
    assert.strictEqual(second.created, false, 'Erneutes Anlegen darf keine neue Kategorie erzeugen (created=false)');

    const categoriesAfter = await callMoodle('local_aicoursecreator_get_question_categories', {
      courseid: MOODLE_TEST_COURSEID,
    });
    const matches = categoriesAfter.filter((c) => c.name === TEST_CATEGORY_NAME);
    assert.strictEqual(matches.length, 1, 'Es darf keine Dublette der Kategorie geben');
  }
);
