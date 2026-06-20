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
  assert.match(source, /reviewmaxmarks/);
});

test('lernstandscheck defaults include pass-grade completion, review flags and three feedback bands', () => {
  const source = fs.readFileSync(CREATE_QUIZ_PATH, 'utf8');

  assert.match(source, /'preferredbehaviour'\s*=>\s*'deferredcbm'/);
  assert.match(source, /'questionsperpage'\s*=>\s*0/);
  assert.match(source, /'attempts'\s*=>\s*0/);
  assert.match(source, /'grademethod'\s*=>\s*QUIZ_GRADEHIGHEST/);
  assert.match(source, /'gradepass'\s*=>\s*80\.0/);
  assert.match(source, /'decimalpoints'\s*=>\s*2/);
  assert.match(source, /'completion'\s*=>\s*2/);
  assert.match(source, /'completionusegrade'\s*=>\s*1/);
  assert.match(source, /'completionpassgrade'\s*=>\s*1/);
  assert.match(source, /review_form_flags/);
  assert.match(source, /'rightanswerduring'/);
  assert.match(source, /'rightanswerimmediately'/);
  assert.match(source, /'rightansweropen'/);
  assert.match(source, /'rightanswerclosed'/);
  assert.match(source, /'maxmarksimmediately'/);
  assert.match(source, /'maxmarksopen'/);
  assert.match(source, /'maxmarksclosed'/);
  assert.match(source, /'overallfeedbackimmediately'/);
  assert.match(source, /'overallfeedbackopen'/);
  assert.match(source, /'overallfeedbackclosed'/);
  assert.match(source, /'high'\s*=>/);
  assert.match(source, /'middle'\s*=>/);
  assert.match(source, /'low'\s*=>/);
  assert.match(source, /feedback_boundaries/);
});

test('update_quiz_settings returns saved quiz, completion, review and feedback values', () => {
  const source = fs.readFileSync(UPDATE_QUIZ_PATH, 'utf8');
  const createSource = fs.readFileSync(CREATE_QUIZ_PATH, 'utf8');

  assert.match(source, /read_saved_settings/);
  assert.match(source, /completionusegrade/);
  assert.match(source, /completionpassgrade/);
  assert.match(source, /reviewrightanswer/);
  assert.match(source, /reviewmaxmarks/);
  assert.match(source, /reviewmarks/);
  assert.match(source, /reviewoverallfeedback/);
  assert.match(source, /feedbackboundaries/);
  assert.match(createSource, /mingrade/);
  assert.match(source, /feedbackrecords/);
  assert.match(source, /create_quiz::saved_settings_return_structure/);
  assert.match(createSource, /new external_multiple_structure/);
});
