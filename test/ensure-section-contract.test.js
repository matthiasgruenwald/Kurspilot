const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('ensure_section is exposed as MCP tool and Moodle service', () => {
  const server = read('moodle-mcp.js');
  const services = read('Plugin/src/local_aicoursecreator/db/services.php');

  assert.match(server, /name:\s*"moodle_ensure_section"/);
  assert.match(server, /local_aicoursecreator_ensure_section/);
  assert.match(services, /'local_aicoursecreator_ensure_section'/);
});
