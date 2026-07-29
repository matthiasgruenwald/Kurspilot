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
  'create_choice legt Abstimmung mit 3 Optionen an und update_choice aendert Name/Optionen',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const stamp = Date.now();
    const choiceName = `Abstimmung-Test ${stamp}`;

    let created;
    try {
      created = await callMoodle('local_coursepilot_create_choice', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name: choiceName,
        intro: 'Integrationstest mod_choice',
        'options[0]': 'Option A',
        'options[1]': 'Option B',
        'options[2]': 'Option C',
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_create_choice noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(created.cmid > 0, 'create_choice sollte eine cmid zurueckgeben');
    assert.strictEqual(created.name, choiceName);
    assert.deepStrictEqual(created.options, ['Option A', 'Option B', 'Option C']);

    const modulesAfterCreate = await callMoodle('local_coursepilot_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const createdModule = modulesAfterCreate.find((m) => m.cmid === created.cmid);
    assert.ok(createdModule, 'Erstellte Abstimmung sollte in get_modules auftauchen');
    assert.strictEqual(createdModule.modname, 'choice');
    assert.strictEqual(createdModule.name, choiceName);

    const updatedName = `Abstimmung-Test aktualisiert ${stamp}`;
    let updated;
    try {
      updated = await callMoodle('local_coursepilot_update_choice', {
        cmid: created.cmid,
        name: updatedName,
        'options[0]': 'Ja',
        'options[1]': 'Nein',
        'options[2]': 'Vielleicht',
        'options[3]': 'Enthaltung',
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_update_choice noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.strictEqual(updated.cmid, created.cmid, 'update_choice sollte dieselbe cmid zurueckgeben');
    assert.strictEqual(updated.name, updatedName);
    assert.deepStrictEqual(updated.options, ['Ja', 'Nein', 'Vielleicht', 'Enthaltung']);

    const modulesAfterUpdate = await callMoodle('local_coursepilot_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const updatedModule = modulesAfterUpdate.find((m) => m.cmid === created.cmid);
    assert.ok(updatedModule, 'Abstimmung sollte nach update in get_modules auftauchen');
    assert.strictEqual(updatedModule.name, updatedName);
  }
);
