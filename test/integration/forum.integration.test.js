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
const TEST_SECTIONNUM = 1;

test(
  'create_forum legt Forum mit Typ an und update_forum aendert Name/Intro/Typ',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const stamp = Date.now();
    const forumName = `Forum-Test ${stamp}`;

    let created;
    try {
      created = await callMoodle('local_coursepilot_create_forum', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name: forumName,
        intro: 'Integrationstest mod_forum',
        type: 'qanda',
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_create_forum noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(created.cmid > 0, 'create_forum sollte eine cmid zurueckgeben');
    assert.strictEqual(created.name, forumName);
    assert.strictEqual(created.type, 'qanda');

    const modulesAfterCreate = await callMoodle('local_coursepilot_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const createdModule = modulesAfterCreate.find((m) => m.cmid === created.cmid);
    assert.ok(createdModule, 'Erstelltes Forum sollte in get_modules auftauchen');
    assert.strictEqual(createdModule.modname, 'forum');
    assert.strictEqual(createdModule.name, forumName);

    const updatedName = `Forum-Test aktualisiert ${stamp}`;
    let updated;
    try {
      updated = await callMoodle('local_coursepilot_update_forum', {
        cmid: created.cmid,
        name: updatedName,
        intro: 'Geaenderte Beschreibung',
        type: 'general',
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_update_forum noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.strictEqual(updated.cmid, created.cmid, 'update_forum sollte dieselbe cmid zurueckgeben');
    assert.strictEqual(updated.name, updatedName);
    assert.strictEqual(updated.type, 'general');

    const modulesAfterUpdate = await callMoodle('local_coursepilot_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const updatedModule = modulesAfterUpdate.find((m) => m.cmid === created.cmid);
    assert.ok(updatedModule, 'Forum sollte nach update in get_modules auftauchen');
    assert.strictEqual(updatedModule.name, updatedName);
  }
);
