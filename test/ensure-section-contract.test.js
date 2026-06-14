const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MCP_PATH = path.join(__dirname, '..', 'moodle-mcp.js');
const SERVICES_PATH = path.join(
  __dirname,
  '..',
  'Plugin',
  'src',
  'local_aicoursecreator',
  'db',
  'services.php'
);

test('moodle_ensure_section is exposed by MCP and registered in Moodle services', () => {
  const mcpSource = fs.readFileSync(MCP_PATH, 'utf8');
  const servicesSource = fs.readFileSync(SERVICES_PATH, 'utf8');

  assert.match(mcpSource, /name:\s*"moodle_ensure_section"/);
  assert.match(mcpSource, /local_aicoursecreator_ensure_section/);
  assert.match(servicesSource, /'local_aicoursecreator_ensure_section'\s*=>/);
  assert.match(servicesSource, /'local_aicoursecreator_ensure_section'/);
});
