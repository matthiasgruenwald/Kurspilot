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
  setupOpenCodeConfig,
  removeKurspilotEntriesFromClaudeConfig,
  removeKurspilotEntriesFromCodexConfig,
  removeKurspilotEntriesFromOpenCodeConfig,
  readConfiguredActivityIds,
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

// --- setupOpenCodeConfig (JSON, globale opencode.json, Issue #180) -----------

test('setupOpenCodeConfig legt fehlende opencode.json neu an', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'opencode', 'opencode.json');

  const result = setupOpenCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, true);
  assert.strictEqual(result.backupPath, null);
  assert.ok(fs.existsSync(configPath));

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.deepStrictEqual(written.mcp['kurspilot-core'], {
    type: 'local',
    command: [NODE_EXEC_PATH, START_MCP_PATH, '--server', 'core'],
    enabled: true,
  });
  assert.ok(written.mcp['kurspilot-fragensammlung']);
});

test('setupOpenCodeConfig mergt in vorhandene Config und erhaelt fremde Top-Level-Keys sowie fremde mcp-/Provider-Eintraege', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'opencode.json');
  const existing = {
    $schema: 'https://opencode.ai/config.json',
    model: 'anthropic/claude-sonnet-4-5',
    mcp: {
      'anderer-server': { type: 'local', command: ['npx', '-y', 'anderer-server'], enabled: true },
    },
    provider: {
      anthropic: { options: { apiKey: '{env:ANTHROPIC_API_KEY}' } },
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

  const result = setupOpenCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  assert.strictEqual(result.created, false);
  assert.ok(result.backupPath);
  assert.ok(fs.existsSync(result.backupPath));
  const backupContent = JSON.parse(fs.readFileSync(result.backupPath, 'utf8'));
  assert.deepStrictEqual(backupContent, existing);

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.strictEqual(written.$schema, 'https://opencode.ai/config.json');
  assert.strictEqual(written.model, 'anthropic/claude-sonnet-4-5');
  assert.ok(written.mcp['anderer-server'], 'fremder mcp-Eintrag muss erhalten bleiben');
  assert.deepStrictEqual(written.provider, existing.provider, 'Provider-Eintraege muessen erhalten bleiben');
  assert.ok(written.mcp['kurspilot-core']);
  assert.ok(written.mcp['kurspilot-quiz']);
});

test('setupOpenCodeConfig unterliegt der Aktivitaetsauswahl (core, fragensammlung, quiz)', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'opencode.json');

  setupOpenCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH, {
    selectedActivityIds: ['quiz'],
  });

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.deepStrictEqual(Object.keys(written.mcp).sort(), [
    'kurspilot-core',
    'kurspilot-fragensammlung',
    'kurspilot-quiz',
  ]);
});

test('setupOpenCodeConfig ist idempotent: zweiter Lauf mit gleichen Parametern veraendert die Datei nicht', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'opencode.json');
  const existing = {
    model: 'anthropic/claude-sonnet-4-5',
    mcp: { 'anderer-server': { type: 'local', command: ['npx', '-y', 'anderer-server'] } },
  };
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

  setupOpenCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);
  const afterFirstRun = fs.readFileSync(configPath, 'utf8');

  setupOpenCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);
  const afterSecondRun = fs.readFileSync(configPath, 'utf8');

  assert.strictEqual(afterSecondRun, afterFirstRun);
});

test('setupOpenCodeConfig laesst vorhandene provider/apiKey-Eintraege unveraendert und gibt sie nicht im Report aus', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'opencode.json');
  const secret = 'sk-ant-geheim-0815';
  const existing = {
    provider: {
      anthropic: { options: { apiKey: secret } },
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));

  const result = setupOpenCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.deepStrictEqual(written.provider, existing.provider, 'provider/apiKey darf nicht veraendert werden');
  assert.strictEqual(written.provider.anthropic.options.apiKey, secret);
  assert.ok(!JSON.stringify(result).includes(secret), 'Report darf das Secret nicht enthalten');
});

test('setupOpenCodeConfig: generierter Inhalt enthaelt nie Moodle-URL oder Token', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'opencode.json');

  setupOpenCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  const content = fs.readFileSync(configPath, 'utf8');
  assert.ok(!/MOODLE_URL|MOODLE_TOKEN/.test(content));
  assert.ok(!/https?:\/\//.test(content));
});

