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
const ACCESS_PATH = path.join(
  __dirname,
  '..',
  'Plugin',
  'src',
  'local_aicoursecreator',
  'db',
  'access.php'
);
const EXTERNAL_DIR = path.join(
  __dirname,
  '..',
  'Plugin',
  'src',
  'local_aicoursecreator',
  'classes',
  'external'
);

const servicesSource = fs.readFileSync(SERVICES_PATH, 'utf8');
const accessSource = fs.readFileSync(ACCESS_PATH, 'utf8');

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

test('Kurspilot usage is gated by a course capability instead of plugin-managed webservice rights', () => {
  assert.match(accessSource, /'local\/aicoursecreator:use'\s*=>\s*\[/);
  assert.match(accessSource, /'contextlevel'\s*=>\s*CONTEXT_COURSE/);
  assert.match(accessSource, /'editingteacher'\s*=>\s*CAP_ALLOW/);
  assert.match(accessSource, /'teacher'\s*=>\s*CAP_ALLOW/);
  assert.doesNotMatch(accessSource, /moodleaicoursecreator/);
  assert.doesNotMatch(accessSource, /webservice\//);
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
  assert.match(functionBlock('local_aicoursecreator_update_question_category'), /'capabilities'\s*=>\s*'moodle\/question:managecategory'/);
  assert.match(functionBlock('local_aicoursecreator_create_mc_question'), /'capabilities'\s*=>\s*'moodle\/question:add'/);
});

test('external webservice functions require the Kurspilot use capability in every validated context', () => {
  const expectations = [
    ['add_questions_to_quiz.php', ['moodle/course:manageactivities']],
    ['create_assign.php', ['moodle/course:manageactivities']],
    ['create_label.php', ['moodle/course:manageactivities']],
    ['create_mc_question.php', ['moodle/question:add']],
    ['create_page.php', ['moodle/course:manageactivities']],
    ['create_question_category.php', ['moodle/question:managecategory']],
    ['create_quiz.php', ['moodle/course:manageactivities']],
    ['create_url.php', ['moodle/course:manageactivities']],
    ['ensure_question_bank.php', ['moodle/course:manageactivities']],
    ['ensure_section.php', ['moodle/course:update']],
    ['get_course_catalog.php', []],
    ['get_modules.php', []],
    ['get_question.php', ['moodle/question:viewall']],
    ['get_question_categories.php', []],
    ['get_sections.php', []],
    ['move_module.php', ['moodle/course:manageactivities']],
    ['move_section.php', ['moodle/course:update']],
    ['set_completion.php', ['moodle/course:manageactivities']],
    ['set_restriction.php', ['moodle/course:manageactivities']],
    ['update_assign.php', ['moodle/course:manageactivities']],
    ['update_label.php', ['moodle/course:manageactivities']],
    ['update_mc_question.php', ['moodle/question:add']],
    ['update_page.php', ['moodle/course:manageactivities']],
    ['update_question_category.php', ['moodle/question:managecategory']],
    ['update_section.php', ['moodle/course:update']],
    ['update_url.php', ['moodle/course:manageactivities']],
    ['upload_assign_intro_image.php', ['moodle/course:manageactivities']],
    ['upload_assignfile.php', ['moodle/course:manageactivities']],
  ];

  for (const [fileName, moodleCapabilities] of expectations) {
    const source = fs.readFileSync(path.join(EXTERNAL_DIR, fileName), 'utf8');
    const validateCount = (source.match(/self::validate_context\(\$[a-zA-Z_][a-zA-Z0-9_]*\);/g) || []).length;
    const useGateCount = (source.match(/self::validate_context\((\$[a-zA-Z_][a-zA-Z0-9_]*)\);\s*require_capability\('local\/aicoursecreator:use', \1\);/g) || []).length;

    assert.ok(validateCount > 0, `${fileName} validates at least one context`);
    assert.equal(useGateCount, validateCount, `${fileName} gates every validated context with local/aicoursecreator:use`);

    for (const capability of moodleCapabilities) {
      const escapedCapability = capability.replace('/', '\\/');
      assert.match(source, new RegExp(`require_capability\\('${escapedCapability}', \\$[a-zA-Z_][a-zA-Z0-9_]*\\)`));
    }
  }
});
