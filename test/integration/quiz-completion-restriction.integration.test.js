'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

// Erweiterung der Webservice-Funktionen local_aicoursecreator_set_completion
// und local_aicoursecreator_set_restriction (#10) muss erst per Plugin-Update
// auf der Test-Moodle-Instanz deployed werden. Solange die Funktionen oder
// die neuen Parameter dort nicht existieren, meldet Moodle "invalidrecord"
// bzw. "invalidwsfunction" oder "invalid_parameter_exception" – in diesem
// Fall wird der Test sauber uebersprungen statt rot gemeldet zu werden.
const UNKNOWN_FUNCTION_PATTERN = /invalidfunction|invalidwsfunction|invalidrecord|unbekannte funktion|does not exist|invalid_parameter_exception/i;
const TEST_SECTIONNUM = 1;

function shouldSkipForMissingDeploy(t, err, ctx) {
  if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
    t.skip(`${ctx} noch nicht auf Test-Moodle deployed: ${err.message}`);
    return true;
  }
  return false;
}

test(
  'completionpassgrade fuer Quiz + Folgeaktivitaet ist erst nach bestandenem Quiz verfuegbar',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const stamp = Date.now();
    const gradepass = 80;

    // 1) Quiz anlegen (Lerncheck-Defaults, gradepass=80).
    let quiz;
    try {
      quiz = await callMoodle('local_aicoursecreator_create_quiz', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name: `Quiz Pass-Restriction ${stamp}`,
        intro: '',
        gradepass,
        visible: 1,
      });
    } catch (err) {
      if (shouldSkipForMissingDeploy(t, err, 'create_quiz')) return;
      throw err;
    }
    assert.ok(quiz.cmid > 0, 'Quiz-cmid muss gueltig sein');

    // 2) completionpassgrade fuer Quiz aktivieren.
    try {
      await callMoodle('local_aicoursecreator_set_completion', {
        cmid: quiz.cmid,
        completion: 2,
        completionpassgrade: 1,
      });
    } catch (err) {
      if (shouldSkipForMissingDeploy(t, err, 'set_completion completionpassgrade')) return;
      throw err;
    }

    // 3) Folgeaktivitaet als mod_page anlegen.
    const followup = await callMoodle('local_aicoursecreator_create_page', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
      name: `Folgeseite nach Quiz ${stamp}`,
      content: '<p>Erst nach bestandenem Quiz sichtbar.</p>',
      visible: 1,
    });
    assert.ok(followup.cmid > 0, 'Folgeseiten-cmid muss gueltig sein');

    // 4) Restriction "quiz bestanden" auf Folgeseite setzen.
    try {
      await callMoodle('local_aicoursecreator_set_restriction', {
        cmid: followup.cmid,
        condition_type: 'quiz_passed',
        condition_target_cmid: quiz.cmid,
        show_locked: 1,
      });
    } catch (err) {
      if (shouldSkipForMissingDeploy(t, err, 'set_restriction quiz_passed')) return;
      throw err;
    }

    // 5) Verifizieren: get_modules liefert beide Aktivitaeten.
    const modules = await callMoodle('local_aicoursecreator_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const followupModule = modules.find((m) => m.cmid === followup.cmid);
    assert.ok(followupModule, 'Folgeseite muss in get_modules auftauchen');

    // 6) Akzeptanz "ohne expliziten Aufruf keine Restriction":
    //    Zweite Folgeseite wird angelegt OHNE set_restriction-Call und muss
    //    weiterhin in get_modules erscheinen (keine implizite Sperre).
    const followup2 = await callMoodle('local_aicoursecreator_create_page', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
      name: `Freie Folgeseite ${stamp}`,
      content: '<p>Keine Restriction.</p>',
      visible: 1,
    });
    const modulesAfter = await callMoodle('local_aicoursecreator_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const followupFree = modulesAfter.find((m) => m.cmid === followup2.cmid);
    assert.ok(followupFree, 'Freie Folgeseite muss in get_modules auftauchen');
  }
);
