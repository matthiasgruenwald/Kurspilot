'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  buildKurspilotEntries,
  setupClaudeDesktopConfig,
  setupClaudeCodeConfig,
  setupCodexConfig,
  removeKurspilotEntriesFromClaudeConfig,
  removeKurspilotEntriesFromCodexConfig,
} = require('../lib/mcp-config-setup');

const START_MCP_PATH = '/Users/lehrkraft/moodle-mcp/scripts/start-mcp.js';
const NODE_EXEC_PATH = '/usr/local/bin/node';
const SETUP_CLI = path.join(__dirname, '..', 'scripts', 'setup-mcp-config.js');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-config-setup-test-'));
}

// --- buildKurspilotEntries -------------------------------------------------

test('buildKurspilotEntries erzeugt Core und das Default-Buendel als eigene Wrapper-Eintraege', () => {
  const entries = buildKurspilotEntries(START_MCP_PATH, NODE_EXEC_PATH);

  assert.ok(entries['kurspilot-core']);
  assert.ok(entries['kurspilot-page']);
  assert.ok(entries['kurspilot-label']);
  assert.ok(entries['kurspilot-url']);
  assert.ok(entries['kurspilot-assign']);
  assert.ok(entries['kurspilot-quiz']);
  assert.ok(entries['kurspilot-fragensammlung']);

  assert.deepStrictEqual(entries['kurspilot-core'].args, [START_MCP_PATH, '--server', 'core']);
  assert.deepStrictEqual(entries['kurspilot-page'].args, [START_MCP_PATH, '--server', 'page']);
  assert.deepStrictEqual(entries['kurspilot-quiz'].args, [START_MCP_PATH, '--server', 'quiz']);
  assert.deepStrictEqual(
    entries['kurspilot-fragensammlung'].args,
    [START_MCP_PATH, '--server', 'fragensammlung']
  );
  assert.strictEqual(entries['kurspilot-core'].command, NODE_EXEC_PATH);
  assert.strictEqual(entries['kurspilot-page'].command, NODE_EXEC_PATH);
});

test('buildKurspilotEntries loest Aktivitaetsabhaengigkeiten auf und fuegt Core immer hinzu', () => {
  const entries = buildKurspilotEntries(START_MCP_PATH, NODE_EXEC_PATH, {
    selectedActivityIds: ['quiz'],
  });

  assert.deepStrictEqual(Object.keys(entries).sort(), [
    'kurspilot-core',
    'kurspilot-fragensammlung',
    'kurspilot-quiz',
  ]);
});

test('buildKurspilotEntries enthaelt nirgends Moodle-URL oder Token-Felder', () => {
  const entries = buildKurspilotEntries(START_MCP_PATH, NODE_EXEC_PATH);
  const serialized = JSON.stringify(entries);

  assert.ok(!/MOODLE_URL|MOODLE_TOKEN/.test(serialized));
  assert.ok(!/https?:\/\//.test(serialized));
});

// --- setupClaudeDesktopConfig (JSON, claude_desktop_config.json) -----------

test('setupClaudeDesktopConfig legt fehlende Config-Datei neu an', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'claude_desktop_config.json');

  const result = setupClaudeDesktopConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, true);
  assert.strictEqual(result.backupPath, null);
  assert.ok(fs.existsSync(configPath));

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(written.mcpServers['kurspilot-core']);
  assert.ok(written.mcpServers['kurspilot-page']);
  assert.ok(written.mcpServers['kurspilot-fragensammlung']);
});

test('setupClaudeDesktopConfig mergt in vorhandene Config und erhaelt fremde Eintraege, mit Backup', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'claude_desktop_config.json');
  const existing = {
    mcpServers: {
      'andere-app': { command: 'node', args: ['/pfad/andere-app.js'] },
    },
    someOtherTopLevelKey: 'bleibt-erhalten',
  };
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

  const result = setupClaudeDesktopConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, false);
  assert.ok(result.backupPath);
  assert.ok(fs.existsSync(result.backupPath));
  const backupContent = JSON.parse(fs.readFileSync(result.backupPath, 'utf8'));
  assert.deepStrictEqual(backupContent, existing);

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(written.mcpServers['andere-app'], 'fremder Eintrag muss erhalten bleiben');
  assert.strictEqual(written.someOtherTopLevelKey, 'bleibt-erhalten');
  assert.ok(written.mcpServers['kurspilot-core']);
  assert.ok(written.mcpServers['kurspilot-assign']);
});

