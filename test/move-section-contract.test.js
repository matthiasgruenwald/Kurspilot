const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp.js');
const SERVICES_PATH = path.join(
  __dirname,
  '..',
  'Plugin',
  'src',
  'local_aicoursecreator',
  'db',
  'services.php'
);
const EXTERNAL_PATH = path.join(
  __dirname,
  '..',
  'Plugin',
  'src',
  'local_aicoursecreator',
  'classes',
  'external',
  'move_section.php'
);

function startServer({ profile } = {}) {
  const child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      MOODLE_URL: 'https://example.test/moodle',
      MOODLE_TOKEN: 'dummy-token',
      ...(profile ? { MOODLE_MCP_PROFILE: profile } : {}),
    },
  });

  let stdoutBuffer = '';
  const pending = [];

  child.stdout.on('data', chunk => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const next = pending.shift();
      if (next) next(JSON.parse(line));
    }
  });

  return {
    request(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return new Promise(resolve => pending.push(resolve));
    },
    stop() {
      child.stdin.end();
    },
  };
}

async function listToolNames(server) {
  const response = await server.request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  return response.result.tools.map(tool => tool.name);
}

function functionBlock(servicesSource, functionName) {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`'${escapedName}'\\s*=>\\s*\\[(.*?)\\n\\s*\\],`, 's');
  const match = servicesSource.match(pattern);
  assert.ok(match, `function block for ${functionName} exists`);
  return match[1];
}

test('moodle_move_section is only exposed in the full MCP profile and registered in Moodle services', async () => {
  const fullServer = startServer();
  const readonlyServer = startServer({ profile: 'readonly' });

  try {
    const [fullToolNames, readonlyToolNames] = await Promise.all([
      listToolNames(fullServer),
      listToolNames(readonlyServer),
    ]);
    const servicesSource = fs.readFileSync(SERVICES_PATH, 'utf8');
    const externalSource = fs.readFileSync(EXTERNAL_PATH, 'utf8');
    const moveSectionBlock = functionBlock(servicesSource, 'local_aicoursecreator_move_section');

    assert.ok(fullToolNames.includes('moodle_move_section'));
    assert.equal(readonlyToolNames.includes('moodle_move_section'), false);
    assert.match(servicesSource, /'local_aicoursecreator_move_section'\s*=>\s*\[/);
    assert.match(moveSectionBlock, /'classname'\s*=>\s*'local_aicoursecreator\\external\\move_section'/);
    assert.match(moveSectionBlock, /'capabilities'\s*=>\s*'moodle\/course:update'/);
    assert.match(servicesSource, /'local_aicoursecreator_move_section'/);
    assert.match(externalSource, /class move_section extends external_api/);
    assert.match(externalSource, /require_capability\('moodle\/course:update', \$context\)/);
    assert.match(externalSource, /move_section_to\(\$course, \$params\['sectionnum'\], \$params\['targetsectionnum'\]\)/);
    assert.doesNotMatch(externalSource, /update_record\('course_sections'/);
  } finally {
    fullServer.stop();
    readonlyServer.stop();
  }
});
