'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

test(
  'local_coursepilot_get_sections liefert Abschnitte des Testkurses',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async () => {
    const sections = await callMoodle('local_coursepilot_get_sections', {
      courseid: MOODLE_TEST_COURSEID,
    });

    assert.ok(Array.isArray(sections));
    assert.ok(sections.length > 0);
  }
);

test(
  'move_section auf nicht-existierenden Zielabschnitt erzeugt diesen (#226)',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async () => {
    const uniqueName = `Move-Test #226 ${Date.now()}`;
    const sections = await callMoodle('local_coursepilot_get_sections', {
      courseid: MOODLE_TEST_COURSEID,
    });
    const maxSection = Math.max(...sections.map(s => s.sectionnum));
    const sourceNum = maxSection;
    const targetNum = maxSection + 2;

    await callMoodle('local_coursepilot_ensure_section', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: sourceNum,
      name: uniqueName,
    });

    const result = await callMoodle('local_coursepilot_move_section', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: sourceNum,
      targetsectionnum: targetNum,
    });

    assert.strictEqual(result.moved, 1);

    const after = await callMoodle('local_coursepilot_get_sections', {
      courseid: MOODLE_TEST_COURSEID,
    });
    const moved = after.find(s => s.name === uniqueName);
    assert.ok(moved, 'Abschnitt existiert nach dem Verschieben');
    assert.ok(moved.sectionnum > sourceNum, 'Abschnitt ist an hoeherer Position');

    await callMoodle('local_coursepilot_move_section', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: moved.sectionnum,
      targetsectionnum: sourceNum,
    });
  }
);
