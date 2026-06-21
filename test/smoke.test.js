const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp.js');
const CORE_SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp-core.js');

function smokeTestEntryPoint(serverPath) {
  test('Server startet und beendet sich sauber bei stdin-Ende', async () => {
    const child = spawn('node', [serverPath], {
      env: {
        ...process.env,
        MOODLE_URL: 'https://example.test/moodle',
        MOODLE_TOKEN: 'dummy-token',
      },
    });

    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => resolve(code));

      // Server wartet auf stdin; Ende signalisieren, sobald er bereit ist
      const onReady = () => {
        if (stderr.includes('Moodle MCP Server gestartet')) {
          child.stdin.end();
        } else {
          setTimeout(onReady, 50);
        }
      };
      onReady();
    });

    assert.strictEqual(exitCode, 0);
    assert.match(stderr, /Moodle MCP Server gestartet/);
  });

  test('Server bricht ohne MOODLE_URL/MOODLE_TOKEN mit Fehler ab', async () => {
    const child = spawn('node', [serverPath], {
      env: {
        ...process.env,
        MOODLE_URL: '',
        MOODLE_TOKEN: '',
      },
    });

    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => resolve(code));
    });

    assert.strictEqual(exitCode, 1);
    assert.match(stderr, /MOODLE_URL und MOODLE_TOKEN/);
  });
}

smokeTestEntryPoint(SERVER_PATH);

// Issue #89: Core-MCP-Extraktion - eigener stdio-Prozess mit denselben
// Start-/Fehlerverhalten wie der bestehende Rest-MCP.
smokeTestEntryPoint(CORE_SERVER_PATH);

test('Core-MCP liefert genau die aktivitaetsunabhaengigen Tools', async () => {
  const child = spawn('node', [CORE_SERVER_PATH], {
    env: {
      ...process.env,
      MOODLE_URL: 'https://example.test/moodle',
      MOODLE_TOKEN: 'dummy-token',
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

  function request(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
    return new Promise(resolve => pending.push(resolve));
  }

  try {
    const response = await request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const toolNames = response.result.tools.map(tool => tool.name).sort();

    assert.deepStrictEqual(toolNames, [
      'moodle_ensure_section',
      'moodle_get_course_catalog',
      'moodle_get_modules',
      'moodle_get_sections',
      'moodle_move_module',
      'moodle_move_section',
      'moodle_set_completion',
      'moodle_set_restriction',
      'moodle_update_section',
    ]);
  } finally {
    child.stdin.end();
  }
});
