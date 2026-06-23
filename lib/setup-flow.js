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

const { readCredentials, setCredentials } = require('../scripts/moodle-credentials');
const {
  readKurspilotWorkspaceSetting,
  writeKurspilotWorkspaceSetting,
} = require('./kurspilot-workspace-config');
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

const MAINTENANCE_AREAS = [
  {
    id: 'kurspilot-setup-or-repair',
    label: 'Kurspilot einrichten/reparieren',
  },
  {
    id: 'moodle-token-renewal',
    label: 'Moodle-Token erneuern',
  },
  {
    id: 'moodle-url-change',
    label: 'Moodle-URL aendern',
  },
  {
    id: 'workspace-change',
    label: 'Arbeitsbereich aendern',
  },
  {
    id: 'no-change',
    label: 'Nichts aendern',
  },
];

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

function defaultGetClientSetupStatus(detectedClients, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const codexConfigPath = path.join(homeDir, '.codex', 'config.toml');
  const claudeConfigPath = path.join(
    homeDir,
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json'
  );

  return {
    codex: {
      needsRepair: Boolean(detectedClients.codex) && !fileContainsText(codexConfigPath, 'kurspilot-core'),
    },
    claude: {
      needsRepair: Boolean(detectedClients.claude) && !fileContainsText(claudeConfigPath, 'kurspilot-core'),
    },
  };
}

function fileContainsText(filePath, text) {
  try {
    return fs.readFileSync(filePath, 'utf8').includes(text);
  } catch {
    return false;
  }
}

function buildSetupStatus(options = {}) {
  const {
    homeDir = os.homedir(),
    detectClients = defaultDetectClients,
    readCredentials: readCredentialsFn = readCredentials,
    readWorkspaceSetting: readWorkspaceSettingFn = readKurspilotWorkspaceSetting,
    getClientSetupStatus = defaultGetClientSetupStatus,
  } = options;

  const detectedClients = detectClients();
  const workspaceSetting = readWorkspaceSettingFn({ homeDir });
  const credentials = readCredentialsFn();
  const clientSetupStatus = getClientSetupStatus(detectedClients, { homeDir });

  return {
    detectedClients,
    workspace: {
      configured: Boolean(workspaceSetting && workspaceSetting.ok),
      path: workspaceSetting && workspaceSetting.ok ? workspaceSetting.contextRoot : null,
      status: workspaceSetting ? workspaceSetting.status : 'missing',
    },
    moodle: {
      url: credentials && credentials.url ? credentials.url : null,
      tokenPresent: Boolean(credentials && credentials.token),
    },
    kurspilotRepairRequired: Object.values(clientSetupStatus).some(status => Boolean(status.needsRepair)),
  };
}

function buildMaintenanceSelection(status) {
  const isFirstSetup = Boolean(
    status.kurspilotRepairRequired &&
    !status.workspace.configured &&
    !status.moodle.url &&
    !status.moodle.tokenPresent
  );
  const preselectedAreaIds = [];

  if (status.kurspilotRepairRequired) {
    preselectedAreaIds.push('kurspilot-setup-or-repair');
  }

  if (!status.moodle.url) {
    preselectedAreaIds.push('moodle-url-change');
  }

  if (!status.moodle.tokenPresent) {
    preselectedAreaIds.push('moodle-token-renewal');
  }

  if (!status.workspace.configured) {
    preselectedAreaIds.push('workspace-change');
  }

  return {
    mode: isFirstSetup ? 'first-setup' : 'maintenance',
    areas: MAINTENANCE_AREAS,
    preselectedAreaIds,
    multipleSelectionAllowed: true,
  };
}

function resolveMaintenanceAreaSelection(selectedAreaIds) {
  const validAreaIds = new Set(MAINTENANCE_AREAS.map(area => area.id));
  const normalized = Array.isArray(selectedAreaIds) ? selectedAreaIds : [selectedAreaIds];
  const selected = [];

  for (const areaId of normalized) {
    if (validAreaIds.has(areaId) && !selected.includes(areaId)) {
      selected.push(areaId);
    }
  }

  return selected.includes('no-change') ? ['no-change'] : selected;
}

/**
 * Fuehrt den nicht-interaktiven Kurspilot-Setup-/Reparaturflow aus.
 *
 * @param {object} options
 * @param {string[]} [options.selectedMaintenanceAreaIds] ausgewaehlte Wartungsbereiche
 * @param {string[]} [options.selectedClients] von der Lehrkraft gewaehlte Clients ('codex'/'claude')
 * @param {string} [options.workspacePath] explizit gewaehlter Arbeitsbereich-Ort
 * @param {boolean} [options.workspaceSelectionConfirmed] bestaetigt den gewaehlten
 *   oder vorgeschlagenen Arbeitsbereich-Ort
 * @param {string} [options.homeDir] Override fuer os.homedir() (Tests)
 * @param {string} [options.moodleUrl] Moodle-URL fuer den Token-Speicher
 * @param {string} [options.moodleToken] Moodle-Token fuer den Token-Speicher
 * @param {Function} [options.detectClients] austauschbare Client-Erkennung (Tests/DI)
 * @param {Function} [options.readCredentials] austauschbarer Credential-Reader (Tests/DI)
 * @param {Function} [options.setCredentials] austauschbarer Credential-Setter (Tests/DI)
 * @param {Function} [options.setupClaudeDesktopConfig] austauschbar (Tests/DI)
 * @param {Function} [options.setupCodexConfig] austauschbar (Tests/DI)
 * @param {Function} [options.installSkillsForProvider] austauschbar (Tests/DI)
 * @param {Function} [options.writeWorkspaceSetting] austauschbar (Tests/DI)
 * @param {object} [options.installLinks] austauschbare Install-Links (Tests/DI)
 * @returns {object} Statusreport - enthaelt nie den Moodle-Token
 */
