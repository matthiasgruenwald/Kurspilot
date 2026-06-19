'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

// Die Webservice-Funktion local_aicoursecreator_add_questions_to_quiz ist neu
// (#13) und muss erst per Plugin-Update auf der Test-Moodle-Instanz deployed
// werden. Solange sie dort fehlt, Test sauber skippen statt rot melden.
const UNKNOWN_FUNCTION_PATTERN = /invalidfunction|invalidwsfunction|invalidrecord|unbekannte funktion|does not exist/i;
const TEST_SECTIONNUM = 1;

function isUnknownFunctionError(err) {
  return UNKNOWN_FUNCTION_PATTERN.test(err.message);
}

const CATEGORY_NAME = '13.1 Fragen-Referenzen (Integrationstest)';

async function createCategory(t) {
  try {
    return await callMoodle('local_aicoursecreator_create_question_category', {
      courseid: MOODLE_TEST_COURSEID,
      name: CATEGORY_NAME,
    });
  } catch (err) {
    if (isUnknownFunctionError(err)) {
      t.skip(`Vorbedingung create_question_category fehlt: ${err.message}`);
      return null;
    }
    throw err;
  }
}

async function createQuiz(t, name) {
  try {
    return await callMoodle('local_aicoursecreator_create_quiz', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
      name,
      intro: '',
      gradepass: 80,
      visible: 1,
    });
  } catch (err) {
    if (isUnknownFunctionError(err)) {
      t.skip(`Vorbedingung create_quiz fehlt: ${err.message}`);
      return null;
    }
    throw err;
  }
}

async function createMcQuestion(t, categoryid, name) {
  try {
    return await callMoodle('local_aicoursecreator_create_mc_question', {
      categoryid,
      name,
      questiontext: `<p>${name}?</p>`,
      'options[0]': 'A',
      'options[1]': 'B',
      correctindex: 0,
    });
  } catch (err) {
    if (isUnknownFunctionError(err)) {
      t.skip(`Vorbedingung create_mc_question fehlt: ${err.message}`);
      return null;
    }
    throw err;
  }
}

test(
  'add_questions_to_quiz fuegt Fragen in Eingabe-Reihenfolge als latest-version-Referenzen hinzu',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const cat = await createCategory(t);
    if (!cat) return;

    const quiz = await createQuiz(t, `Fragen-Quiz Reihenfolge ${Date.now()}`);
    if (!quiz) return;

    const ts = Date.now();
    const q1 = await createMcQuestion(t, cat.id, `Reihenfolge A ${ts}`);
    if (!q1) return;
    const q2 = await createMcQuestion(t, cat.id, `Reihenfolge B ${ts}`);
    if (!q2) return;

    let result;
    try {
      result = await callMoodle('local_aicoursecreator_add_questions_to_quiz', {
        cmid: quiz.cmid,
        'questionids[0]': q1.questionid,
        'questionids[1]': q2.questionid,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`add_questions_to_quiz noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.strictEqual(result.results.length, 2);
    assert.strictEqual(result.results[0].added, true);
    assert.strictEqual(result.results[1].added, true);

    assert.strictEqual(result.slots.length, 2, 'Quiz sollte genau 2 Slots haben');
    assert.strictEqual(result.slots[0].slot, 1);
    assert.strictEqual(result.slots[1].slot, 2);
    assert.strictEqual(result.slots[0].questionbankentryid, q1.questionbankentryid,
      'Slot 1 muss Frage q1 referenzieren (Eingabe-Reihenfolge)');
    assert.strictEqual(result.slots[1].questionbankentryid, q2.questionbankentryid,
      'Slot 2 muss Frage q2 referenzieren (Eingabe-Reihenfolge)');
  }
);

test(
  'add_questions_to_quiz: Bearbeiten einer Frage (#9) zeigt im Quiz die neue Version, Duplikate werden uebersprungen',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const cat = await createCategory(t);
    if (!cat) return;

    const quiz = await createQuiz(t, `Fragen-Quiz Versionierung ${Date.now()}`);
    if (!quiz) return;

    const qname = `Versionierung ${Date.now()}`;
    const q1 = await createMcQuestion(t, cat.id, qname);
    if (!q1) return;

    let added;
    try {
      added = await callMoodle('local_aicoursecreator_add_questions_to_quiz', {
        cmid: quiz.cmid,
        'questionids[0]': q1.questionid,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`add_questions_to_quiz noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.strictEqual(added.results[0].added, true);
    assert.strictEqual(added.slots[0].version, 1);
    assert.strictEqual(added.slots[0].questionid, q1.questionid);

    // Frage bearbeiten -> neue question_versions-Zeile (version=2, ADR-0001).
    const updated = await callMoodle('local_aicoursecreator_update_mc_question', {
      questionid: q1.questionid,
      name: qname,
      questiontext: '<p>Versionierung (korrigiert)?</p>',
      'options[0]': 'A',
      'options[1]': 'B',
      correctindex: 0,
    });
    assert.strictEqual(updated.version, 2);

    // Erneuter Aufruf mit der ALTEN questionid: gleiche questionbankentryid
    // -> Duplikat, wird uebersprungen. Da question_references.version=null
    // ist, zeigt das Quiz trotzdem die neue Version (#13).
    let again;
    try {
      again = await callMoodle('local_aicoursecreator_add_questions_to_quiz', {
        cmid: quiz.cmid,
        'questionids[0]': q1.questionid,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`add_questions_to_quiz noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.strictEqual(again.results[0].added, false,
      'Bereits vorhandene Frage (gleiche questionbankentryid) darf nicht erneut hinzugefuegt werden');
    assert.strictEqual(again.slots.length, 1, 'Kein zusaetzlicher Slot durch Duplikat');
    assert.strictEqual(again.slots[0].version, 2,
      'Quiz muss nach Edit die neue Version zeigen (version=null = immer aktuellste)');
    assert.strictEqual(again.slots[0].questionid, updated.questionid);
  }
);
