#!/usr/bin/env node
/**
 * Duenner Start-Wrapper fuer den Moodle MCP Server.
 *
 * Liest Moodle-URL und Token aus dem Moodle-Token-Speicher (siehe
 * scripts/moodle-credentials.js, docs/adr/0006-node-helper-fuer-moodle-token-speicher.md)
 * und startet moodle-mcp.js als Kindprozess. Die Zugangsdaten werden nur in
 * die Umgebung des Kindprozesses geschrieben - nie als Kommandozeilenargument,
 * nie in stdout/stderr, nie in eine Konfigurationsdatei.
 *
 * Codex- und Claude/Cowork-MCP-Konfigurationen rufen diesen Wrapper auf statt
 * moodle-mcp.js direkt mit Klartext-Token zu starten.
 *
 * Aufrufe:
 *   node scripts/start-mcp.js                  # volles Profil (Lesen + Schreiben)
 *   node scripts/start-mcp.js --profile readonly
 *   node scripts/start-mcp.js --profile full
 */

const path = require('node:path');
const { spawn } = require('node:child_process');
const { readCredentials } = require('./moodle-credentials');

const SERVER_PATHS = {
  all: path.join(__dirname, '..', 'moodle-mcp.js'),
  core: path.join(__dirname, '..', 'moodle-mcp-core.js'),
  page: path.join(__dirname, '..', 'moodle-mcp-page.js'),
  label: path.join(__dirname, '..', 'moodle-mcp-label.js'),
  url: path.join(__dirname, '..', 'moodle-mcp-url.js'),
  assign: path.join(__dirname, '..', 'moodle-mcp-assign.js'),
  quiz: path.join(__dirname, '..', 'moodle-mcp-quiz.js'),
  fragensammlung: path.join(__dirname, '..', 'moodle-mcp-question-bank.js'),
};
const VALID_PROFILES = ['readonly', 'read-only', 'full'];
const VALID_SERVERS = Object.keys(SERVER_PATHS);

function parseProfile(args) {
  const flagIndex = args.indexOf('--profile');
  if (flagIndex === -1) {
    return 'full';
  }
  const value = args[flagIndex + 1];
  if (!value || !VALID_PROFILES.includes(value)) {
    process.stderr.write(
      `Fehler: --profile erwartet einen der Werte ${VALID_PROFILES.join(', ')}.\n`
    );
    process.exit(1);
  }
  return value;
}

function parseServer(args) {
  const flagIndex = args.indexOf('--server');
  const value = flagIndex === -1
    ? (process.env.MOODLE_MCP_SERVER || 'all')
    : args[flagIndex + 1];

  if (!value || !VALID_SERVERS.includes(value)) {
    process.stderr.write(
      `Fehler: --server erwartet einen der Werte ${VALID_SERVERS.join(', ')}.\n`
    );
    process.exit(1);
  }

  return value;
}

function main() {
  const args = process.argv.slice(2);
  const profile = parseProfile(args);
  const server = parseServer(args);
  const serverPath = SERVER_PATHS[server];

  let credentials;
  try {
    credentials = readCredentials();
  } catch (error) {
    process.stderr.write(
      `Fehler beim Lesen der Moodle-Zugangsdaten aus dem sicheren Zugangsdaten-Speicher: ${error.message}\n`
    );
    process.exit(1);
    return;
  }

  if (!credentials) {
    process.stderr.write(
      'Keine Moodle-Zugangsdaten im sicheren Zugangsdaten-Speicher gefunden.\n' +
      'Zuerst einrichten mit:\n' +
      '  node scripts/moodle-credentials.js set --url <url> --token <token>\n'
    );
    process.exit(1);
    return;
  }

  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      MOODLE_URL: credentials.url,
      MOODLE_TOKEN: credentials.token,
      MOODLE_MCP_PROFILE: profile,
      MOODLE_MCP_SERVER: server,
    },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code === null ? 1 : code);
  });

  child.on('error', error => {
    process.stderr.write(`Fehler beim Starten des Moodle MCP Servers: ${error.message}\n`);
    process.exit(1);
  });
}

main();
