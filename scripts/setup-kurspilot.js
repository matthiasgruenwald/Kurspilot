#!/usr/bin/env node
/**
 * Kurspilot-Konfigurationsprogramm (Issue #67, Parent #5/#57): startbar nach
 * der Installation und spaeter jederzeit erneut aufrufbar. Duenne Schicht
 * ueber lib/setup-flow.js - die eigentliche Logik (Client-Erkennung,
 * Blocker, Credential-/Config-/Skill-Setup) liegt dort und ist
 * nicht-interaktiv testbar.
 *
 * Zwei Aufrufarten:
 *
 *   --non-interactive: alle Werte als Flags, kein Dialog (fuer Automatisierung/Tests)
 *     node scripts/setup-kurspilot.js --non-interactive \
 *       --clients codex,claude \
 *       --activities Seite,Test \
 *       --workspace /pfad/zum/Arbeitsbereich \
 *       --confirm-default-workspace \
 *       --moodle-url https://moodle.example.org \
 *       --moodle-token <token>
 *
 *   interaktiv (Default, nur macOS): fuehrt mit Bordmitteln (osascript:
 *     display dialog / choose from list / choose folder) durch den Flow.
 *     Bewusst klein gehalten - kein Electron/Tauri/SwiftUI
 *     (siehe CONTEXT.md "macOS-nahes Konfigurationsprogramm").
 *     node scripts/setup-kurspilot.js
 *
 * Die interaktive osascript-Schicht selbst ist UI-Interaktion und nicht
 * automatisiert getestet; die Flow-Logik darunter (lib/setup-flow.js) ist es.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSetupFlow, defaultDetectClients, OFFICIAL_INSTALL_LINKS } = require('../lib/setup-flow');
const { getDefaultBundle, listActivities, resolveActivitySelection } = require('../lib/activity-registry');

function parseArgs(args) {
  const result = {
    nonInteractive: false,
    clients: null,
    workspace: null,
    confirmDefaultWorkspace: false,
    moodleUrl: null,
    moodleToken: null,
    activities: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--non-interactive') {
      result.nonInteractive = true;
    } else if (arg === '--clients') {
      result.clients = args[i + 1];
      i += 1;
    } else if (arg === '--workspace') {
      result.workspace = args[i + 1];
      i += 1;
    } else if (arg === '--confirm-default-workspace') {
      result.confirmDefaultWorkspace = true;
    } else if (arg === '--moodle-url') {
      result.moodleUrl = args[i + 1];
      i += 1;
    } else if (arg === '--moodle-token') {
      result.moodleToken = args[i + 1];
      i += 1;
    } else if (arg === '--activities') {
      result.activities = args[i + 1]
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      i += 1;
    }
  }

  return result;
}

function reportToText(report) {
  if (report.blocked) {
    const links = Object.entries(report.installLinks)
      .map(([client, url]) => `  - ${client}: ${url}`)
      .join('\n');
    return (
      'Weder Codex noch Claude/Cowork wurde lokal erkannt. Kurspilot kann erst eingerichtet werden, ' +
      'wenn einer dieser Clients installiert ist:\n' +
      `${links}\n` +
      'Bitte installieren und das Setup danach erneut starten (Re-Check).\n'
    );
  }

  const lines = [
    `Erkannte Clients: ${Object.entries(report.detectedClients).filter(([, ok]) => ok).map(([name]) => name).join(', ') || 'keine'}`,
    `Eingerichtete Clients: ${report.configuredClients.join(', ') || 'keine'}`,
    report.workspacePath
      ? `Arbeitsbereich-Ort: ${report.workspacePath}`
      : `Arbeitsbereich-Vorschlag: ${report.suggestedWorkspacePath} (noch nicht bestaetigt)`,
    `Moodle-Zugangsdaten gespeichert: ${report.credentialsSaved ? 'ja' : 'nein'}`,
  ];
  return `${lines.join('\n')}\n`;
}

function runNonInteractive(args) {
  const selectedClients = args.clients ? args.clients.split(',').map(value => value.trim()).filter(Boolean) : [];
  const selectedActivityIds = args.activities ? resolveActivitySelection(args.activities) : undefined;

  const report = runSetupFlow({
    selectedClients,
    selectedActivityIds,
    workspacePath: args.workspace || undefined,
    workspaceSelectionConfirmed: Boolean(args.workspace) || args.confirmDefaultWorkspace,
    moodleUrl: args.moodleUrl || undefined,
    moodleToken: args.moodleToken || undefined,
  });

  process.stdout.write(reportToText(report));
  process.exitCode = report.blocked ? 1 : 0;
}

// --- Interaktive macOS-Dialog-Shell (osascript) -----------------------------

function osascript(script) {
  return execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim();
}

function toAppleScriptString(value) {
  return JSON.stringify(String(value));
}

function showInstallBlockerDialog(installLinks) {
  const links = Object.entries(installLinks).map(([client, url]) => `${client}: ${url}`).join('\\n');
  osascript(
    `display dialog "Weder Codex noch Claude/Cowork wurde gefunden. Bitte zuerst installieren:\\n${links}" ` +
    `buttons {"Erneut pruefen", "Abbrechen"} default button "Erneut pruefen" with icon caution`
  );
}

function chooseClients(detectedClients) {
  const available = Object.entries(detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => client);

  if (available.length === 0) {
    return [];
  }

  const listItems = available.map(client => `"${client}"`).join(', ');
  const result = osascript(
    `choose from list {${listItems}} with title "Kurspilot einrichten" ` +
    `with prompt "Welche erkannten Clients sollen eingerichtet werden?" ` +
    `default items {${listItems}} with multiple selections allowed`
  );

  if (result === 'false') {
    return [];
  }
  return result.split(', ').map(value => value.replace(/^"|"$/g, ''));
}

function promptActivitySelection(options = {}) {
  const { osascriptFn = osascript } = options;
  const activities = listActivities();
  const labelByDisplayName = new Map(activities.map(activity => [activity.label, activity.id]));
  const listItems = activities.map(activity => `"${activity.label}"`).join(', ');
  const defaultItems = activities
    .filter(activity => activity.default)
    .map(activity => `"${activity.label}"`)
    .join(', ');

  try {
    const result = osascriptFn(
      `choose from list {${listItems}} with title "Kurspilot-Aktivitaeten" ` +
      `with prompt "Welche Aktivitaeten soll Kurspilot in Codex/Claude bereitstellen? Core ist immer aktiv." ` +
      `default items {${defaultItems}} with multiple selections allowed`
    );

    if (result === 'false') {
      return getDefaultBundle();
    }

    const selectedLabels = result.split(', ').map(value => value.replace(/^"|"$/g, ''));
    return resolveActivitySelection(selectedLabels.map(label => labelByDisplayName.get(label) || label));
  } catch {
    return getDefaultBundle();
  }
}

function chooseWorkspaceFolder(defaultPath, options = {}) {
  const { osascriptFn = osascript } = options;
  const defaultLocation = fs.existsSync(defaultPath)
    ? defaultPath
    : path.dirname(defaultPath);

  try {
    const result = osascriptFn(
      `set defaultFolder to POSIX file ${toAppleScriptString(defaultLocation)}\n` +
      `try\n` +
      `  return POSIX path of (choose folder with prompt "Kurspilot-Arbeitsbereich waehlen" default location defaultFolder)\n` +
      `on error\n` +
      `  return ""\n` +
      `end try`
    );
    const selectedPath = result.trim();
    return {
      workspacePath: selectedPath || null,
      confirmed: Boolean(selectedPath),
    };
  } catch {
    return {
      workspacePath: null,
      confirmed: false,
    };
  }
}

function promptWorkspaceSelection(defaultPath, options = {}) {
  const {
    osascriptFn = osascript,
    chooseWorkspaceFolderFn = chooseWorkspaceFolder,
  } = options;

  try {
    const choice = osascriptFn(
      `button returned of (display dialog "Kurspilot-Arbeitsbereich festlegen:\\n${defaultPath}" ` +
      `buttons {"Ueberspringen", "Anderen Ordner waehlen", "Standard verwenden"} ` +
      `default button "Standard verwenden")`
    );

    if (choice === 'Standard verwenden') {
      return {
        workspacePath: defaultPath,
        confirmed: true,
      };
    }

    if (choice === 'Anderen Ordner waehlen') {
      return chooseWorkspaceFolderFn(defaultPath);
    }
  } catch {
    return {
      workspacePath: null,
      confirmed: false,
    };
  }

  return {
    workspacePath: null,
    confirmed: false,
  };
}

function promptMoodleCredentials() {
  let url = null;
  let token = null;
  try {
    url = osascript(
      `text returned of (display dialog "Moodle-URL eingeben (leer lassen zum Ueberspringen):" default answer "")`
    );
  } catch {
    return { url: null, token: null };
  }
  if (!url) {
    return { url: null, token: null };
  }
  try {
    token = osascript(
      `text returned of (display dialog "Moodle-Token eingeben:" default answer "" with hidden answer)`
    );
  } catch {
    return { url, token: null };
  }
  return { url, token: token || null };
}

function runInteractive() {
  const detectedClients = defaultDetectClients();
  const anyDetected = detectedClients.codex || detectedClients.claude;

  if (!anyDetected) {
    showInstallBlockerDialog(OFFICIAL_INSTALL_LINKS);
    process.stdout.write(reportToText({ blocked: true, installLinks: OFFICIAL_INSTALL_LINKS }));
    process.exitCode = 1;
    return;
  }

  const selectedClients = chooseClients(detectedClients);
  const selectedActivityIds = promptActivitySelection();
  const defaultWorkspace = path.join(os.homedir(), 'Documents', 'Kurspilot');
  const workspaceSelection = promptWorkspaceSelection(defaultWorkspace);
  const { url, token } = promptMoodleCredentials();

  const report = runSetupFlow({
    selectedClients,
    selectedActivityIds,
    workspacePath: workspaceSelection.workspacePath || undefined,
    workspaceSelectionConfirmed: workspaceSelection.confirmed,
    moodleUrl: url || undefined,
    moodleToken: token || undefined,
  });

  process.stdout.write(reportToText(report));
  osascript(`display dialog "Kurspilot-Setup abgeschlossen.\\n${reportToText(report).replace(/\n/g, '\\n')}" buttons {"OK"} default button "OK"`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.nonInteractive) {
    runNonInteractive(args);
    return;
  }

  if (process.platform !== 'darwin') {
    process.stderr.write(
      'Die interaktive Einrichtung nutzt osascript und ist nur auf macOS verfuegbar. ' +
      'Auf anderen Plattformen --non-interactive mit Flags verwenden.\n'
    );
    process.exitCode = 1;
    return;
  }

  runInteractive();
}

if (require.main === module) {
  main();
}

module.exports = {
  chooseWorkspaceFolder,
  promptWorkspaceSelection,
  promptActivitySelection,
  reportToText,
  parseArgs,
};
