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
  'create_folder legt Verzeichnis an, upload_folder_file speichert Dateien (auch in Unterverzeichnissen) und update_folder benennt um',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const stamp = Date.now();
    const folderName = `Verzeichnis-Test ${stamp}`;

    let created;
    try {
      created = await callMoodle('local_coursepilot_create_folder', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: TEST_SECTIONNUM,
        name: folderName,
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_create_folder noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(created.cmid > 0, 'create_folder sollte eine cmid zurueckgeben');

    const modulesAfterCreate = await callMoodle('local_coursepilot_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const createdModule = modulesAfterCreate.find((m) => m.cmid === created.cmid);
    assert.ok(createdModule, 'Erstelltes Verzeichnis sollte in get_modules auftauchen');
    assert.strictEqual(createdModule.modname, 'folder');
    assert.strictEqual(createdModule.name, folderName);

    const rootFilename = `lesestoff-${stamp}.txt`;
    let uploaded;
    try {
      uploaded = await callMoodle('local_coursepilot_upload_folder_file', {
        cmid: created.cmid,
        filename: rootFilename,
        content: Buffer.from('Integrationstest upload_folder_file', 'utf8').toString('base64'),
        mimetype: 'text/plain',
        filepath: '/',
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_upload_folder_file noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.ok(uploaded.fileid > 0, 'upload_folder_file sollte eine fileid zurueckgeben');
    assert.strictEqual(uploaded.filename, rootFilename);
    assert.strictEqual(uploaded.filepath, '/');
    assert.ok(uploaded.files.includes(`/${rootFilename}`), 'Dateiliste sollte die Wurzel-Datei enthalten');

    const subFilename = `zusatz-${stamp}.pdf`;
    const uploadedSub = await callMoodle('local_coursepilot_upload_folder_file', {
      cmid: created.cmid,
      filename: subFilename,
      content: Buffer.from('Integrationstest Unterverzeichnis', 'utf8').toString('base64'),
      mimetype: 'application/pdf',
      filepath: 'material',
    });

    assert.ok(uploadedSub.fileid > 0, 'upload in Unterverzeichnis sollte eine fileid zurueckgeben');
    assert.strictEqual(uploadedSub.filepath, '/material/');
    assert.ok(uploadedSub.files.includes(`/material/${subFilename}`), 'Dateiliste sollte die Unterverzeichnis-Datei enthalten');
    assert.ok(uploadedSub.files.includes(`/${rootFilename}`), 'Dateiliste sollte die Wurzel-Datei weiterhin enthalten');

    let updated;
    try {
      updated = await callMoodle('local_coursepilot_update_folder', {
        cmid: created.cmid,
        name: `Verzeichnis-Test aktualisiert ${stamp}`,
      });
    } catch (err) {
      if (UNKNOWN_FUNCTION_PATTERN.test(err.message)) {
        t.skip(`local_coursepilot_update_folder noch nicht deployed: ${err.message}`);
        return;
      }
      throw err;
    }

    assert.strictEqual(updated.cmid, created.cmid, 'update_folder sollte dieselbe cmid zurueckgeben');
    assert.strictEqual(updated.name, `Verzeichnis-Test aktualisiert ${stamp}`);

    const modulesAfterUpdate = await callMoodle('local_coursepilot_get_modules', {
      courseid: MOODLE_TEST_COURSEID,
      sectionnum: TEST_SECTIONNUM,
    });
    const updatedModule = modulesAfterUpdate.find((m) => m.cmid === created.cmid);
    assert.ok(updatedModule, 'Verzeichnis sollte nach update in get_modules auftauchen');
    assert.strictEqual(updatedModule.name, `Verzeichnis-Test aktualisiert ${stamp}`);
  }
);
