'use strict';

/**
 * Nicht-interaktive Flow-Logik fuer das Kurspilot-Konfigurationsprogramm
 * (Issue #67, Parent #5/#57). Erkennt lokale Codex- und Claude/Cowork-Clients,
 * blockiert ohne erkannten Client mit offiziellen Install-Links, und fuehrt
 * bei "weiter" Credential-, Config- und Skill-Setup aus - durch Komposition
 * der bereits vorhandenen Module aus #63 (Moodle-Token-Speicher), #65
 * (lib/mcp-config-setup.js) und #66 (lib/skill-install.js), ohne deren Logik
 * zu duplizieren.
 *
 * Diese Datei enthaelt bewusst keine UI: macOS-Dialog-Shell (osascript) und
 * CLI-Einstiegspunkt rufen `runSetupFlow` mit konkreten Werten auf (siehe
 * scripts/setup-kurspilot.js). Das macht die Flow-Logik ohne echte Dialoge
 * testbar (karpathy-guidelines, tdd).
 *
 * Sicherheitsregel (CONTEXT.md, "Moodle-Token-Speicher"): der Token wird nie
 * in den zurueckgegebenen Statusreport, ein Log oder eine Datei
 * geschrieben - nur ein Ja/Nein-Hinweis ("credentialsSaved").
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { setCredentials } = require('../scripts/moodle-credentials');
const { setupClaudeDesktopConfig, setupCodexConfig } = require('./mcp-config-setup');
const { installKurspilotSkillsForProvider } = require('./skill-install');

const REPO_ROOT = path.join(__dirname, '..');
const START_MCP_PATH = path.join(REPO_ROOT, 'scripts', 'start-mcp.js');

const OFFICIAL_INSTALL_LINKS = {
  codex: 'https://chatgpt.com/codex',
  claude: 'https://claude.ai/download',
};

const CLIENT_PROVIDER_ROOTS = {
  codex: '.agents/skills',
  claude: '.claude/skills',
};

/**
 * Standard-Client-Erkennung fuer macOS: Claude Desktop ueber die installierte
 * App, Codex ueber die CLI im PATH. Bewusst einfache Heuristik fuer den
 * ersten Slice (siehe CONTEXT.md "Desktop-Client-Einrichtung": eine erkannte
 * Desktop-App reicht, CLI-Erkennung ist ein hilfreicher Zusatzpfad).
 */
function defaultDetectClients() {
  return {
    codex: commandExistsOnPath('codex'),
    claude: fs.existsSync('/Applications/Claude.app') || commandExistsOnPath('claude'),
  };
}

function commandExistsOnPath(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore', shell: '/bin/zsh' });
    return true;
  } catch {
    return false;
  }
}

function defaultWorkspacePath(homeDir) {
  return path.join(homeDir, 'Documents', 'Kurspilot');
}

function ensureWorkspaceDirectory(workspacePath) {
  fs.mkdirSync(workspacePath, { recursive: true });
}

/**
 * Fuehrt den nicht-interaktiven Kurspilot-Setup-/Reparaturflow aus.
 *
 * @param {object} options
 * @param {string[]} [options.selectedClients] von der Lehrkraft gewaehlte Clients ('codex'/'claude')
 * @param {string} [options.workspacePath] Arbeitsbereich-Ort; Default ~/Documents/Kurspilot
 * @param {string} [options.homeDir] Override fuer os.homedir() (Tests)
 * @param {string} [options.moodleUrl] Moodle-URL fuer den Token-Speicher
 * @param {string} [options.moodleToken] Moodle-Token fuer den Token-Speicher
 * @param {Function} [options.detectClients] austauschbare Client-Erkennung (Tests/DI)
 * @param {Function} [options.setCredentials] austauschbarer Credential-Setter (Tests/DI)
 * @param {Function} [options.setupClaudeDesktopConfig] austauschbar (Tests/DI)
 * @param {Function} [options.setupCodexConfig] austauschbar (Tests/DI)
 * @param {Function} [options.installSkillsForProvider] austauschbar (Tests/DI)
 * @param {object} [options.installLinks] austauschbare Install-Links (Tests/DI)
 * @returns {object} Statusreport - enthaelt nie den Moodle-Token
 */
function runSetupFlow(options = {}) {
  const {
    selectedClients = [],
    workspacePath: requestedWorkspacePath,
    homeDir = os.homedir(),
    moodleUrl,
    moodleToken,
    detectClients = defaultDetectClients,
    setCredentials: setCredentialsFn = setCredentials,
    setupClaudeDesktopConfig: setupClaudeDesktopConfigFn = setupClaudeDesktopConfig,
    setupCodexConfig: setupCodexConfigFn = setupCodexConfig,
    installSkillsForProvider: installSkillsForProviderFn = installKurspilotSkillsForProvider,
    installLinks = OFFICIAL_INSTALL_LINKS,
  } = options;

  const detectedClients = detectClients();
  const anyClientDetected = detectedClients.codex || detectedClients.claude;

  if (!anyClientDetected) {
    return {
      blocked: true,
      proceeded: false,
      detectedClients,
      installLinks,
      configuredClients: [],
      workspacePath: null,
      credentialsSaved: false,
    };
  }

  const workspacePath = requestedWorkspacePath || defaultWorkspacePath(homeDir);
  ensureWorkspaceDirectory(workspacePath);

  let credentialsSaved = false;
  if (moodleUrl && moodleToken) {
    setCredentialsFn(moodleUrl, moodleToken);
    credentialsSaved = true;
  }

  const configuredClients = [];
  const nodeExecPath = process.execPath;

  for (const client of selectedClients) {
    if (!detectedClients[client]) {
      continue;
    }

    if (client === 'codex') {
      setupCodexConfigFn(path.join(homeDir, '.codex', 'config.toml'), START_MCP_PATH, nodeExecPath);
    } else if (client === 'claude') {
      setupClaudeDesktopConfigFn(
        path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
        START_MCP_PATH,
        nodeExecPath
      );
    } else {
      continue;
    }

    const targetRoot = path.join(homeDir, client === 'codex' ? '.codex' : '.claude', 'skills');
    installSkillsForProviderFn(REPO_ROOT, CLIENT_PROVIDER_ROOTS[client], targetRoot);

    configuredClients.push(client);
  }

  return {
    blocked: false,
    proceeded: true,
    detectedClients,
    installLinks,
    configuredClients,
    workspacePath,
    credentialsSaved,
  };
}

module.exports = {
  runSetupFlow,
  defaultDetectClients,
  defaultWorkspacePath,
  OFFICIAL_INSTALL_LINKS,
};
