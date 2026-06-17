#!/usr/bin/env node
/**
 * Richtet die nutzerweiten Codex- und Claude/Cowork-MCP-Konfigurationen fuer
 * das Kurspilot-Paket ein (Issue #65): legt je einen Planungs- ("readonly")
 * und Umsetzungs-Eintrag ("full") an, die ausschliesslich den tokenfreien
 * Wrapper scripts/start-mcp.js aufrufen (siehe scripts/start-mcp.js,
 * scripts/moodle-credentials.js, docs/adr/0006-...).
 *
 * Schreibt nur die in README.md dokumentierten Speicherorte:
 *   - Claude Desktop (macOS): ~/Library/Application Support/Claude/claude_desktop_config.json
 *   - Codex:                  ~/.codex/config.toml
 *
 * Vor dem Aendern einer vorhandenen Datei wird ein Backup mit
 * Zeitstempel-Suffix angelegt (siehe lib/mcp-config-setup.js).
 *
 * Aufrufe:
 *   node scripts/setup-mcp-config.js                 # beide Clients
 *   node scripts/setup-mcp-config.js --client claude
 *   node scripts/setup-mcp-config.js --client codex
 */

const os = require('node:os');
const path = require('node:path');
const {
  setupClaudeDesktopConfig,
  setupCodexConfig,
} = require('../lib/mcp-config-setup');

const START_MCP_PATH = path.join(__dirname, 'start-mcp.js');
const NODE_EXEC_PATH = process.execPath;

// CLAUDE_DESKTOP_CONFIG_PATH / CODEX_CONFIG_PATH erlauben das Ueberschreiben
// der Zielpfade, z.B. fuer Tests dieses CLI-Wrappers. Ohne Override werden
// die in README.md dokumentierten Standardpfade verwendet.
function getClaudeDesktopConfigPath() {
  if (process.env.CLAUDE_DESKTOP_CONFIG_PATH) {
    return process.env.CLAUDE_DESKTOP_CONFIG_PATH;
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'
    );
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

function getCodexConfigPath() {
  if (process.env.CODEX_CONFIG_PATH) {
    return process.env.CODEX_CONFIG_PATH;
  }
  return path.join(os.homedir(), '.codex', 'config.toml');
}

function parseClientFlag(args) {
  const flagIndex = args.indexOf('--client');
  if (flagIndex === -1) {
    return 'both';
  }
  const value = args[flagIndex + 1];
  if (!['claude', 'codex', 'both'].includes(value)) {
    process.stderr.write('Fehler: --client erwartet einen der Werte claude, codex, both.\n');
    process.exit(1);
  }
  return value;
}

function reportResult(label, result) {
  if (result.created) {
    process.stdout.write(`${label}: neue Konfiguration angelegt unter ${result.configPath}\n`);
  } else {
    process.stdout.write(
      `${label}: vorhandene Konfiguration unter ${result.configPath} gemergt ` +
      `(Backup: ${result.backupPath})\n`
    );
  }
}

function main() {
  const client = parseClientFlag(process.argv.slice(2));

  if (client === 'claude' || client === 'both') {
    const result = setupClaudeDesktopConfig(getClaudeDesktopConfigPath(), START_MCP_PATH, NODE_EXEC_PATH);
    reportResult('Claude Desktop', result);
  }

  if (client === 'codex' || client === 'both') {
    const result = setupCodexConfig(getCodexConfigPath(), START_MCP_PATH, NODE_EXEC_PATH);
    reportResult('Codex', result);
  }

  process.stdout.write(
    'Kurspilot-Eintraege "kurspilot-planung" (readonly) und "kurspilot-umsetzung" (full) ' +
    'verweisen auf scripts/start-mcp.js. Moodle-Zugangsdaten zuerst einrichten mit:\n' +
    '  node scripts/moodle-credentials.js set --url <url> --token <token>\n'
  );
}

main();
