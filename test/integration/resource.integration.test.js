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
  'local_coursepilot_create_resource legt Datei-Ressource an und update_resource tauscht die Datei',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const stamp = Date.now();
    const filename = `arbeitsblatt-${stamp}.txt`;

    let created;
    try {
      created = await callMoodle('local_coursepilot_create_resource', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name: `Datei-Test ${stamp}`,
        filename,
        content: Buffer.from('Integrationstest create_resource', 'utf8').toString('base64'),
        mimetype: 'text/plain',
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_create_resource noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(created.cmid > 0, 'create_resource sollte eine cmid zurueckgeben');
    assert.ok(created.fileid > 0, 'create_resource sollte eine fileid zurueckgeben');
    assert.strictEqual(created.filename, filename);

    const modulesAfterCreate = await callMoodle('local_coursepilot_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const createdModule = modulesAfterCreate.find((m) => m.cmid === created.cmid);
    assert.ok(createdModule, 'Erstellte Ressource sollte in get_modules auftauchen');
    assert.strictEqual(createdModule.modname, 'resource');

    const newFilename = `arbeitsblatt-neu-${stamp}.txt`;
    let updated;
    try {
      updated = await callMoodle('local_coursepilot_update_resource', {
        cmid: created.cmid,
        name: `Datei-Test aktualisiert ${stamp}`,
        filename: newFilename,
        content: Buffer.from('Zweite Version der Datei', 'utf8').toString('base64'),
        mimetype: 'text/plain',
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_update_resource noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.strictEqual(updated.cmid, created.cmid, 'update_resource sollte dieselbe cmid zurueckgeben');
    assert.strictEqual(updated.filename, newFilename, 'update_resource sollte die neue Datei als Hauptdatei melden');
  }
);
