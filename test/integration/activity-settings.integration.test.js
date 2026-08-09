'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  hasMoodleTestConfig,
  SKIP_REASON,
  MOODLE_TEST_COURSEID,
  callMoodle,
} = require('../helpers/moodle-test-client');
const { CORE_TOOLS } = require('../../lib/core-tools');

const UNKNOWN_FUNCTION_PATTERN = /invalidfunction|invalidwsfunction|does not exist/i;
const updateActivitySettings = CORE_TOOLS.find(tool => tool.name === 'moodle_update_activity_settings');

test(
  'das bestehende Coursepilot-Token ändert Sichtbarkeit und Gruppenmodus und liest sie frisch zurück',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const page = await callMoodle('local_coursepilot_create_page', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: 1,
      name: `Core-Aktivitätseinstellungen ${Date.now()}`,
      content: '<p>Integrationstest</p>',
      visible: 1,
    });

    try {
      await updateActivitySettings.handler({
        courseid: MOODLE_TEST_COURSEID,
        cmid: page.cmid,
        visible: 0,
        groupmode: 1,
      }, callMoodle);
    } catch (error) {
      if (UNKNOWN_FUNCTION_PATTERN.test(error.message)) {
        t.skip(`Core-Kursseitenfunktion noch nicht auf Test-Moodle registriert: ${error.message}`);
        return;
      }
      throw error;
    }

    const catalog = await callMoodle('local_coursepilot_get_course_catalog', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: 1,
    });
    const module = catalog.sections.flatMap(section => section.modules).find(item => item.cmid === page.cmid);

    assert.ok(module, 'Die Aktivität ist im frischen Katalog-Read-back vorhanden');
    assert.equal(module.visible, 0);
    assert.equal(module.groupmode, 1);
  }
);
