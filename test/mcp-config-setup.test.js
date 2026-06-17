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

test('buildKurspilotEntries erzeugt Planungs- und Umsetzungseintrag, die den Wrapper aufrufen', () => {
  const entries = buildKurspilotEntries(START_MCP_PATH, NODE_EXEC_PATH);

  assert.ok(entries['kurspilot-planung']);
  assert.ok(entries['kurspilot-umsetzung']);

  assert.deepStrictEqual(entries['kurspilot-planung'].args, [START_MCP_PATH, '--profile', 'readonly']);
  assert.deepStrictEqual(entries['kurspilot-umsetzung'].args, [START_MCP_PATH, '--profile', 'full']);
  assert.strictEqual(entries['kurspilot-planung'].command, NODE_EXEC_PATH);
  assert.strictEqual(entries['kurspilot-umsetzung'].command, NODE_EXEC_PATH);
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
  assert.ok(written.mcpServers['kurspilot-planung']);
  assert.ok(written.mcpServers['kurspilot-umsetzung']);
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
  assert.ok(written.mcpServers['kurspilot-planung']);
  assert.ok(written.mcpServers['kurspilot-umsetzung']);
});

test('setupClaudeDesktopConfig ist idempotent: erneuter Aufruf ersetzt nur die Kurspilot-Eintraege', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'claude_desktop_config.json');

  setupClaudeDesktopConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);
  const secondResult = setupClaudeDesktopConfig(configPath, '/anderer/pfad/start-mcp.js', NODE_EXEC_PATH);

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(secondResult.backupPath);
  assert.deepStrictEqual(
    written.mcpServers['kurspilot-planung'].args,
    ['/anderer/pfad/start-mcp.js', '--profile', 'readonly']
  );
});

test('setupClaudeDesktopConfig: generierter Inhalt enthaelt nie Moodle-URL oder Token', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'claude_desktop_config.json');

  setupClaudeDesktopConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  const content = fs.readFileSync(configPath, 'utf8');
  assert.ok(!/MOODLE_URL|MOODLE_TOKEN/.test(content));
  assert.ok(!/https?:\/\//.test(content));
});

// --- setupCodexConfig (TOML, ~/.codex/config.toml) --------------------------

test('setupCodexConfig legt fehlende Config-Datei neu an', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');

  const result = setupCodexConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, true);
  assert.strictEqual(result.backupPath, null);
  const content = fs.readFileSync(configPath, 'utf8');
  assert.match(content, /\[mcp_servers\.kurspilot-planung\]/);
  assert.match(content, /\[mcp_servers\.kurspilot-umsetzung\]/);
  assert.match(content, /MOODLE_MCP_PROFILE = "readonly"/);
  assert.match(content, /MOODLE_MCP_PROFILE = "full"/);
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
  assert.match(written, /\[mcp_servers\.kurspilot-planung\]/);
  assert.match(written, /\[mcp_servers\.kurspilot-umsetzung\]/);
});

test('setupCodexConfig ist idempotent: erneuter Aufruf ersetzt nur die Kurspilot-Blocks', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');

  setupCodexConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);
  setupCodexConfig(configPath, '/anderer/pfad/start-mcp.js', NODE_EXEC_PATH);

  const written = fs.readFileSync(configPath, 'utf8');
  const occurrences = written.match(/\[mcp_servers\.kurspilot-planung\]/g) || [];
  assert.strictEqual(occurrences.length, 1, 'Block darf nicht doppelt vorkommen');
  assert.match(written, /args = \["\/anderer\/pfad\/start-mcp\.js", "--profile", "readonly"\]/);
});

test('setupCodexConfig: generierter Inhalt enthaelt nie Moodle-URL oder Token', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'config.toml');

  setupCodexConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  const content = fs.readFileSync(configPath, 'utf8');
  assert.ok(!/MOODLE_URL|MOODLE_TOKEN\s*=\s*"/.test(content));
  assert.ok(!/https?:\/\//.test(content));
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
  assert.ok(!written.mcpServers['kurspilot-planung']);
  assert.ok(!written.mcpServers['kurspilot-umsetzung']);
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
  assert.doesNotMatch(written, /\[mcp_servers\.kurspilot-planung\]/);
  assert.doesNotMatch(written, /\[mcp_servers\.kurspilot-umsetzung\]/);
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

test('CLI setup-mcp-config.js richtet beide Clients via Pfad-Override ein, ohne Token im Output', () => {
  const baseDir = makeTmpDir();
  const claudeConfigPath = path.join(baseDir, 'claude_desktop_config.json');
  const codexConfigPath = path.join(baseDir, 'config.toml');

  const output = execFileSync('node', [SETUP_CLI], {
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
  assert.ok(claudeConfig.mcpServers['kurspilot-planung']);
  assert.ok(claudeConfig.mcpServers['kurspilot-umsetzung']);

  const codexConfig = fs.readFileSync(codexConfigPath, 'utf8');
  assert.match(codexConfig, /\[mcp_servers\.kurspilot-umsetzung\]/);
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
