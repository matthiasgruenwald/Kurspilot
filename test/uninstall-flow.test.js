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
    removeClaudeCodeConfig: [],
    removeCodexConfig: [],
    removeOpenCodeConfig: [],
    removeSkills: [],
    cleanLegacyCodexSkills: [],
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
    removeKurspilotEntriesFromClaudeCodeConfig: (...args) => {
      calls.removeClaudeCodeConfig.push(args);
      return { removed: true, backupPath: null, configPath: args[0] };
    },
    removeKurspilotEntriesFromCodexConfig: (...args) => {
      calls.removeCodexConfig.push(args);
      return { removed: true, backupPath: null, configPath: args[0] };
    },
    removeKurspilotEntriesFromOpenCodeConfig: (...args) => {
      calls.removeOpenCodeConfig.push(args);
      return { removed: true, backupPath: null, configPath: args[0] };
    },
    removeSkillsForProvider: (...args) => {
      calls.removeSkills.push(args);
      return { removed: ['fake-dir'] };
    },
    cleanLegacyCodexSkills: (...args) => {
      calls.cleanLegacyCodexSkills.push(args);
      return { removed: [], conflicts: [], conflictSkillNames: [], conflictPrompts: [], warnings: [] };
    },
    ...overrides,
  };
}

test('runUninstallFlow entfernt Credentials, Config-Eintraege und Skills fuer alle drei Clients', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  const report = runUninstallFlow({ homeDir, ...stubs });

  assert.strictEqual(stubs.calls.removeCredentials, 1);
  assert.strictEqual(stubs.calls.removeClaudeConfig.length, 1);
  assert.strictEqual(stubs.calls.removeCodexConfig.length, 1);
  assert.strictEqual(stubs.calls.removeOpenCodeConfig.length, 1);
  assert.strictEqual(stubs.calls.removeSkills.length, 2, 'gemeinsame Ablage wird nur einmal entfernt');
  assert.strictEqual(report.credentialsRemoved, true);
  assert.deepStrictEqual(report.configsCleaned.sort(), ['claude', 'codex', 'opencode']);
  assert.deepStrictEqual(report.skillsRemoved.sort(), ['claude', 'codex']);
  assert.strictEqual(stubs.calls.cleanLegacyCodexSkills[0][0], path.join(homeDir, '.codex', 'skills'));
});

test('runUninstallFlow nutzt korrekte Pfade fuer Claude-, Codex- und opencode-Config relativ zu homeDir', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  runUninstallFlow({ homeDir, ...stubs });

  assert.strictEqual(
    stubs.calls.removeClaudeConfig[0][0],
    path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  );
  assert.strictEqual(stubs.calls.removeCodexConfig[0][0], path.join(homeDir, '.codex', 'config.toml'));
  assert.strictEqual(stubs.calls.removeOpenCodeConfig[0][0], path.join(homeDir, '.config', 'opencode', 'opencode.json'));
});

test('runUninstallFlow nutzt die gemeinsame kanonische Skill-Zielwurzel nur einmal', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  runUninstallFlow({ homeDir, ...stubs });

  const targetRoots = stubs.calls.removeSkills.map(args => args[0]);
  assert.ok(targetRoots.includes(path.join(homeDir, '.claude', 'skills')));
  assert.ok(targetRoots.includes(path.join(homeDir, '.agents', 'skills')));
  assert.strictEqual(targetRoots.filter(targetRoot => targetRoot === path.join(homeDir, '.agents', 'skills')).length, 1);
});

test('runUninstallFlow bereinigt den Legacy-Pfad nur über den konservativen Cleanup', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs({
    cleanLegacyCodexSkills: legacyRoot => ({
      removed: [path.join(legacyRoot, 'kurspilot')],
      conflicts: ['kurspilot/SKILL.md'],
      conflictSkillNames: ['kurspilot'],
      conflictPrompts: [],
      warnings: ['Alt-Ort: Verwalteter Kurspilot-Skill lokal verändert.'],
    }),
  });

  const report = runUninstallFlow({ homeDir, ...stubs });

  assert.deepStrictEqual(report.legacySkillCleanup.conflicts, ['kurspilot/SKILL.md']);
  assert.match(report.legacySkillCleanup.warnings[0], /Alt-Ort/);
});

test('runUninstallFlow entfernt auch die Kurspilot-Eintraege aus ~/.claude.json (Issue #112-Folgefehler)', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  const report = runUninstallFlow({ homeDir, ...stubs });

  assert.strictEqual(stubs.calls.removeClaudeCodeConfig.length, 1);
  assert.strictEqual(stubs.calls.removeClaudeCodeConfig[0][0], path.join(homeDir, '.claude.json'));
  assert.deepStrictEqual(report.configsCleaned.sort(), ['claude', 'codex', 'opencode'], 'claude darf trotz zwei entfernten Configs nicht doppelt im Report stehen');
});

test('runUninstallFlow gibt nie einen Moodle-Token oder Credential-Wert im Report zurueck', () => {
  const homeDir = makeTmpDir();
  const stubs = makeStubs();

  const report = runUninstallFlow({ homeDir, ...stubs });

  const serialized = JSON.stringify(report);
  assert.ok(!/token/i.test(serialized));
});
