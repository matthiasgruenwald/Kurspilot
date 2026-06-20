'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.join(__dirname, '..', 'Plugin', 'src', 'local_aicoursecreator');
const CREATE_QUIZ_PATH = path.join(PLUGIN_ROOT, 'classes', 'external', 'create_quiz.php');
const UPDATE_QUIZ_PATH = path.join(PLUGIN_ROOT, 'classes', 'external', 'update_quiz_settings.php');
const SERVICES_PATH = path.join(PLUGIN_ROOT, 'db', 'services.php');

test('create_quiz treats new Kurspilot quiz modes as native and old names as deprecated aliases', () => {
  const source = fs.readFileSync(CREATE_QUIZ_PATH, 'utf8');

  assert.match(source, /NATIVE_MODES\s*=\s*\['mini-check', 'lernstandscheck', 'abschlusstest'\]/);
  assert.match(source, /'intensiv'\s*=>\s*'mini-check'/);
  assert.match(source, /'lerncheck'\s*=>\s*'lernstandscheck'/);
  assert.match(source, /'bewertung'\s*=>\s*'abschlusstest'/);
  assert.match(source, /PARAM_ALPHANUMEXT/);
  assert.match(source, /'mode'\s*=>\s*new external_value\(PARAM_TEXT/);
});

test('update_quiz_settings is registered and checks activity-management capability', () => {
  const source = fs.readFileSync(UPDATE_QUIZ_PATH, 'utf8');
  const services = fs.readFileSync(SERVICES_PATH, 'utf8');

  assert.match(services, /local_aicoursecreator_update_quiz_settings/);
  assert.match(services, /'classname'\s*=>\s*'local_aicoursecreator\\external\\update_quiz_settings'/);
  assert.match(services, /'capabilities'\s*=>\s*'moodle\/course:manageactivities'/);
  assert.match(source, /get_coursemodule_from_id\('quiz'/);
  assert.match(source, /context_module::instance/);
  assert.match(source, /require_capability\('moodle\/course:manageactivities'/);
  assert.match(source, /completionpassgrade/);
  assert.match(source, /gradepass/);
  assert.match(source, /reviewrightanswer/);
});
