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
  'local_aicoursecreator_get_sections liefert Abschnitte des Testkurses',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async () => {
    const sections = await callMoodle('local_aicoursecreator_get_sections', {
      courseid: MOODLE_TEST_COURSEID,
    });

    assert.ok(Array.isArray(sections));
    assert.ok(sections.length > 0);
  }
);
