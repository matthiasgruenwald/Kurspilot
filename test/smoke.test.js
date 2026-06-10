const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp.js');

test('Server startet und beendet sich sauber bei stdin-Ende', async () => {
  const child = spawn('node', [SERVER_PATH], {
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
  const child = spawn('node', [SERVER_PATH], {
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
