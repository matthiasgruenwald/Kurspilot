'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

// Die Webservice-Funktion local_aicoursecreator_create_quiz ist neu (#6) und
// muss erst per Plugin-Update auf der Test-Moodle-Instanz deployed werden
// (siehe HITL-Folgeschritt im PR). Solange die Funktion server-seitig nicht
// existiert, meldet Moodle "Der Datensatz kann nicht in der Datenbanktabelle
// external_functions gefunden werden... (invalidrecord)" bzw. einen
// "invalidfunction"/"invalidwsfunction"-Fehler. In diesem Fall überspringen
// wir den Test, statt ihn rot zu melden.
const UNKNOWN_FUNCTION_PATTERN = /invalidfunction|invalidwsfunction|invalidrecord|unbekannte funktion|does not exist/i;
const TEST_SECTIONNUM = 1;

test(
  'local_aicoursecreator_create_quiz legt Quiz mit Lernstandscheck-Defaults an',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    let result;
    try {
      result = await callMoodle('local_aicoursecreator_create_quiz', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name: `Lernstandscheck-Testquiz ${Date.now()}`,
        intro: '',
        gradepass: 80,
        visible: 1,
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_aicoursecreator_create_quiz noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(result.cmid > 0);

    const modules = await callMoodle('local_aicoursecreator_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });

    const created = modules.find((m) => m.cmid === result.cmid);
    assert.ok(created, 'Erstelltes Quiz sollte in get_modules auftauchen');
    assert.strictEqual(created.modname, 'quiz');
  }
);