// --- removeKurspilotEntriesFromOpenCodeConfig --------------------------------

test('removeKurspilotEntriesFromOpenCodeConfig entfernt nur Kurspilot-Eintraege, fremde mcp-/Provider-Eintraege bleiben', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'opencode.json');
  setupOpenCodeConfig(configPath, START_MCP_PATH, NODE_EXEC_PATH);

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.mcp['anderer-server'] = { type: 'local', command: ['npx', '-y', 'anderer-server'] };
  config.provider = { anthropic: { options: { apiKey: '{env:ANTHROPIC_API_KEY}' } } };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const result = removeKurspilotEntriesFromOpenCodeConfig(configPath);

  assert.strictEqual(result.removed, true);
  assert.ok(result.backupPath);
  assert.ok(fs.existsSync(result.backupPath));

  const written = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(!written.mcp['kurspilot-core']);
  assert.ok(!written.mcp['kurspilot-quiz']);
  assert.ok(!written.mcp['kurspilot-fragensammlung']);
  assert.ok(written.mcp['anderer-server'], 'fremder mcp-Eintrag muss erhalten bleiben');
  assert.deepStrictEqual(written.provider, config.provider, 'Provider-Eintraege muessen erhalten bleiben');
});

test('removeKurspilotEntriesFromOpenCodeConfig ist No-Op ohne vorhandene Datei', () => {
  const baseDir = makeTmpDir();
  const configPath = path.join(baseDir, 'opencode.json');

  const result = removeKurspilotEntriesFromOpenCodeConfig(configPath);

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

// --- Konfigurierte Aktivitaets-Auswahl zuruecklesen (Issue #96-Folgefehler) -

test('readConfiguredActivityIds liest Aktivitaets-IDs aus vorhandener Codex-config.toml zurueck', () => {
  const baseDir = makeTmpDir();
  const codexConfigPath = path.join(baseDir, 'config.toml');
  setupCodexConfig(codexConfigPath, START_MCP_PATH, NODE_EXEC_PATH, { selectedActivityIds: ['page', 'quiz'] });

  const result = readConfiguredActivityIds({ codexConfigPath, claudeDesktopConfigPath: path.join(baseDir, 'missing.json') });

  assert.deepStrictEqual(result && result.sort(), ['fragensammlung', 'page', 'quiz'].sort());
});

test('readConfiguredActivityIds liest Aktivitaets-IDs aus vorhandener Claude-Desktop-Config zurueck, wenn Codex fehlt', () => {
  const baseDir = makeTmpDir();
  const claudeConfigPath = path.join(baseDir, 'claude_desktop_config.json');
  setupClaudeDesktopConfig(claudeConfigPath, START_MCP_PATH, NODE_EXEC_PATH, { selectedActivityIds: ['label'] });

  const result = readConfiguredActivityIds({
    codexConfigPath: path.join(baseDir, 'missing.toml'),
    claudeDesktopConfigPath: claudeConfigPath,
  });

  assert.deepStrictEqual(result, ['label']);
});

test('readConfiguredActivityIds gibt null zurueck, wenn weder Codex noch Claude bereits eingerichtet sind', () => {
  const baseDir = makeTmpDir();

  const result = readConfiguredActivityIds({
    codexConfigPath: path.join(baseDir, 'missing.toml'),
    claudeDesktopConfigPath: path.join(baseDir, 'missing.json'),
  });

  assert.strictEqual(result, null);
});

test('readConfiguredActivityIds gibt leeres Array zurueck, wenn nur Core ausgewaehlt war (alle Aktivitaeten abgewaehlt)', () => {
  const baseDir = makeTmpDir();
  const codexConfigPath = path.join(baseDir, 'config.toml');
  setupCodexConfig(codexConfigPath, START_MCP_PATH, NODE_EXEC_PATH, { selectedActivityIds: [] });

  const result = readConfiguredActivityIds({ codexConfigPath, claudeDesktopConfigPath: path.join(baseDir, 'missing.json') });

  assert.deepStrictEqual(result, []);
});
