#!/usr/bin/env node
/**
 * Installiert die Kurspilot-Skills nutzerweit fuer Codex und Claude/Cowork
 * (Issue #66, Parent #57). Kopiert die vier Kurspilot-Skill-Adapter und den
 * gemeinsamen Kern aus dem Repo in die nutzerweiten Skill-Verzeichnisse,
 * damit Kurspilot ohne geoeffnetes Projekt-Repository verfuegbar ist (siehe
 * CONTEXT.md, "Nutzerweite Kurspilot-Installation").
 *
 * Zielverzeichnisse (Standard):
 *   - Claude/Cowork: ~/.claude/skills/
 *   - Codex:         ~/.codex/skills/
 *     (Codex dokumentiert in diesem Repo keinen offiziellen nutzerweiten
 *     Skill-Pfad - ~/.codex/skills/ ist eine begruendete Annahme, gespiegelt
 *     an der Projektstruktur .agents/skills/. Siehe README.md.)
 *
 * Override fuer Tests/Sonderfaelle:
 *   --home <dir>            ueberschreibt os.homedir() fuer beide Anbieter
 *   KURSPILOT_INSTALL_HOME  env-Pendant zu --home
 *   --client claude|codex|both (Default: both)
 *
 * Aufrufe:
 *   node scripts/install-skills.js                 # beide Anbieter, echtes Home
 *   node scripts/install-skills.js --client claude
 *   node scripts/install-skills.js --home /tmp/testhome
 */

const os = require('node:os');
const path = require('node:path');
const { installKurspilotSkillsForProvider } = require('../lib/skill-install');

const REPO_ROOT = path.join(__dirname, '..');

function parseArgs(args) {
  const result = { client: 'both', home: null };

  const clientIndex = args.indexOf('--client');
  if (clientIndex !== -1) {
    const value = args[clientIndex + 1];
    if (!['claude', 'codex', 'both'].includes(value)) {
      process.stderr.write('Fehler: --client erwartet einen der Werte claude, codex, both.\n');
      process.exit(1);
    }
    result.client = value;
  }

  const homeIndex = args.indexOf('--home');
  if (homeIndex !== -1) {
    result.home = args[homeIndex + 1];
  }

  return result;
}

function resolveHome(cliHome) {
  return cliHome || process.env.KURSPILOT_INSTALL_HOME || os.homedir();
}

function reportResult(label, result) {
  if (result.written.length > 0) {
    process.stdout.write(
      `${label}: ${result.written.length} Datei(en) installiert/aktualisiert unter ${result.targetRoot}\n`
    );
  }
  if (result.unchanged.length > 0) {
    process.stdout.write(
      `${label}: ${result.unchanged.length} Datei(en) bereits aktuell (unveraendert)\n`
    );
  }
}

function main() {
  const { client, home } = parseArgs(process.argv.slice(2));
  const homeDir = resolveHome(home);

  if (client === 'claude' || client === 'both') {
    const targetRoot = path.join(homeDir, '.claude', 'skills');
    const result = installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);
    reportResult('Claude/Cowork', result);
  }

  if (client === 'codex' || client === 'both') {
    const targetRoot = path.join(homeDir, '.codex', 'skills');
    const result = installKurspilotSkillsForProvider(REPO_ROOT, '.agents/skills', targetRoot);
    reportResult('Codex', result);
  }

  process.stdout.write(
    'Kurspilot-Skills installiert. Fuer MCP-Server-Konfiguration siehe ' +
    'scripts/setup-mcp-config.js und scripts/moodle-credentials.js.\n'
  );
}

main();
