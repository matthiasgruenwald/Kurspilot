'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

// Webservices fuer #9 sind neu und werden erst per Plugin-Update auf Test-
// Moodle ausgerollt. Solange sie dort fehlen, Test sauber skippen statt rot.
const UNKNOWN_FUNCTION_PATTERN = /invalidfunction|invalidwsfunction|invalidrecord|unbekannte funktion|does not exist/i;

function isUnknownFunctionError(err) {
  return UNKNOWN_FUNCTION_PATTERN.test(err.message);
}

const CATEGORY_NAME = '9.1 MC-Fragen Versioning (Integrationstest)';

test(
  'create + update MC-Frage erzeugt zweite question_versions-Zeile zur selben questionbankentryid (ADR-0001)',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    // 1) Test-Kategorie anlegen (idempotent).
    let cat;
    try {
      cat = await callMoodle('local_aicoursecreator_create_question_category', {
        courseid: MOODLE_TEST_COURSEID,
        name: CATEGORY_NAME,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Vorbedingung create_question_category fehlt: ${err.message}`);
        return;
      }
      throw err;
    }
    assert.ok(cat.id > 0, 'Kategorie sollte gueltige ID haben');

    // 2) MC-Frage in der Kategorie anlegen.
    const baseName = `Was ist H2O? (Test ${Date.now()})`;
    let created;
    try {
      created = await callMoodle('local_aicoursecreator_create_mc_question', {
        categoryid:    cat.id,
        name:          baseName,
        questiontext:  '<p>Was ist H2O?</p>',
        'options[0]':  'Wasser',
        'options[1]':  'Sauerstoff',
        'options[2]':  'Wasserstoff',
        correctindex:  0,
        defaultmark:   1.0,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`create_mc_question noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(created.questionid > 0, 'questionid muss gesetzt sein');
    assert.ok(created.questionbankentryid > 0, 'questionbankentryid muss gesetzt sein');
    assert.strictEqual(created.version, 1, 'Initiale Version muss 1 sein');
    assert.ok(Array.isArray(created.answerids) && created.answerids.length === 3,
      'Drei Antworten erwartet');

    const entryId = created.questionbankentryid;
    const originalQuestionId = created.questionid;

    // 3) Get_question: muss aktuelle (=einzige) Version liefern.
    const fetched = await callMoodle('local_aicoursecreator_get_question', {
      categoryid: cat.id,
      name:       baseName,
    });
    assert.strictEqual(fetched.questionbankentryid, entryId);
    assert.strictEqual(fetched.version, 1);
    assert.strictEqual(fetched.questionid, originalQuestionId);

    // 4) Update: erzeugt NEUE question-Zeile + neue question_versions-Zeile
    //    zur SELBEN questionbankentryid. Alte Version bleibt unangetastet.
    const updated = await callMoodle('local_aicoursecreator_update_mc_question', {
      questionid:    originalQuestionId,
      name:          baseName, // Name bleibt: Identitaet ueber Versionen
      questiontext:  '<p>Was ist H2O? (korrigiert)</p>',
      'options[0]':  'Wasser',
      'options[1]':  'Sauerstoff',
      'options[2]':  'Stickstoff',
      correctindex:  0,
      defaultmark:   1.0,
    });

    assert.ok(updated.questionid > 0, 'Neue questionid erwartet');
    assert.notStrictEqual(updated.questionid, originalQuestionId,
      'Update muss eine NEUE question-Zeile anlegen (nicht in place mutieren)');
    assert.strictEqual(updated.questionbankentryid, entryId,
      'questionbankentryid muss konstant bleiben (selbe Frage-Identitaet)');
    assert.strictEqual(updated.version, 2, 'Zweite Version muss version=2 haben');

    // 5) Get_question liefert jetzt die latest version (=2).
    const latest = await callMoodle('local_aicoursecreator_get_question', {
      categoryid: cat.id,
      name:       baseName,
    });
    assert.strictEqual(latest.version, 2, 'get_question liefert latest version');
    assert.strictEqual(latest.questionbankentryid, entryId);
    assert.strictEqual(latest.questionid, updated.questionid);
  }
);

test(
  'get_question per id liefert dieselbe Frage wie per name',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    let cat;
    try {
      cat = await callMoodle('local_aicoursecreator_create_question_category', {
        courseid: MOODLE_TEST_COURSEID,
        name: CATEGORY_NAME,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`Vorbedingung create_question_category fehlt: ${err.message}`);
        return;
      }
      throw err;
    }

    const qname = `Lookup-Test ${Date.now()}`;
    let created;
    try {
      created = await callMoodle('local_aicoursecreator_create_mc_question', {
        categoryid: cat.id,
        name: qname,
        questiontext: '<p>Test?</p>',
        'options[0]': 'A',
        'options[1]': 'B',
        correctindex: 1,
      });
    } catch (err) {
      if (isUnknownFunctionError(err)) {
        t.skip(`create_mc_question fehlt: ${err.message}`);
        return;
      }
      throw err;
    }

    const byName = await callMoodle('local_aicoursecreator_get_question', {
      categoryid: cat.id,
      name: qname,
    });
    const byId = await callMoodle('local_aicoursecreator_get_question', {
      categoryid: cat.id,
      questionid: created.questionid,
    });
    assert.strictEqual(byName.questionbankentryid, byId.questionbankentryid);
    assert.strictEqual(byName.questionid, byId.questionid);
  }
);
