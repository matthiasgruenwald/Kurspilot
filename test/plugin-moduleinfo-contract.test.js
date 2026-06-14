const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CREATE_ASSIGN_PATH = path.join(
  __dirname,
  '..',
  'Plugin',
  'src',
  'local_aicoursecreator',
  'classes',
  'external',
  'create_assign.php'
);

test('create_assign provides cmidnumber before add_moduleinfo for Moodle 5.0', () => {
  const source = fs.readFileSync(CREATE_ASSIGN_PATH, 'utf8');
  const cmidnumberIndex = source.indexOf('$moduleinfo->cmidnumber');
  const addModuleInfoIndex = source.indexOf('add_moduleinfo($moduleinfo, $course)');

  assert.notStrictEqual(cmidnumberIndex, -1);
  assert.notStrictEqual(addModuleInfoIndex, -1);
  assert.ok(cmidnumberIndex < addModuleInfoIndex);
});
