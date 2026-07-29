'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

const UNKNOWN_FUNCTION_PATTERN = /invalidfunction|invalidwsfunction|invalidrecord|unbekannte funktion|does not exist/i;
const TEST_SECTIONNUM = 39;

test(
  'local_coursepilot_ensure_section legt Abschnitt an und setzt summary (#217)',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const run = Date.now();
    const name = `Ensure-Section-Test ${run}`;
    const summary = `<p>Handlungssituation-Test ${run}</p>`;

    let created;
    try {
      created = await callMoodle('local_coursepilot_ensure_section', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name,
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_ensure_section noch nicht auf Test-Moodle deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(created.sectionid > 0);
    assert.strictEqual(created.sectionnum, TEST_SECTIONNUM);

    const updated = await callMoodle('local_coursepilot_ensure_section', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
      summary,
    });

    assert.strictEqual(updated.sectionid, created.sectionid);
    assert.strictEqual(updated.sectionnum, TEST_SECTIONNUM);
    assert.strictEqual(updated.created, 0);

    const sections = await callMoodle('local_coursepilot_get_sections', {
      courseid: MOODLE_TEST_COURSEID,
    });

    const section = sections.find((s) => s.sectionnum === TEST_SECTIONNUM);
    assert.ok(section, 'Abschnitt sollte in get_sections auftauchen');
    assert.strictEqual(section.id, created.sectionid);
    assert.strictEqual(section.name, name);
    assert.ok(
      section.summary.includes(`Handlungssituation-Test ${run}`),
      'summary sollte über ensure_section gesetzt worden sein'
    );
  }
);
