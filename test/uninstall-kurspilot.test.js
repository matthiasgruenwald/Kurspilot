'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'uninstall-kurspilot.js');

function makeTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-uninstall-cli-test-'));
}

// Eindeutiger Service-Name pro Testlauf, damit echte Lehrkraft-Keychain-Eintraege
// (Standard-Service "MoodleMcp") nie beruehrt werden (siehe test/moodle-credentials.test.js).
function runCli(args, extraEnv = {}) {
  return execFileSync('node', [CLI_PATH, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MOODLE_CREDENTIALS_SERVICE: `MoodleMcp-test-uninstall-${process.pid}-${Date.now()}`,
      ...extraEnv,
    },
  });
}

test('CLI uninstall-kurspilot.js entfernt installiertes Payload-Verzeichnis unter --home', () => {
  const tmpHome = makeTmpHome();
  const payloadDir = path.join(tmpHome, 'Library', 'Application Support', 'Kurspilot');
  fs.mkdirSync(payloadDir, { recursive: true });
  fs.writeFileSync(path.join(payloadDir, 'moodle-mcp.js'), '// fake payload');

  const output = runCli(['--home', tmpHome]);

  assert.ok(!fs.existsSync(payloadDir), 'Payload-Verzeichnis sollte entfernt sein');
  assert.match(output, /entfernt/i);
});

test('CLI uninstall-kurspilot.js raeumt Claude- und Codex-Config-Eintraege unter --home auf', () => {
  const tmpHome = makeTmpHome();
  const claudeConfigPath = path.join(tmpHome, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  fs.mkdirSync(path.dirname(claudeConfigPath), { recursive: true });
  fs.writeFileSync(claudeConfigPath, JSON.stringify({
    mcpServers: {
      'kurspilot-planung': { command: 'node', args: ['/x/start-mcp.js'] },
      'andere-app': { command: 'node', args: ['/y/app.js'] },
    },
  }, null, 2));

  runCli(['--home', tmpHome]);

  const written = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
  assert.ok(!written.mcpServers['kurspilot-planung']);
  assert.ok(written.mcpServers['andere-app'], 'fremder Eintrag muss erhalten bleiben');
});

test('CLI uninstall-kurspilot.js ist No-Op-sicher, wenn nichts installiert war (kein Fehler)', () => {
  const tmpHome = makeTmpHome();

  const output = runCli(['--home', tmpHome]);

  assert.match(output, /Kurspilot/);
});

test('CLI uninstall-kurspilot.js gibt nie einen Moodle-Token im Output aus', () => {
  const tmpHome = makeTmpHome();

  const output = runCli(['--home', tmpHome]);

  assert.ok(!/token/i.test(output));
});
