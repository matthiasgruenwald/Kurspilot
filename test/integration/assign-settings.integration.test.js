'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');

test(
  'local_coursepilot_create_assign und update_assign lesen die gespeicherten Übungs-Einstellungen zurück',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    let created;
    try {
      created = await callMoodle('local_coursepilot_create_assign', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: 1,
        name: `Übungs-Snapshot ${Date.now()}`,
        mode: 'übung',
        grade: 25,
      });
    } catch (err) {
      if (/invalidfunction|invalidwsfunction|does not exist/i.test(err.message)) {
        t.skip(`Assignment-Snapshot noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.equal(created.grade, 25, 'Explizite Bewertung überschreibt das Übungs-Preset');
    assert.equal(created.submissiondrafts, 0, 'Übung bleibt fortlaufend bearbeitbar');

    const updated = await callMoodle('local_coursepilot_update_assign', {
      cmid: created.cmid,
      name: `${created.name} aktualisiert`,
    });
    assert.equal(updated.grade, 25, 'Teilupdate bewahrt die Bewertung');
    assert.equal(updated.submissiondrafts, 0, 'Teilupdate bewahrt die Abgabe-Einstellung');

    const catalog = await callMoodle('local_coursepilot_get_course_catalog', {
      courseid: MOODLE_TEST_COURSEID,
      modname: 'assign',
      detail: 'compact',
    });
    const activity = catalog.sections
      .flatMap((section) => section.modules)
      .find((entry) => entry.cmid === created.cmid);
    assert.ok(activity, 'Frischer Katalog enthält die erstellte Aufgabe');
    assert.equal(activity.settings.grade, '25');
    assert.equal(activity.settings.submissiondrafts, '0');
  }
);