test('setupClaudeDesktopConfig ersetzt bei erneutem Lauf nur Kurspilot-Eintraege und merged andere Auswahl mit Backup', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'claude_desktop_config.json');

  setupClaudeDesktopConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH, {
    selectedActivityIds: ['page', 'label'],
  });
  const secondResult = setupClaudeDesktopConfig(configPath, '/anderer/pfad/start-mcp.js', NODE_EXEC_PATH, {
    selectedActivityIds: ['quiz'],
  });

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(secondResult.backupPath);
  assert.deepStrictEqual(Object.keys(written.mcpServers).sort(), [
    'kurspilot-core',
    'kurspilot-fragensammlung',
    'kurspilot-quiz',
  ]);
  assert.deepStrictEqual(written.mcpServers['kurspilot-core'].args, [
    '/anderer/pfad/start-mcp.js',
    '--server',
    'core',
  ]);
  assert.deepStrictEqual(written.mcpServers['kurspilot-quiz'].args, [
    '/anderer/pfad/start-mcp.js',
    '--server',
    'quiz',
  ]);
});

test('setupClaudeDesktopConfig: generierter Inhalt enthaelt nie Moodle-URL oder Token', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'claude_desktop_config.json');

  setupClaudeDesktopConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  const content = fs.readFileSync(configPath, 'utf8');
  assert.ok(!/MOODLE_URL|MOODLE_TOKEN/.test(content));
  assert.ok(!/https?:\/\//.test(content));
});

// --- setupClaudeCodeConfig (JSON, ~/.claude.json) ---------------------------

test('setupClaudeCodeConfig mergt mcpServers in ~/.claude.json und erhaelt fremde Top-Level-Keys (z.B. projects)', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, '.claude.json');
  const existing = {
    mcpServers: {},
    projects: {
      '/irgendein/projekt': { allowedTools: [], hasTrustDialogAccepted: true },
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

  const result = setupClaudeCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, false);
  assert.ok(result.backupPath);
  assert.ok(fs.existsSync(result.backupPath));

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(written.mcpServers['kurspilot-core']);
  assert.ok(written.mcpServers['kurspilot-fragensammlung']);
  assert.deepStrictEqual(written.projects, existing.projects, 'fremde Top-Level-Keys muessen erhalten bleiben');
});

test('setupClaudeCodeConfig legt fehlende ~/.claude.json neu an', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, '.claude.json');

  const result = setupClaudeCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, true);
  assert.ok(fs.existsSync(configPath));
  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(written.mcpServers['kurspilot-core']);
});

// --- setupCodexConfig (TOML, ~/.codex/config.toml) --------------------------

test('setupCodexConfig legt fehlende Config-Datei neu an', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');

  const result = setupCodexConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, true);
  assert.strictEqual(result.backupPath, null);
  const content = fs.readFileSync(configPath, 'utf8');
  assert.match(content, /\[mcp_servers\.kurspilot-core\]/);
  assert.match(content, /\[mcp_servers\.kurspilot-page\]/);
  assert.match(content, /\[mcp_servers\.kurspilot-fragensammlung\]/);
  assert.match(content, /MOODLE_MCP_SERVER = "core"/);
  assert.match(content, /MOODLE_MCP_SERVER = "page"/);
});

