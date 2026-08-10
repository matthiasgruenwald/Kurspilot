'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
  callMoodleWithToken,
} = require('../helpers/moodle-test-client');

const UNKNOWN_FUNCTION_PATTERN = /invalidfunction|invalidwsfunction|unbekannte funktion|does not exist/i;
const NO_MOVE_TOKEN = process.env.MOODLE_TEST_TOKEN_NO_QUESTION_MOVE || '';

async function callMove(t, params) {
  try {
    return await callMoodle('local_coursepilot_move_question', params);
  } catch (err) {
    if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
      t.skip(`move_question noch nicht auf Test-Moodle deployed: ${err.message}`);
      return null;
    }
    throw err;
  }
}

test(
  'move_question verschiebt alle Versionen innerhalb und zwischen Fragensammlungen',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const suffix = Date.now();
    const [sourceBank, targetBank] = await Promise.all([
      callMoodle('local_coursepilot_ensure_question_bank', {
        courseid: MOODLE_TEST_COURSEID, name: `Umzug Quelle ${suffix}`,
      }),
      callMoodle('local_coursepilot_ensure_question_bank', {
        courseid: MOODLE_TEST_COURSEID, name: `Umzug Ziel ${suffix}`,
      }),
    ]);
    const [source, withinTarget, crossTarget] = await Promise.all([
      callMoodle('local_coursepilot_create_question_category', {
        courseid: MOODLE_TEST_COURSEID, questionbankid: sourceBank.questionbankid, name: `Quelle ${suffix}`,
      }),
      callMoodle('local_coursepilot_create_question_category', {
        courseid: MOODLE_TEST_COURSEID, questionbankid: sourceBank.questionbankid, name: `Innerhalb ${suffix}`,
      }),
      callMoodle('local_coursepilot_create_question_category', {
        courseid: MOODLE_TEST_COURSEID, questionbankid: targetBank.questionbankid, name: `Übergreifend ${suffix}`,
      }),
    ]);
    const name = `Frage umziehen ${suffix}`;
    const created = await callMoodle('local_coursepilot_create_mc_question', {
      categoryid: source.id, name, questiontext: '<p>Version eins</p>',
      'options[0]': 'A', 'options[1]': 'B', correctindex: 0,
    });
    const updated = await callMoodle('local_coursepilot_update_mc_question', {
      questionid: created.questionid, name, questiontext: '<p>Version zwei</p>',
      'options[0]': 'A', 'options[1]': 'B', correctindex: 0,
    });
    const entryid = created.questionbankentryid;

    const within = await callMove(t, {
      questionid: updated.questionid, targetcategoryid: withinTarget.id,
    });
    if (!within) return;
    assert.equal(within.questionbankentryid, entryid);
    assert.deepEqual(within.versionids, [created.questionid, updated.questionid]);

    const withinReadback = await callMoodle('local_coursepilot_get_question', {
      categoryid: withinTarget.id, questionid: updated.questionid,
    });
    assert.equal(withinReadback.questionbankentryid, entryid);
    assert.equal(withinReadback.categoryid, withinTarget.id);

    const cross = await callMove(t, {
      questionid: created.questionid, targetcategoryid: crossTarget.id,
    });
    if (!cross) return;
    assert.equal(cross.questionbankentryid, entryid);
    assert.deepEqual(cross.versionids, [created.questionid, updated.questionid]);

    const crossReadback = await callMoodle('local_coursepilot_get_question', {
      categoryid: crossTarget.id, questionid: updated.questionid,
    });
    assert.equal(crossReadback.questionbankentryid, entryid);
    assert.equal(crossReadback.categoryid, crossTarget.id);
  }
);

test(
  'move_question lehnt einen Token ohne Frage-verschieben-Rechte ab',
  { skip: !(hasMoodleTestConfig && NO_MOVE_TOKEN) && 'Benötigt zusätzlich MOODLE_TEST_TOKEN_NO_QUESTION_MOVE.' },
  async () => {
    const suffix = Date.now();
    const bank = await callMoodle('local_coursepilot_ensure_question_bank', {
      courseid: MOODLE_TEST_COURSEID, name: `Umzug Rechte ${suffix}`,
    });
    const [source, target] = await Promise.all(['Quelle', 'Ziel'].map(name => callMoodle(
      'local_coursepilot_create_question_category', {
        courseid: MOODLE_TEST_COURSEID, questionbankid: bank.questionbankid, name: `${name} ${suffix}`,
      }
    )));
    const question = await callMoodle('local_coursepilot_create_mc_question', {
      categoryid: source.id, name: `Rechte ${suffix}`, questiontext: '<p>Test</p>',
      'options[0]': 'A', 'options[1]': 'B', correctindex: 0,
    });

    await assert.rejects(
      callMoodleWithToken(NO_MOVE_TOKEN, 'local_coursepilot_move_question', {
        questionid: question.questionid, targetcategoryid: target.id,
      }),
      /nopermissions|permission|berechtigung/i
    );
  }
);
