#!/usr/bin/env node
/**
 * Installiert die Kurspilot-Skills nutzerweit fuer Codex und Claude
 * (Issue #66, Parent #57). Kopiert die vier Kurspilot-Skill-Adapter und den
 * gemeinsamen Kern aus dem Repo in die nutzerweiten Skill-Verzeichnisse,
 * damit Kurspilot ohne geoeffnetes Projekt-Repository verfuegbar ist (siehe
 * CONTEXT.md, "Nutzerweite Kurspilot-Installation").
 *
 * Zielverzeichnisse (Standard):
 *   - Claude: ~/.claude/skills/
 *   - Codex:  ~/.agents/skills/ (kanonischer Pfad seit Issue #162;
 *     Alt-Ort ~/.codex/skills/ wird nach erfolgreicher Installation aufgeräumt)
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
const {
  installKurspilotSkillsForProvider,
  installKurspilotSkillsAliasForClaude,
  cleanLegacyCodexSkills,
} = require('../lib/skill-install');

const REPO_ROOT = path.join(__dirname, '..');

function parseArgs(args) {
  const result = { client: 'both', home: null, alias: false };

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

  if (args.includes('--alias')) {
    result.alias = true;
  }

  return result;
}

function resolveHome(cliHome) {
  return cliHome || process.env.KURSPILOT_INSTALL_HOME || os.homedir();
}

function reportResult(label, result) {
  if (result.aborted) {
    for (const warning of result.warnings) {
      process.stderr.write(`${label}: ${warning}\n`);
    }
    return false;
  }

  if (result.written.length > 0) {
    process.stdout.write(
      `${label}: ${result.written.length} Datei(en) installiert/aktualisiert unter ${result.targetRoot}\n`
    );
  }
  if (result.unchanged.length > 0) {
    process.stdout.write(
      `${label}: ${result.unchanged.length} Datei(en) bereits aktuell (unverändert)\n`
    );
  }
  return true;
}

function main() {
  const { client, home, alias } = parseArgs(process.argv.slice(2));
  const homeDir = resolveHome(home);

  if (alias) {
    // Alias-Modus: Skills liegen einmal am kanonischen Ort (~/.agents/skills/),
    // das Claude-Verzeichnis bekommt Symlinks/Junctions dorthin (Issue #163).
    const canonicalRoot = path.join(homeDir, '.agents', 'skills');
    const canonicalResult = installKurspilotSkillsForProvider(REPO_ROOT, '.agents/skills', canonicalRoot);
    if (!reportResult('Kanonische Ablage (~/.agents/skills)', canonicalResult)) {
      process.exit(1);
    }

    const claudeRoot = path.join(homeDir, '.claude', 'skills');
    const aliasResult = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);
    if (!reportResult('Claude (Alias)', aliasResult)) {
      // aliasError: Hinweis auf Kopier-Modus als Ausweg wurde bereits via stderr ausgegeben
      process.exit(1);
    }

    // Alt-Ort aufräumen
    const legacyRoot = path.join(homeDir, '.codex', 'skills');
    const legacyResult = cleanLegacyCodexSkills(legacyRoot);
    if (legacyResult.removed.length > 0) {
      process.stdout.write(
        `Codex (Alt-Ort): ${legacyResult.removed.length} veraltete(n) Ordner aus ${legacyRoot} entfernt.\n`
      );
    }
    for (const warning of legacyResult.warnings) {
      process.stderr.write(`Codex (Alt-Ort): ${warning}\n`);
    }
  } else {
    // Kopier-Modus (Standard): je Anbieter eine eigene Kopie
    if (client === 'claude' || client === 'both') {
      const targetRoot = path.join(homeDir, '.claude', 'skills');
      const result = installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);
      if (!reportResult('Claude', result)) {
        process.exit(1);
      }
    }

    if (client === 'codex' || client === 'both') {
      const targetRoot = path.join(homeDir, '.agents', 'skills');
      const result = installKurspilotSkillsForProvider(REPO_ROOT, '.agents/skills', targetRoot);
      if (!reportResult('Codex', result)) {
        process.exit(1);
      }

      // Alt-Ort aufräumen: unveränderte Kurspilot-Ordner aus ~/.codex/skills/ entfernen
      const legacyRoot = path.join(homeDir, '.codex', 'skills');
      const legacyResult = cleanLegacyCodexSkills(legacyRoot);
      if (legacyResult.removed.length > 0) {
        process.stdout.write(
          `Codex (Alt-Ort): ${legacyResult.removed.length} veraltete(n) Ordner aus ${legacyRoot} entfernt.\n`
        );
      }
      for (const warning of legacyResult.warnings) {
        process.stderr.write(`Codex (Alt-Ort): ${warning}\n`);
      }
    }
  }

  process.stdout.write(
    'Kurspilot-Skills installiert. Für MCP-Server-Konfiguration siehe ' +
    'scripts/setup-mcp-config.js und scripts/moodle-credentials.js.\n'
  );
}

main();
