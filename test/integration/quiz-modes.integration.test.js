'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

// Erwartete Settings pro Modus (siehe Plugin/src/.../create_quiz.php sowie
// README/SKILL Modus-Tabelle). Die Werte hier sind Single Source of Truth
// fuer den Test – Aenderungen am Plugin muessen hier nachgezogen werden.
const MODE_EXPECTATIONS = {
  'mini-check': {
    preferredbehaviour: 'immediatecbm',
    attempts:           0,
    grademethod:        1, // QUIZ_GRADEHIGHEST
    timelimit:          0,
    shuffleanswers:     1,
    questionsperpage:   1,
    navmethod:          'free',
    delay1:             0,
    delay2:             0,
  },
  lernstandscheck: {
    preferredbehaviour: 'deferredcbm',
    attempts:           0,
    grademethod:        1, // QUIZ_GRADEHIGHEST
    timelimit:          0,
    shuffleanswers:     1,
    questionsperpage:   0,
    navmethod:          'free',
    delay1:             300,
    delay2:             300,
  },
  abschlusstest: {
    preferredbehaviour: 'deferredfeedback',
    attempts:           2,
    grademethod:        2, // QUIZ_GRADEAVERAGE
    timelimit:          0,
    shuffleanswers:     1,
    questionsperpage:   0,
    navmethod:          'free',
    delay1:             900,
    delay2:             900,
  },
};

// Die Webservice-Funktionen brauchen ein Plugin-Update auf der Testinstanz.
// Solange das Plugin alt ist, wird der Test uebersprungen statt rot zu melden.
const SKIP_PATTERN = /invalidfunction|invalidwsfunction|invalidrecord|unbekannte funktion|does not exist|invalid_parameter_exception/i;
const TEST_SECTIONNUM = 1;

async function fetchQuizSettings(cmid) {
  // mod_quiz_get_quizzes_by_courses liefert alle Quiz-Settings je Kurs.
  const result = await callMoodle('mod_quiz_get_quizzes_by_courses', {
    'courseids[0]': MOODLE_TEST_COURSEID,
  });
  const quizzes = (result && result.quizzes) || [];
  return quizzes.find((q) => Number(q.coursemodule) === Number(cmid));
}

for (const [mode, expected] of Object.entries(MODE_EXPECTATIONS)) {
  test(
    `local_aicoursecreator_create_quiz (mode=${mode}) setzt erwartete Settings-Kombination`,
    { skip: !hasMoodleTestConfig && SKIP_REASON },
    async (t) => {
      let created;
      try {
        created = await callMoodle('local_aicoursecreator_create_quiz', {
          courseid:   MOODLE_TEST_COURSEID,
          sectionnum: TEST_SECTIONNUM,
          name:       `Quiz-Modus ${mode} ${Date.now()}`,
          mode,
          intro:      '',
          gradepass:  expected.attempts === 1 ? 50 : 80,
          visible:    1,
        });
      } catch (err) {
        if (SKIP_PATTERN.test(err.message)) {
          t.skip(`create_quiz mit mode-Parameter noch nicht auf Test-Moodle deployed: ${err.message}`);
          return;
        }
        throw err;
      }

      assert.ok(created.cmid > 0, 'Quiz sollte eine cmid > 0 haben');

      let quiz;
      try {
        quiz = await fetchQuizSettings(created.cmid);
      } catch (err) {
        if (SKIP_PATTERN.test(err.message)) {
          t.skip(`mod_quiz_get_quizzes_by_courses nicht verfuegbar: ${err.message}`);
          return;
        }
        throw err;
      }

      assert.ok(quiz, `Quiz mit cmid=${created.cmid} muss in mod_quiz_get_quizzes_by_courses auftauchen`);

      assert.strictEqual(
        quiz.preferredbehaviour,
        expected.preferredbehaviour,
        `Modus ${mode}: preferredbehaviour`
      );
      assert.strictEqual(
        Number(quiz.attempts),
        expected.attempts,
        `Modus ${mode}: attempts`
      );
      assert.strictEqual(
        Number(quiz.grademethod),
        expected.grademethod,
        `Modus ${mode}: grademethod`
      );
      assert.strictEqual(
        Number(quiz.timelimit),
        expected.timelimit,
        `Modus ${mode}: timelimit`
      );
      assert.strictEqual(
        Number(quiz.shuffleanswers),
        expected.shuffleanswers,
        `Modus ${mode}: shuffleanswers`
      );
      assert.strictEqual(
        Number(quiz.questionsperpage),
        expected.questionsperpage,
        `Modus ${mode}: questionsperpage`
      );
      assert.strictEqual(
        quiz.navmethod,
        expected.navmethod,
        `Modus ${mode}: navmethod`
      );
      assert.strictEqual(
        Number(quiz.delay1),
        expected.delay1,
        `Modus ${mode}: delay1`
      );
      assert.strictEqual(
        Number(quiz.delay2),
        expected.delay2,
        `Modus ${mode}: delay2`
      );
      assert.strictEqual(
        Number(quiz.reviewrightanswer),
        0,
        `Modus ${mode}: richtige Antwort wird nicht in Review-Optionen angezeigt`
      );
    }
  );
}

