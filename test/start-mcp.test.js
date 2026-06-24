'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CREDENTIALS_CLI = path.join(__dirname, '..', 'scripts', 'moodle-credentials.js');
const WRAPPER_PATH = path.join(__dirname, '..', 'scripts', 'start-mcp.js');

// Eindeutiger Service-Name pro Testlauf, damit echte Lehrkraft-Keychain-Eintraege
// nie beruehrt werden und parallele Testlaeufe sich nicht in die Quere kommen.
const TEST_SERVICE = `MoodleMcp-test-startmcp-${process.pid}-${Date.now()}`;
const TEST_URL = 'https://moodle.example.test';
const TEST_TOKEN = 'super-secret-wrapper-token-98765';

function setCredentials() {
  execFileSync('node', [CREDENTIALS_CLI, 'set', '--url', TEST_URL, '--token', TEST_TOKEN], {
    encoding: 'utf8',
    env: { ...process.env, MOODLE_CREDENTIALS_SERVICE: TEST_SERVICE },
  });
}

function removeCredentials() {
  try {
    execFileSync('node', [CREDENTIALS_CLI, 'remove'], {
      encoding: 'utf8',
      env: { ...process.env, MOODLE_CREDENTIALS_SERVICE: TEST_SERVICE },
    });
  } catch {
    // bereits entfernt - kein Problem im Cleanup
  }
}

after(() => {
  removeCredentials();
});

function getProcessCommand(pid) {
  if (process.platform === 'win32') {
    return execFileSync('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine', '/value'], {
      encoding: 'utf8',
    });
  }
  return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
}

function startWrapper(extraArgs = []) {
  const { spawn } = require('node:child_process');
  const child = spawn('node', [WRAPPER_PATH, ...extraArgs], {
    env: { ...process.env, MOODLE_CREDENTIALS_SERVICE: TEST_SERVICE },
  });

  let stdoutBuffer = '';
  let stderrBuffer = '';
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
  child.stderr.on('data', chunk => { stderrBuffer += chunk; });

  return {
    child,
    request(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return new Promise(resolve => pending.push(resolve));
    },
    getStderr() { return stderrBuffer; },
    waitForReady() {
      return new Promise(resolve => {
        const check = () => {
          if (stderrBuffer.includes('Moodle MCP Server gestartet')) {
            resolve();
          } else {
            setTimeout(check, 25);
          }
        };
        check();
      });
    },
    stop() {
      child.stdin.end();
    },
  };
}

test('Wrapper startet den MCP-Server mit Credentials aus dem Schluesselbund, ohne Token in Argv/stdout/stderr', async () => {
  setCredentials();

  const server = startWrapper();
  try {
    await server.waitForReady();

    // Token darf in keinem ps-sichtbaren Argument des Kindprozesses stehen.
    const psOutput = getProcessCommand(server.child.pid);
    assert.ok(!psOutput.includes(TEST_TOKEN), 'Token darf nicht in den Prozessargumenten erscheinen');
    assert.ok(!server.getStderr().includes(TEST_TOKEN), 'Token darf nicht in stderr erscheinen');

    const toolsResponse = await server.request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const toolNames = toolsResponse.result.tools.map(tool => tool.name);
    assert.ok(toolNames.includes('moodle_create_page'), 'Full-Profil soll Write-Tools enthalten');
  } finally {
    server.stop();
  }
});

test('Wrapper reicht das read-only Profil durch und verbirgt Write-Tools', async () => {
  setCredentials();

  const server = startWrapper(['--profile', 'readonly']);
  try {
    await server.waitForReady();

    const toolsResponse = await server.request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const toolNames = toolsResponse.result.tools.map(tool => tool.name);

    assert.ok(!toolNames.includes('moodle_create_page'), 'Read-only-Profil darf keine Write-Tools zeigen');
    assert.ok(toolNames.includes('moodle_get_sections'), 'Read-only-Profil soll Lesetools zeigen');
  } finally {
    server.stop();
  }
});

test('Wrapper startet ueber --server quiz den Quiz-MCP statt des Monolithen', async () => {
  setCredentials();

  const server = startWrapper(['--server', 'quiz']);
  try {
    await server.waitForReady();

    const toolsResponse = await server.request({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const toolNames = toolsResponse.result.tools.map(tool => tool.name);

    assert.ok(toolNames.includes('moodle_create_quiz'), 'Quiz-MCP soll Quiz-Tools zeigen');
    assert.ok(!toolNames.includes('moodle_get_sections'), 'Quiz-MCP soll keine Core-Tools zeigen');
    assert.ok(!toolNames.includes('moodle_ensure_question_bank'), 'Quiz-MCP bleibt eigener Prozess');
  } finally {
    server.stop();
  }
});

test('Wrapper bricht klar ab, wenn keine Credentials im Schluesselbund liegen', async () => {
  removeCredentials();

  const exitInfo = await new Promise((resolve, reject) => {
    const { spawn } = require('node:child_process');
    const child = spawn('node', [WRAPPER_PATH], {
      env: { ...process.env, MOODLE_CREDENTIALS_SERVICE: TEST_SERVICE },
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({ code, stderr }));
  });

  assert.notStrictEqual(exitInfo.code, 0);
  assert.match(exitInfo.stderr, /Moodle-Zugangsdaten|Schluesselbund|Schlüsselbund/i);
});