test('setupCodexConfig mergt in vorhandene Config und erhaelt fremde Blocks, mit Backup', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');
  const existingToml = [
    '[mcp_servers.andere_app]',
    'command = "node"',
    'args = ["/pfad/andere-app.js"]',
    '',
  ].join('\n');
  fs.writeFileSync(configPath, existingToml);

  const result = setupCodexConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, false);
  assert.ok(result.backupPath);
  assert.ok(fs.existsSync(result.backupPath));
  assert.strictEqual(fs.readFileSync(result.backupPath, 'utf8'), existingToml);

  const written = fs.readFileSync(configPath, 'utf8');
  assert.match(written, /\[mcp_servers\.andere_app\]/, 'fremder Block muss erhalten bleiben');
  assert.match(written, /\[mcp_servers\.kurspilot-core\]/);
  assert.match(written, /\[mcp_servers\.kurspilot-quiz\]/);
});

test('setupCodexConfig ersetzt bei erneutem Lauf nur Kurspilot-Blocks und loest Abhaengigkeiten auf', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');

  setupCodexConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH, {
    selectedActivityIds: ['page'],
  });
  setupCodexConfig(configPath, '/anderer/pfad/start-mcp.js', NODE_EXEC_PATH, {
    selectedActivityIds: ['quiz'],
  });

  const written = fs.readFileSync(configPath, 'utf8');
  const occurrences = written.match(/\[mcp_servers\.kurspilot-core\]/g) || [];
  assert.strictEqual(occurrences.length, 1, 'Block darf nicht doppelt vorkommen');
  assert.match(written, /\[mcp_servers\.kurspilot-quiz\]/);
  assert.match(written, /\[mcp_servers\.kurspilot-fragensammlung\]/);
  assert.doesNotMatch(written, /\[mcp_servers\.kurspilot-page\]/);
  assert.match(written, /args = \["\/anderer\/pfad\/start-mcp\.js", "--server", "quiz"\]/);
});

test('setupCodexConfig: generierter Inhalt enthaelt nie Moodle-URL oder Token', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');

  setupCodexConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  const content = fs.readFileSync(configPath, 'utf8');
  assert.ok(!/MOODLE_URL|MOODLE_TOKEN\s*=\s*"/.test(content));
  assert.ok(!/https?:\/\//.test(content));
});

test('setupCodexConfig escaped Backslashes in Windows-Pfaden (gueltiges TOML)', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');
  const windowsNodePath = 'C:\\Users\\mg\\AppData\\Local\\Programs\\Kurspilot\\runtime\\node.exe';
  const windowsStartMcpPath = 'C:\\Users\\mg\\AppData\\Local\\Programs\\Kurspilot\\scripts\\start-mcp.js';

  setupCodexConfig(configPath, windowsStartMcpPath, windowsNodePath);

  const content = fs.readFileSync(configPath, 'utf8');
  assert.match(content, /command = "C:\\\\Users\\\\mg\\\\AppData\\\\Local\\\\Programs\\\\Kurspilot\\\\runtime\\\\node\.exe"/);
  assert.match(content, /args = \["C:\\\\Users\\\\mg\\\\AppData\\\\Local\\\\Programs\\\\Kurspilot\\\\scripts\\\\start-mcp\.js", "--server", "core"\]/);
  assert.ok(!/[^\\]\\[^\\"]/.test(content), 'kein einzelner, unescapter Backslash in der TOML-Ausgabe');
});

// --- removeKurspilotEntriesFromClaudeConfig ---------------------------------

test('removeKurspilotEntriesFromClaudeConfig entfernt nur Kurspilot-Eintraege, fremde Eintraege bleiben', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'claude_desktop_config.json');
  setupClaudeDesktopConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.mcpServers['andere-app'] = { command: 'node', args: ['/pfad/andere-app.js'] };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const result = removeKurspilotEntriesFromClaudeConfig(configPath);

  assert.strictEqual(result.removed, true);
  assert.ok(result.backupPath);
  assert.ok(fs.existsSync(result.backupPath));

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(!written.mcpServers['kurspilot-core']);
  assert.ok(!written.mcpServers['kurspilot-page']);
  assert.ok(!written.mcpServers['kurspilot-fragensammlung']);
  assert.ok(written.mcpServers['andere-app'], 'fremder Eintrag muss erhalten bleiben');
});