function runSetupFlow(options = {}) {
  const {
    selectedMaintenanceAreaIds,
    selectedClients = [],
    workspacePath: requestedWorkspacePath,
    workspaceSelectionConfirmed = Boolean(requestedWorkspacePath),
    homeDir = os.homedir(),
    moodleUrl,
    moodleToken,
    detectClients = defaultDetectClients,
    readCredentials: readCredentialsFn = readCredentials,
    setCredentials: setCredentialsFn = setCredentials,
    setupClaudeDesktopConfig: setupClaudeDesktopConfigFn = setupClaudeDesktopConfig,
    setupCodexConfig: setupCodexConfigFn = setupCodexConfig,
    installSkillsForProvider: installSkillsForProviderFn = installKurspilotSkillsForProvider,
    writeWorkspaceSetting: writeWorkspaceSettingFn = writeKurspilotWorkspaceSetting,
    installLinks = OFFICIAL_INSTALL_LINKS,
  } = options;

  const detectedClients = detectClients();
  const anyClientDetected = detectedClients.codex || detectedClients.claude;
  const selectedMaintenanceAreas = selectedMaintenanceAreaIds
    ? resolveMaintenanceAreaSelection(selectedMaintenanceAreaIds)
    : null;
  const usesMaintenanceSelection = Boolean(selectedMaintenanceAreas);

  function shouldRun(areaId) {
    return !usesMaintenanceSelection || selectedMaintenanceAreas.includes(areaId);
  }

  if (!anyClientDetected) {
    return {
      blocked: true,
      proceeded: false,
      detectedClients,
      installLinks,
      configuredClients: [],
      workspacePath: null,
      suggestedWorkspacePath: null,
      workspaceSettingSaved: false,
      workspaceConfigPath: null,
      credentialsSaved: false,
    };
  }

  const suggestedWorkspacePath = defaultWorkspacePath(homeDir);
  const confirmedWorkspacePath = workspaceSelectionConfirmed
    ? (requestedWorkspacePath || suggestedWorkspacePath)
    : null;
  let workspaceSettingSaved = false;
  let workspaceConfigPath = null;
  const executedSteps = [];

  if (shouldRun('workspace-change') && confirmedWorkspacePath) {
    ensureWorkspaceDirectory(confirmedWorkspacePath);
    const workspaceSetting = writeWorkspaceSettingFn(confirmedWorkspacePath, { homeDir });
    workspaceConfigPath = workspaceSetting.configPath;
    workspaceSettingSaved = true;
    executedSteps.push('Arbeitsbereich geaendert');
  }

  let credentialsSaved = false;
  if (usesMaintenanceSelection) {
    const shouldChangeUrl = shouldRun('moodle-url-change');
    const shouldChangeToken = shouldRun('moodle-token-renewal');
    if (shouldChangeUrl || shouldChangeToken) {
      const currentCredentials = readCredentialsFn() || {};
      const nextUrl = shouldChangeUrl ? moodleUrl : currentCredentials.url;
      const nextToken = shouldChangeToken ? moodleToken : currentCredentials.token;
      if (nextUrl && nextToken) {
        setCredentialsFn(nextUrl, nextToken);
        credentialsSaved = true;
        if (shouldChangeUrl) {
          executedSteps.push('Moodle-URL geaendert');
        }
        if (shouldChangeToken) {
          executedSteps.push('Moodle-Token erneuert');
        }
      }
    }
  } else if (moodleUrl && moodleToken) {
    setCredentialsFn(moodleUrl, moodleToken);
    credentialsSaved = true;
  }

  const configuredClients = [];
  let skillInstallAborted = false;
  const skillInstallWarnings = [];
  const skillInstallConflicts = [];
  const nodeExecPath = process.execPath;

  for (const client of shouldRun('kurspilot-setup-or-repair') ? selectedClients : []) {
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
    const installResult = installSkillsForProviderFn(REPO_ROOT, CLIENT_PROVIDER_ROOTS[client], targetRoot);
    if (installResult && installResult.aborted) {
      skillInstallAborted = true;
      skillInstallWarnings.push(...(installResult.warnings || []));
      skillInstallConflicts.push(...(installResult.conflicts || []));
      break;
    }

    configuredClients.push(client);
  }
  if (configuredClients.length > 0) {
    executedSteps.push('Kurspilot eingerichtet/repariert');
  }

  return {
    blocked: false,
    proceeded: true,
    detectedClients,
    installLinks,
    configuredClients,
    workspacePath: confirmedWorkspacePath,
    suggestedWorkspacePath,
    workspaceSettingSaved,
    workspaceConfigPath,
    credentialsSaved,
    executedSteps,
    skillInstallAborted,
    skillInstallWarnings,
    skillInstallConflicts,
  };
}

module.exports = {
  buildMaintenanceSelection,
  buildSetupStatus,
  resolveMaintenanceAreaSelection,
  runSetupFlow,
  defaultDetectClients,
  defaultWorkspacePath,
  defaultGetClientSetupStatus,
  MAINTENANCE_AREAS,
  OFFICIAL_INSTALL_LINKS,
};
