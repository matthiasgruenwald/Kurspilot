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

const SERVER_PATH = path.join(__dirname, '..', 'moodle-mcp.js');
const VALID_PROFILES = ['readonly', 'read-only', 'full'];

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

function main() {
  const profile = parseProfile(process.argv.slice(2));

  let credentials;
  try {
    credentials = readCredentials();
  } catch (error) {
    process.stderr.write(
      `Fehler beim Lesen der Moodle-Zugangsdaten aus dem Schluesselbund: ${error.message}\n`
    );
    process.exit(1);
    return;
  }

  if (!credentials) {
    process.stderr.write(
      'Keine Moodle-Zugangsdaten im Schluesselbund gefunden.\n' +
      'Zuerst einrichten mit:\n' +
      '  node scripts/moodle-credentials.js set --url <url> --token <token>\n'
    );
    process.exit(1);
    return;
  }

  const child = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      MOODLE_URL: credentials.url,
      MOODLE_TOKEN: credentials.token,
      MOODLE_MCP_PROFILE: profile,
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
