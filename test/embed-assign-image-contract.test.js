const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXTERNAL_PATH = path.join(
  ROOT,
  'Plugin',
  'src',
  'local_aicoursecreator',
  'classes',
  'external',
  'upload_assign_intro_image.php'
);
const SERVICES_PATH = path.join(ROOT, 'Plugin', 'src', 'local_aicoursecreator', 'db', 'services.php');
const MCP_PATH = path.join(ROOT, 'moodle-mcp.js');

test('assignment intro images are embedded through the intro filearea', () => {
  assert.ok(fs.existsSync(EXTERNAL_PATH), 'upload_assign_intro_image external class exists');

  const source = fs.readFileSync(EXTERNAL_PATH, 'utf8');
  assert.match(source, /'component'\s*=>\s*'mod_assign'/);
  assert.match(source, /'filearea'\s*=>\s*'intro'/);
  assert.doesNotMatch(source, /introattachment/);
  assert.match(source, /@@PLUGINFILE@@/);
});

test('embedded assignment image upload is registered in Moodle services and MCP', () => {
  const servicesSource = fs.readFileSync(SERVICES_PATH, 'utf8');
  const mcpSource = fs.readFileSync(MCP_PATH, 'utf8');

  assert.match(servicesSource, /'local_aicoursecreator_upload_assign_intro_image'\s*=>/);
  assert.match(servicesSource, /'local_aicoursecreator_upload_assign_intro_image'/);
  assert.match(mcpSource, /name:\s*"moodle_embed_assign_image"/);
  assert.match(mcpSource, /local_aicoursecreator_upload_assign_intro_image/);
});
