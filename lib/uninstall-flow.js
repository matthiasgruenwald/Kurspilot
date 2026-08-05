'use strict';

/**
 * Nicht-interaktive Flow-Logik fuer die vollstaendige Kurspilot-Deinstallation
 * (Folgearbeit zu Issue #68: Lehrkraft/Entwickler muss den Rechner vor einem
 * erneuten Installations-Test sauber hinterlassen koennen, ohne jeden Schritt
 * manuell zu wiederholen). Spiegelt lib/setup-flow.js: Komposition der
 * vorhandenen Module (Moodle-Token-Speicher, lib/mcp-config-setup.js,
 * lib/skill-install.js) statt eigener Logik.
 *
 * Entfernt bewusst NICHT den Arbeitsbereich (~/Documents/Kurspilot) - das
 * sind Lehrkraft-Inhalte, kein Installationsartefakt (karpathy-guidelines:
 * keine Datenverluste durch Ueberreichweite).
 *
 * Sicherheitsregel: der Report enthaelt nie Moodle-URL/-Token, nur
 * Ja/Nein-Status (analog lib/setup-flow.js).
 */

const os = require('node:os');
const path = require('node:path');

const { removeCredentials } = require('../scripts/moodle-credentials');
const {
  removeKurspilotEntriesFromClaudeConfig,
  removeKurspilotEntriesFromClaudeCodeConfig,
  removeKurspilotEntriesFromCodexConfig,
  removeKurspilotEntriesFromOpenCodeConfig,
} = require('./mcp-config-setup');
const { removeKurspilotSkillsForProvider, cleanLegacyCodexSkills } = require('./skill-install');
const { getOpenCodeConfigPath } = require('./client-registry');

/**
 * Fuehrt den nicht-interaktiven Kurspilot-Deinstallations-Flow aus: entfernt
 * Moodle-Zugangsdaten aus der Keychain, die Kurspilot-MCP-Eintraege aus
 * Claude- und Codex-Config sowie die installierten Kurspilot-Skills fuer
 * beide Anbieter.
 *
 * @param {object} [options]
 * @param {string} [options.homeDir] Override fuer os.homedir() (Tests)
 * @param {Function} [options.removeCredentials] austauschbar (Tests/DI)
 * @param {Function} [options.removeKurspilotEntriesFromClaudeConfig] austauschbar (Tests/DI)
 * @param {Function} [options.removeKurspilotEntriesFromClaudeCodeConfig] austauschbar (Tests/DI)
 * @param {Function} [options.removeKurspilotEntriesFromCodexConfig] austauschbar (Tests/DI)
 * @param {Function} [options.removeKurspilotEntriesFromOpenCodeConfig] austauschbar (Tests/DI)
 * @param {Function} [options.removeSkillsForProvider] austauschbar (Tests/DI)
 * @param {Function} [options.cleanLegacyCodexSkills] austauschbar (Tests/DI)
 * @returns {object} Statusreport - enthaelt nie Moodle-URL/-Token
 */
function runUninstallFlow(options = {}) {
  const {
    homeDir = os.homedir(),
    removeCredentials: removeCredentialsFn = removeCredentials,
    removeKurspilotEntriesFromClaudeConfig: removeClaudeConfigFn = removeKurspilotEntriesFromClaudeConfig,
    removeKurspilotEntriesFromClaudeCodeConfig: removeClaudeCodeConfigFn = removeKurspilotEntriesFromClaudeCodeConfig,
    removeKurspilotEntriesFromCodexConfig: removeCodexConfigFn = removeKurspilotEntriesFromCodexConfig,
    removeKurspilotEntriesFromOpenCodeConfig: removeOpenCodeConfigFn = removeKurspilotEntriesFromOpenCodeConfig,
    removeSkillsForProvider: removeSkillsForProviderFn = removeKurspilotSkillsForProvider,
    cleanLegacyCodexSkills: cleanLegacyCodexSkillsFn = cleanLegacyCodexSkills,
  } = options;

  removeCredentialsFn();

  const configsCleaned = [];
  const claudeConfigResult = removeClaudeConfigFn(
    path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  );
  const claudeCodeConfigResult = removeClaudeCodeConfigFn(path.join(homeDir, '.claude.json'));
  if (claudeConfigResult.removed || claudeCodeConfigResult.removed) {
    configsCleaned.push('claude');
  }

  const codexConfigResult = removeCodexConfigFn(path.join(homeDir, '.codex', 'config.toml'));
  if (codexConfigResult.removed) {
    configsCleaned.push('codex');
  }

  const openCodeConfigResult = removeOpenCodeConfigFn(getOpenCodeConfigPath(homeDir));
  if (openCodeConfigResult.removed) {
    configsCleaned.push('opencode');
  }

  const skillsRemoved = [];
  const claudeSkillsResult = removeSkillsForProviderFn(path.join(homeDir, '.claude', 'skills'));
  if (claudeSkillsResult.removed.length > 0) {
    skillsRemoved.push('claude');
  }

  const codexSkillsResult = removeSkillsForProviderFn(path.join(homeDir, '.agents', 'skills'));
  if (codexSkillsResult.removed.length > 0) {
    skillsRemoved.push('codex');
  }

  const legacySkillCleanup = cleanLegacyCodexSkillsFn(path.join(homeDir, '.codex', 'skills'));

  return {
    credentialsRemoved: true,
    configsCleaned,
    skillsRemoved,
    legacySkillCleanup,
  };
}

module.exports = { runUninstallFlow };
