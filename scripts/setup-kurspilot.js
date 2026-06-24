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
 *       --workspace /pfad/zum/Arbeitsbereich \
 *       --confirm-default-workspace \
 *       --moodle-url https://moodle.example.org \
 *       --moodle-token <token>
 *
 *   interaktiv (Default): startet kurzzeitig einen lokalen Browser-Dienst auf
 *     127.0.0.1, waehlt den Port automatisch und zeigt Status sowie
 *     Wartungsbereich-Auswahl (siehe CONTEXT.md
 *     "Lokales Browser-Konfigurationstool").
 *     node scripts/setup-kurspilot.js
 *
 * Die lokale HTTP-/HTML-Schicht ist ohne echte Browserautomation testbar
 * (lib/setup-browser-server.js).
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSetupFlow, defaultDetectClients, OFFICIAL_INSTALL_LINKS } = require('../lib/setup-flow');
const { startSetupBrowserServer } = require('../lib/setup-browser-server');

function parseArgs(args) {
  const result = {
    nonInteractive: false,
    clients: null,
    workspace: null,
    confirmDefaultWorkspace: false,
    moodleUrl: null,
    moodleToken: null,
    afterInstall: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--non-interactive') {
      result.nonInteractive = true;
    } else if (arg === '--after-install') {
      result.afterInstall = true;
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
      : `Arbeitsbereich-Vorschlag: ${report.suggestedWorkspacePath} (noch nicht bestätigt)`,
    `Moodle-Zugangsdaten gespeichert: ${report.credentialsSaved ? 'ja' : 'nein'}`,
  ];
  return `${lines.join('\n')}\n`;
}

function runNonInteractive(args) {
  const selectedClients = args.clients ? args.clients.split(',').map(value => value.trim()).filter(Boolean) : [];

  const report = runSetupFlow({
    selectedClients,
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
    `buttons {"Erneut prüfen", "Abbrechen"} default button "Erneut prüfen" with icon caution`
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

function chooseWorkspaceFolder(defaultPath, options = {}) {
  const { osascriptFn = osascript } = options;
  const defaultLocation = fs.existsSync(defaultPath)
    ? defaultPath
    : path.dirname(defaultPath);

  try {
    const result = osascriptFn(
      `set defaultFolder to POSIX file ${toAppleScriptString(defaultLocation)}\n` +
      `try\n` +
      `  return POSIX path of (choose folder with prompt "Kurspilot-Arbeitsbereich wählen" default location defaultFolder)\n` +
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
      `buttons {"Überspringen", "Anderen Ordner wählen", "Standard verwenden"} ` +
      `default button "Standard verwenden")`
    );

    if (choice === 'Standard verwenden') {
      return {
        workspacePath: defaultPath,
        confirmed: true,
      };
    }

    if (choice === 'Anderen Ordner wählen') {
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
      `text returned of (display dialog "Moodle-URL eingeben (leer lassen zum Überspringen):" default answer "")`
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

async function runInteractive(options = {}) {
  const tool = await startSetupBrowserServer(options);
  process.stdout.write(`Kurspilot-Konfiguration läuft lokal: ${tool.url}\n`);

  const stop = () => {
    tool.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  await tool.closed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.nonInteractive) {
    runNonInteractive(args);
    return;
  }

  await runInteractive({
    startMode: args.afterInstall ? 'after-install' : 'default',
  });
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  chooseWorkspaceFolder,
  runInteractive,
  promptWorkspaceSelection,
  reportToText,
  parseArgs,
};
