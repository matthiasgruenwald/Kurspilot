#!/usr/bin/env node
/**
 * Richtet die nutzerweiten Codex- und Claude-MCP-Konfigurationen fuer
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
const readline = require('node:readline');
const { getDefaultBundle, listActivities, resolveDependencies } = require('../lib/activity-registry');
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

function parseActivitiesFlag(args) {
  const flagIndex = args.indexOf('--activities');
  if (flagIndex === -1) {
    return null;
  }

  const value = args[flagIndex + 1];
  if (value === undefined) {
    process.stderr.write('Fehler: --activities erwartet eine komma-getrennte Liste von Aktivitaets-IDs.\n');
    process.exit(1);
  }

  if (value.trim() === '') {
    return [];
  }

  return value
    .split(',')
    .map((activityId) => activityId.trim())
    .filter(Boolean);
}

function formatChecklist(selectedActivityIds) {
  const selected = new Set(selectedActivityIds);
  return listActivities().map((activity) => {
    const defaultMarker = activity.default ? 'default an' : 'default aus';
    const dependencyText = activity.dependsOn.length > 0
      ? `, braucht: ${activity.dependsOn.join(', ')}`
      : '';
    return `  [${selected.has(activity.id) ? 'x' : ' '}] ${activity.id} - ${activity.label} (${defaultMarker}${dependencyText})`;
  }).join('\n');
}

function formatSelectionSummary(selectedActivityIds) {
  const selected = new Set(selectedActivityIds);
  const labelById = new Map(listActivities().map((activity) => [activity.id, activity.label]));
  const selectedLabels = selectedActivityIds.map((activityId) => labelById.get(activityId) || activityId);
  const notices = [];
  if (selected.has('quiz') && selected.has('fragensammlung')) {
    notices.push('Quiz zieht automatisch Fragensammlung mit');
  }
  const suffix = notices.length > 0 ? ` (${notices.join('; ')})` : '';
  return `${selectedLabels.join(', ')}${suffix}`;
}

function resolveSelectedActivities(requestedActivityIds) {
  if (requestedActivityIds === null) {
    return getDefaultBundle();
  }
  return resolveDependencies(requestedActivityIds);
}

async function promptForActivities() {
  const defaultSelection = getDefaultBundle();
  process.stdout.write('Verfuegbare Aktivitaets-MCPs:\n');
  process.stdout.write(`${formatChecklist(defaultSelection)}\n`);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return defaultSelection;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question(
      'Aktivitaets-MCPs auswaehlen (Komma-Liste von IDs, Enter = Defaults): ',
      resolve
    );
  });
  rl.close();

  if (!answer.trim()) {
    return defaultSelection;
  }

  return resolveDependencies(
    answer
      .split(',')
      .map((activityId) => activityId.trim())
      .filter(Boolean)
  );
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

async function main() {
  const args = process.argv.slice(2);
  const client = parseClientFlag(args);
  const requestedActivityIds = parseActivitiesFlag(args);
  const checklistNeedsPrompt = requestedActivityIds === null;
  const selectedActivityIds = requestedActivityIds === null
    ? await promptForActivities()
    : resolveSelectedActivities(requestedActivityIds);

  if (!checklistNeedsPrompt) {
    process.stdout.write('Verfuegbare Aktivitaets-MCPs:\n');
    process.stdout.write(`${formatChecklist(selectedActivityIds)}\n`);
  }
  process.stdout.write(`Aktive Aktivitaets-MCPs: ${formatSelectionSummary(selectedActivityIds)}\n`);

  if (client === 'claude' || client === 'both') {
    const result = setupClaudeDesktopConfig(getClaudeDesktopConfigPath(), START_MCP_PATH, NODE_EXEC_PATH, {
      selectedActivityIds,
    });
    reportResult('Claude Desktop', result);
  }

  if (client === 'codex' || client === 'both') {
    const result = setupCodexConfig(getCodexConfigPath(), START_MCP_PATH, NODE_EXEC_PATH, {
      selectedActivityIds,
    });
    reportResult('Codex', result);
  }

  process.stdout.write(
    'Kurspilot-Core und die gewaehlten Aktivitaets-MCPs verweisen auf scripts/start-mcp.js. ' +
    'Moodle-Zugangsdaten zuerst einrichten mit:\n' +
    '  node scripts/moodle-credentials.js set --url <url> --token <token>\n'
  );
}

main().catch((error) => {
  process.stderr.write(`Fehler: ${error.message}\n`);
  process.exit(1);
});