test('removeKurspilotEntriesFromClaudeConfig ist No-Op ohne vorhandene Datei', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'claude_desktop_config.json');

  const result = removeKurspilotEntriesFromClaudeConfig(configPath);

  assert.strictEqual(result.removed, false);
  assert.strictEqual(result.backupPath, null);
  assert.ok(!fs.existsSync(configPath));
});

// --- removeKurspilotEntriesFromCodexConfig ----------------------------------

test('removeKurspilotEntriesFromCodexConfig entfernt nur Kurspilot-Blocks, fremde Blocks bleiben', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');
  setupCodexConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  const existing = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(configPath, `${existing}\n[mcp_servers.andere_app]\ncommand = "node"\nargs = ["/pfad/andere-app.js"]\n`);

  const result = removeKurspilotEntriesFromCodexConfig(configPath);

  assert.strictEqual(result.removed, true);
  assert.ok(result.backupPath);

  const written = fs.readFileSync(configPath, 'utf8');
  assert.doesNotMatch(written, /\[mcp_servers\.kurspilot-core\]/);
  assert.doesNotMatch(written, /\[mcp_servers\.kurspilot-page\]/);
  assert.doesNotMatch(written, /\[mcp_servers\.kurspilot-fragensammlung\]/);
  assert.match(written, /\[mcp_servers\.andere_app\]/, 'fremder Block muss erhalten bleiben');
});

test('removeKurspilotEntriesFromCodexConfig ist No-Op ohne vorhandene Datei', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');

  const result = removeKurspilotEntriesFromCodexConfig(configPath);

  assert.strictEqual(result.removed, false);
  assert.strictEqual(result.backupPath, null);
  assert.ok(!fs.existsSync(configPath));
});

// --- CLI scripts/setup-mcp-config.js ----------------------------------------

test('CLI setup-mcp-config.js richtet beide Clients mit Aktivitaetsauswahl via Pfad-Override ein, ohne Token im Output', () => {
  const baseDir = makeTmpDir();
  const claudeConfigPath = path.join(baseDir, 'claude_desktop_config.json');
  const codexConfigPath = path.join(baseDir, 'config.toml');

  const output = execFileSync('node', [SETUP_CLI, '--activities', 'page,quiz'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_DESKTOP_CONFIG_PATH: claudeConfigPath,
      CODEX_CONFIG_PATH: codexConfigPath,
    },
  });

  assert.ok(fs.existsSync(claudeConfigPath));
  assert.ok(fs.existsSync(codexConfigPath));
  assert.ok(!/MOODLE_URL|MOODLE_TOKEN\s*[:=]\s*"?https?:/.test(output));
  assert.ok(!/https?:\/\//.test(output));

  const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
  assert.ok(claudeConfig.mcpServers['kurspilot-core']);
  assert.ok(claudeConfig.mcpServers['kurspilot-page']);
  assert.ok(claudeConfig.mcpServers['kurspilot-quiz']);
  assert.ok(claudeConfig.mcpServers['kurspilot-fragensammlung']);
  assert.ok(!claudeConfig.mcpServers['kurspilot-label']);

  const codexConfig = fs.readFileSync(codexConfigPath, 'utf8');
  assert.match(codexConfig, /\[mcp_servers\.kurspilot-quiz\]/);
  assert.match(output, /Aktive Aktivitaets-MCPs:/);
  assert.match(output, /Quiz.*Fragensammlung/i);
});

test('CLI setup-mcp-config.js --client claude richtet nur Claude Desktop ein', () => {
  const baseDir = makeTmpDir();
  const claudeConfigPath = path.join(baseDir, 'claude_desktop_config.json');
  const codexConfigPath = path.join(baseDir, 'config.toml');

  execFileSync('node', [SETUP_CLI, '--client', 'claude'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_DESKTOP_CONFIG_PATH: claudeConfigPath,
      CODEX_CONFIG_PATH: codexConfigPath,
    },
  });

  assert.ok(fs.existsSync(claudeConfigPath));
  assert.ok(!fs.existsSync(codexConfigPath));
});
