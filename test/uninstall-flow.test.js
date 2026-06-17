'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runUninstallFlow } = require('../lib/uninstall-flow');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-uninstall-flow-test-'));
}

function makeStubs(overrides = {}) {
  const calls = {
    removeCredentials: 0,
    removeClaudeConfig: [],
    removeCodexConfig: [],
    removeSkills: [],
  };

  return {
    calls,
    removeCredentials: () => {
      calls.removeCredentials += 1;
    },
    removeKurspilotEntriesFromClaudeConfig: (...args) => {
      calls.removeClaudeConfig.push(args);
      return { removed: true, backupPath: null, configPath: args[0] };
    },
    removeKurspilotEntriesFromCodexConfig: (...args) => {
      calls.removeCodexConfig.push(args);
      return { removed: true, backupPath: null, configPath: args[0] };
    },
    removeSkillsForProvider: (...args) => {
      calls.removeSkills.push(args);
      return { removed: ['fake-dir'] };
    },
    ...overrides,
  };
}

test('runUninstallFlow entfernt Credentials, Config-Eintraege und Skills fuer beide Clients', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  const report = runUninstallFlow({ homeDir, ...stubs });

  assert.strictEqual(stubs.calls.removeCredentials, 1);
  assert.strictEqual(stubs.calls.removeClaudeConfig.length, 1);
  assert.strictEqual(stubs.calls.removeCodexConfig.length, 1);
  assert.strictEqual(stubs.calls.removeSkills.length, 2, 'sollte fuer claude und codex aufgerufen werden');
  assert.strictEqual(report.credentialsRemoved, true);
  assert.deepStrictEqual(report.configsCleaned.sort(), ['claude', 'codex']);
  assert.deepStrictEqual(report.skillsRemoved.sort(), ['claude', 'codex']);
});

test('runUninstallFlow nutzt korrekte Pfade fuer Claude- und Codex-Config relativ zu homeDir', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  runUninstallFlow({ homeDir, ...stubs });

  assert.strictEqual(
    stubs.calls.removeClaudeConfig[0][0],
    path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  );
  assert.strictEqual(stubs.calls.removeCodexConfig[0][0], path.join(homeDir, '.codex', 'config.toml'));
});

test('runUninstallFlow nutzt korrekte Skill-Zielwurzeln fuer Claude und Codex', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  runUninstallFlow({ homeDir, ...stubs });

  const targetRoots = stubs.calls.removeSkills.map(args => args[0]);
  assert.ok(targetRoots.includes(path.join(homeDir, '.claude', 'skills')));
  assert.ok(targetRoots.includes(path.join(homeDir, '.codex', 'skills')));
});

test('runUninstallFlow gibt nie einen Moodle-Token oder Credential-Wert im Report zurueck', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  const report = runUninstallFlow({ homeDir, ...stubs });

  const serialized = JSON.stringify(report);
  assert.ok(!/token/i.test(serialized));
});
