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
        submissiondrafts: 0,
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

test(
  'local_coursepilot_create_assign speichert alle wirksamen Wiedereröffnungsabläufe',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    const create = async (suffix, settings) => {
      try {
        return await callMoodle('local_coursepilot_create_assign', {
          courseid: MOODLE_TEST_COURSEID,
          sectionnum: 1,
          name: `Versuchsablauf ${suffix} ${Date.now()}`,
          submissiondrafts: 1,
          ...settings,
        });
      } catch (err) {
        if (/invalidfunction|invalidwsfunction|does not exist/i.test(err.message)) {
          t.skip(`Versuchsablauf noch nicht deployed: ${err.message}`);
          return null;
        }
        throw err;
      }
    };

    const manual = await create('manuell', { maxattempts: 2, attemptreopenmethod: 'manual' });
    if (!manual) return;
    assert.equal(manual.maxattempts, 2);
    assert.equal(manual.attemptreopenmethod, 'manual');

    const automatic = await create('automatisch', { maxattempts: -1, attemptreopenmethod: 'automatic' });
    assert.equal(automatic.maxattempts, -1);
    assert.equal(automatic.attemptreopenmethod, 'automatic');

    const untilpass = await create('bis-bestehen', {
      grade: 100,
      gradepass: 50,
      maxattempts: -1,
      attemptreopenmethod: 'untilpass',
    });
    assert.equal(untilpass.gradepass, 50);
    assert.equal(untilpass.attemptreopenmethod, 'untilpass');

    const catalog = await callMoodle('local_coursepilot_get_course_catalog', {
      courseid: MOODLE_TEST_COURSEID,
      modname: 'assign',
      detail: 'compact',
    });
    const activity = catalog.sections.flatMap((section) => section.modules)
      .find((entry) => entry.cmid === untilpass.cmid);
    assert.equal(activity.settings.gradepass, '50');
    assert.equal(activity.settings.attemptreopenmethod, 'untilpass');
  }
);

test(
  'local_coursepilot_create_assign lehnt untilpass ohne Bestehensgrenze ab',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async () => {
    await assert.rejects(
      callMoodle('local_coursepilot_create_assign', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: 1,
        name: `Ungültiges untilpass ${Date.now()}`,
        submissiondrafts: 1,
        maxattempts: -1,
        attemptreopenmethod: 'untilpass',
      }),
      /Bestehensgrenze/i,
    );
  }
);

test(
  'local_coursepilot_create_assign lehnt unwirksame Wiedereröffnung ab',
  { skip: !hasMoodleTestConfig && SKIP_REASON },
  async (t) => {
    await assert.rejects(
      callMoodle('local_coursepilot_create_assign', {
        courseid: MOODLE_TEST_COURSEID,
        sectionnum: 1,
        name: `Ungültiger Ablauf ${Date.now()}`,
        submissiondrafts: 0,
        maxattempts: -1,
        attemptreopenmethod: 'automatic',
      }),
      /endgültige Abgabe/i,
    );
  }
);
