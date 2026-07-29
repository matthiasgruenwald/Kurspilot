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

function countByName(files, filename) {
  return (Array.isArray(files) ? files : []).filter((name) => name === filename).length;
}

test(
  'local_coursepilot_upload_assignfile laedt Datei sichtbar in die Aufgabe',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    let assign;
    try {
      assign = await callMoodle('local_coursepilot_create_assign', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name: `Upload-Testaufgabe ${Date.now()}`,
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_create_assign noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(assign.cmid > 0);

    const filename = `arbeitsblatt-${Date.now()}.txt`;
    let upload;
    try {
      upload = await callMoodle('local_coursepilot_upload_assignfile', {
        cmid: assign.cmid,
        filename,
        content: Buffer.from('Integrationstest upload_assignfile', 'utf8').toString('base64'),
        mimetype: 'text/plain',
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_upload_assignfile noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(upload.fileid > 0);
    assert.strictEqual(
      countByName(upload.files, filename),
      1,
      'Hochgeladene Datei sollte im Intro-Attachment-Bereich sichtbar sein'
    );

    const second = await callMoodle('local_coursepilot_upload_assignfile', {
      cmid: assign.cmid,
      filename,
      content: Buffer.from('Zweite Version', 'utf8').toString('base64'),
      mimetype: 'text/plain',
    });

    assert.ok(second.fileid > 0);
    assert.notStrictEqual(second.fileid, upload.fileid, 'Erneuter Upload sollte eine neue Datei anlegen');
    assert.strictEqual(
      countByName(second.files, filename),
      1,
      'Nach erneutem Upload darf nur eine Datei mit dem Namen existieren'
    );

    const modules = await callMoodle('local_coursepilot_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const created = modules.find((m) => m.cmid === assign.cmid);
    assert.ok(created, 'Erstellte Aufgabe sollte in get_modules auftauchen');
    assert.strictEqual(created.modname, 'assign');
  }
);