test(
  'local_aicoursecreator_create_quiz ohne mode faellt auf lernstandscheck-Defaults zurueck',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    let created;
    try {
      created = await callMoodle('local_aicoursecreator_create_quiz', {
        courseid:   MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name:       `Quiz-Default-Modus ${Date.now()}`,
        intro:      '',
        gradepass:  80,
        visible:    1,
      });
    } catch (err) {
      if (SKIP_PATTERN.test(err.message)) {
        t.skip(`create_quiz noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    let quiz;
    try {
      quiz = await fetchQuizSettings(created.cmid);
    } catch (err) {
      if (SKIP_PATTERN.test(err.message)) {
        t.skip(`mod_quiz_get_quizzes_by_courses nicht verfuegbar: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(quiz, 'Quiz muss auffindbar sein');
    const expected = MODE_EXPECTATIONS.lernstandscheck;
    assert.strictEqual(quiz.preferredbehaviour, expected.preferredbehaviour);
    assert.strictEqual(Number(quiz.attempts), expected.attempts);
    assert.strictEqual(Number(quiz.grademethod), expected.grademethod);
  }
);

test(
  'local_aicoursecreator_update_quiz_settings stellt ein bestehendes Quiz auf abschlusstest um',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    let created;
    try {
      created = await callMoodle('local_aicoursecreator_create_quiz', {
        courseid:   MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name:       `Quiz-Update-Modus ${Date.now()}`,
        mode:       'mini-check',
        intro:      '',
        visible:    1,
      });
    } catch (err) {
      if (SKIP_PATTERN.test(err.message)) {
        t.skip(`create_quiz noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    try {
      await callMoodle('local_aicoursecreator_update_quiz_settings', {
        cmid: created.cmid,
        mode: 'abschlusstest',
      });
    } catch (err) {
      if (SKIP_PATTERN.test(err.message)) {
        t.skip(`update_quiz_settings noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    let quiz;
    try {
      quiz = await fetchQuizSettings(created.cmid);
    } catch (err) {
      if (SKIP_PATTERN.test(err.message)) {
        t.skip(`mod_quiz_get_quizzes_by_courses nicht verfuegbar: ${err.message}`);
        return;
      }
      throw err;
    }

    const expected = MODE_EXPECTATIONS.abschlusstest;
    assert.ok(quiz, 'Quiz muss auffindbar sein');
    assert.strictEqual(quiz.preferredbehaviour, expected.preferredbehaviour);
    assert.strictEqual(Number(quiz.attempts), expected.attempts);
    assert.strictEqual(Number(quiz.grademethod), expected.grademethod);
    assert.strictEqual(Number(quiz.questionsperpage), expected.questionsperpage);
    assert.strictEqual(Number(quiz.delay1), expected.delay1);
    assert.strictEqual(Number(quiz.delay2), expected.delay2);
    assert.strictEqual(Number(quiz.reviewrightanswer), 0);
  }
);
