const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SERVICES_PATH = path.join(
  __dirname,
  '..',
  'Plugin',
  'src',
  'local_aicoursecreator',
  'db',
  'services.php'
);

const servicesSource = fs.readFileSync(SERVICES_PATH, 'utf8');

function functionBlock(functionName) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`'${escapedName}'\\s*=>\\s*\\[(.*?)\\n\\s*\\],`, 's');
  const match = servicesSource.match(pattern);
  assert.ok(match, `function block for ${functionName} exists`);
  return match[1];
}

function serviceBlock(serviceName) {
  const escapedName = serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`'${escapedName}'\\s*=>\\s*\\[(.*?)'shortname'\\s*=>\\s*'ai_course_creator',\\n\\s*\\],`, 's');
  const match = servicesSource.match(pattern);
  assert.ok(match, `service block for ${serviceName} exists`);
  return match[1];
}

test('Kurspilot webservice is not restricted to a manual authorised-users whitelist', () => {
  const block = serviceBlock('AI Course Creator Service');

  assert.match(block, /'restrictedusers'\s*=>\s*0/);
});

test('read webservice functions stay trainer-scoped without metadata capabilities', () => {
  const readFunctions = [
    'local_aicoursecreator_get_modules',
    'local_aicoursecreator_get_course_catalog',
    'local_aicoursecreator_get_sections',
    'local_aicoursecreator_get_question_categories',
    'local_aicoursecreator_get_question',
  ];

  for (const functionName of readFunctions) {
    const block = functionBlock(functionName);

    assert.match(block, /'type'\s*=>\s*'read'/);
    assert.doesNotMatch(block, /'capabilities'\s*=>/);
  }
});

test('write webservice functions keep targeted capability declarations', () => {
  assert.match(functionBlock('local_aicoursecreator_create_page'), /'capabilities'\s*=>\s*'moodle\/course:manageactivities'/);
  assert.match(functionBlock('local_aicoursecreator_update_section'), /'capabilities'\s*=>\s*'moodle\/course:update'/);
  assert.match(functionBlock('local_aicoursecreator_ensure_question_bank'), /'capabilities'\s*=>\s*'moodle\/course:manageactivities'/);
  assert.match(functionBlock('local_aicoursecreator_create_question_category'), /'capabilities'\s*=>\s*'moodle\/question:managecategory'/);
  assert.match(functionBlock('local_aicoursecreator_create_mc_question'), /'capabilities'\s*=>\s*'moodle\/question:add'/);
});
