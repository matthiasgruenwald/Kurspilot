const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readPluginClass(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function codeBeforeAddModuleInfo(source) {
  const addModuleInfoIndex = source.indexOf('add_moduleinfo($moduleinfo, $course)');
  assert.notStrictEqual(addModuleInfoIndex, -1, 'expected class to call add_moduleinfo');
  return source.slice(0, addModuleInfoIndex);
}

test('create_assign initializes cmidnumber before Moodle add_moduleinfo', () => {
  const source = readPluginClass('Plugin/src/local_aicoursecreator/classes/external/create_assign.php');
  assert.match(codeBeforeAddModuleInfo(source), /\$moduleinfo->cmidnumber\s*=/);
});
