'use strict';

/**
 * Nicht-interaktive Flow-Logik fuer das Kurspilot-Konfigurationsprogramm
 * (Issue #67, Parent #5/#57). Erkennt lokale Codex- und Claude-Clients,
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
const { readCredentials, setCredentials } = require('../scripts/moodle-credentials');
const {
  readKurspilotWorkspaceSetting,
  writeKurspilotWorkspaceSetting,
  readCropBackendPreference,
  writeCropBackendPreference,
} = require('./kurspilot-workspace-config');
const { setupClaudeDesktopConfig, setupClaudeCodeConfig, setupCodexConfig } = require('./mcp-config-setup');
const { installKurspilotSkillsForProvider } = require('./skill-install');
const { isImageMagickInstalled, installImageMagick: defaultInstallImageMagick } = require('./imagemagick-setup');
const { isSipsAvailable } = require('./image-crop');
const { installConfiguratorShortcut } = require('./shortcut-install');

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
    label: 'Moodle-URL ändern',
  },
  {
    id: 'workspace-change',
    label: 'Arbeitsbereich ändern',
  },
  {
    id: 'imagemagick-install',
    label: 'ImageMagick installieren (für passgenauen Bildzuschnitt)',
  },
  {
    id: 'no-change',
    label: 'Nichts ändern',
  },
];

/**
 * Standard-Client-Erkennung fuer macOS: Claude Desktop ueber die installierte
 * App, Codex ueber die CLI im PATH. Bewusst einfache Heuristik fuer den
 * ersten Slice (siehe CONTEXT.md "Desktop-Client-Einrichtung": eine erkannte
 * Desktop-App reicht, CLI-Erkennung ist ein hilfreicher Zusatzpfad).
 */
function defaultDetectClients(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  const pathEnv = Object.hasOwn(options, 'pathEnv') ? options.pathEnv : process.env.PATH;
  const appData = options.appData || process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
  const localAppData = options.localAppData || process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

  if (platform === 'win32') {
    return {
      codex: commandExistsOnPath('codex', pathEnv) ||
        fs.existsSync(path.join(homeDir, '.codex')) ||
        fs.existsSync(path.join(appData, 'Codex')) ||
        fs.existsSync(path.join(localAppData, 'Codex')) ||
        fs.existsSync(path.join(localAppData, 'OpenAI', 'Codex')),
      claude: commandExistsOnPath('claude', pathEnv) ||
        fs.existsSync(path.join(homeDir, '.claude')) ||
        fs.existsSync(path.join(appData, 'Claude')) ||
        fs.existsSync(path.join(localAppData, 'Claude')) ||
        fs.existsSync(path.join(localAppData, 'Programs', 'Claude')) ||
        fs.existsSync(path.join(localAppData, 'AnthropicClaude')),
    };
  }

  return {
    codex: commandExistsOnPath('codex', pathEnv) ||
      executableExists(path.join(homeDir, '.local', 'bin', 'codex')) ||
      fs.existsSync(path.join(homeDir, '.codex')),
    claude: fs.existsSync('/Applications/Claude.app') ||
      commandExistsOnPath('claude', pathEnv) ||
      fs.existsSync(path.join(homeDir, '.claude')),
  };
}

/**
 * Erkennt plattformabhaengig, ob Claude Desktop gerade laeuft (Issue #112):
 * die laufende App persistiert periodisch ihre eigenen In-Memory-Einstellungen
 * zurueck in claude_desktop_config.json und ueberschreibt dabei kurz danach
 * den frisch geschriebenen mcpServers-Key wieder. Per DI testbar (Fake
 * execFileSync), kein echter Prozess-Check in Tests.
 *
 * Race-Condition-Analyse (Issue #130, Annahme statt Messung - hier bewusst
 * offengelegt): #112 hat das Schreiben bei laufendem Claude komplett
 * blockiert, weil ein Live-Test damals Datenverlust zeigte. Ein erneuter
 * Live-Test (macOS, #130) konnte den Verlust nicht reproduzieren - das
 * Schreiben selbst (lib/mcp-config-setup.js, fs.writeFileSync) ist atomar
 * genug fuer den Normalfall. Das eigentliche Risiko ist nicht der Schreib-
 * vorgang, sondern Claudes eigener, nicht kontrollierbarer Persistenz-Zyklus
 * danach: laeuft er in einem ungluecklichen Moment, kann er die frische
 * Config trotzdem ueberschreiben. Dieses Restrisiko laesst sich durch reines
 * Timing nicht zuverlaessig ausschliessen - deshalb bleibt isClaudeRunning()
 * erhalten, aber als Status-Hinweis (claudeWasRunningDuringSave) statt als
 * Schreibblockade: die Lehrkraft entscheidet nach dem Speichern selbst, ob
 * sie Claude beendet/neu startet, statt vorher ausgesperrt zu werden.
 * Windows wurde dabei nicht separat verifiziert (kein Windows-Live-Test in
 * dieser Session) - das gleiche Restrisiko gilt dort unter der Annahme, dass
 * Claude Desktop dort denselben Persistenz-Zyklus faehrt.
 */
function defaultIsClaudeDesktopRunning(options = {}) {
  const platform = options.platform || process.platform;
  const run = options.execFileSync || require('node:child_process').execFileSync;
  try {
    if (platform === 'win32') {
      const output = run('tasklist', ['/FI', 'IMAGENAME eq claude.exe'], { encoding: 'utf8' });
      return /claude\.exe/i.test(output);
    }
    if (platform === 'darwin') {
      run('pgrep', ['-x', 'Claude'], { encoding: 'utf8' });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Beendet Claude Desktop plattformabhaengig, damit der Browser-Konfigurator
 * nach einem Klick auf "Claude jetzt beenden und fortfahren" das Schreiben
 * freigeben kann. Per DI testbar (Fake execFileSync).
 */
function defaultEndClaudeDesktop(options = {}) {
  const platform = options.platform || process.platform;
  const run = options.execFileSync || require('node:child_process').execFileSync;
  try {
    if (platform === 'win32') {
      run('taskkill', ['/IM', 'claude.exe', '/F'], { encoding: 'utf8' });
      return true;
    }
    if (platform === 'darwin') {
      run('killall', ['Claude'], { encoding: 'utf8' });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Startet Claude Desktop plattformabhaengig neu (Issue #130: "Neustart"
 * als Opt-in nach dem Speichern, statt Beenden vor dem Speichern). Wartet
 * zuerst auf das tatsaechliche Prozessende (gleiche Begruendung wie
 * defaultWaitForClaudeToExit), startet danach die App erneut. Per DI
 * testbar (Fake execFileSync/execFile), kein echter Prozess in Tests.
 */
async function defaultRestartClaudeDesktop(options = {}) {
  const platform = options.platform || process.platform;
  const endClaudeDesktopFn = options.endClaudeDesktop || defaultEndClaudeDesktop;
  const waitForClaudeToExitFn = options.waitForClaudeToExit || defaultWaitForClaudeToExit;
  const launch = options.launch || require('node:child_process').execFile;

  endClaudeDesktopFn(options);
  await waitForClaudeToExitFn(options);

  try {
    if (platform === 'win32') {
      const exePath = findWindowsClaudeExecutable(options);
      launch('cmd', ['/c', 'start', '', exePath || 'claude.exe'], { stdio: 'ignore' });
    } else if (platform === 'darwin') {
      launch('open', ['-a', 'Claude'], { stdio: 'ignore' });
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sucht die Claude-Desktop-exe unter Windows ueber bekannte Installations-
 * pfade (Issue #129: "claude.exe" ist nicht im PATH, "start claude.exe"
 * scheitert deshalb). Squirrel-Installer legen einen Stub im App-Root ab,
 * der die aktuell installierte Version startet.
 */
function findWindowsClaudeExecutable(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const localAppData = options.localAppData || process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
  const exists = options.existsSync || fs.existsSync;

  const candidates = [
    path.join(localAppData, 'AnthropicClaude', 'Claude.exe'),
    path.join(localAppData, 'Programs', 'Claude', 'Claude.exe'),
    path.join(localAppData, 'Claude', 'Claude.exe'),
  ];

  return candidates.find(candidate => exists(candidate)) || null;
}

/**
 * Wartet nach defaultEndClaudeDesktop() darauf, dass Claude tatsaechlich
 * beendet ist, statt sich auf das Timing von taskkill/killall zu verlassen
 * (Issue #118): ein Force-Kill mit mehreren Kindprozessen kann etwas
 * laenger brauchen als der Page-Reload, der direkt danach den
 * Konfigurations-Schreibvorgang freigibt - in diesem Fenster ueberschreibt
 * Claude beim eigenen Prozessende sonst erneut die frisch geschriebene
 * Config.
 */
async function defaultWaitForClaudeToExit(options = {}) {
  const isClaudeRunningFn = options.isClaudeRunning || defaultIsClaudeDesktopRunning;
  const maxAttempts = options.maxAttempts ?? 20;
  const delayMs = options.delayMs ?? 250;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!isClaudeRunningFn()) {
      return true;
    }
    await sleep(delayMs);
  }

  return !isClaudeRunningFn();
}

function getWindowsAppData(homeDir) {
  return process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
}

function getClaudeDesktopConfigPath(homeDir) {
  if (process.platform === 'win32') {
    return path.join(getWindowsAppData(homeDir), 'Claude', 'claude_desktop_config.json');
  }
  return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
}

/**
 * Pfad zu Claude Codes eigener Config (Issue #112-Folgefehler): lokale
 * Code-Sessions lesen ihre MCP-Server aus ~/.claude.json, nicht aus
 * claude_desktop_config.json - plattformunabhaengig, kein win32-Sonderfall.
 */
function getClaudeCodeConfigPath(homeDir) {
  return path.join(homeDir, '.claude.json');
}
function commandExistsOnPath(command, pathEnv = process.env.PATH) {
  for (const dir of String(pathEnv || '').split(path.delimiter)) {
    if (dir && executableExists(path.join(dir, command))) {
      return true;
    }
  }
  return false;
}

function executableExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
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
  const claudeDesktopConfigPath = getClaudeDesktopConfigPath(homeDir);
  const claudeCodeConfigPath = getClaudeCodeConfigPath(homeDir);

  return {
    codex: {
      needsRepair: Boolean(detectedClients.codex) && !fileContainsText(codexConfigPath, 'kurspilot-core'),
    },
    claude: {
      needsRepair: Boolean(detectedClients.claude) && (
        !fileContainsText(claudeDesktopConfigPath, 'kurspilot-core') ||
        !fileContainsText(claudeCodeConfigPath, 'kurspilot-core')
      ),
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
    platform = process.platform,
    detectClients = defaultDetectClients,
    readCredentials: readCredentialsFn = readCredentials,
    readWorkspaceSetting: readWorkspaceSettingFn = readKurspilotWorkspaceSetting,
    getClientSetupStatus = defaultGetClientSetupStatus,
    isClaudeRunning = defaultIsClaudeDesktopRunning,
    isImageMagickAvailable: isImageMagickAvailableFn = isImageMagickInstalled,
    isSipsAvailable: isSipsAvailableFn = isSipsAvailable,
    readCropBackendPreference: readCropBackendPreferenceFn = readCropBackendPreference,
  } = options;

  const detectedClients = detectClients({ homeDir });
  const workspaceSetting = readWorkspaceSettingFn({ homeDir });
  const credentials = readCredentialsFn();
  const clientSetupStatus = getClientSetupStatus(detectedClients, { homeDir });
  const sipsActive = platform === 'darwin' && isSipsAvailableFn();

  return {
    detectedClients,
    claudeRunning: Boolean(detectedClients.claude) && isClaudeRunning(),
    workspace: {
      configured: Boolean(workspaceSetting && workspaceSetting.ok),
      path: workspaceSetting && workspaceSetting.ok ? workspaceSetting.contextRoot : null,
      status: workspaceSetting ? workspaceSetting.status : 'missing',
    },
    moodle: {
      url: credentials && credentials.url ? credentials.url : null,
      tokenPresent: Boolean(credentials && credentials.token),
    },
    imageMagick: {
      available: isImageMagickAvailableFn(),
      // Windows: ImageMagick ist der einzige Crop-Pfad, daher Pflicht-Anzeige.
      // macOS: sips ist seit Issue #135 der aktive Standard-Pfad, ImageMagick
      // bleibt hier nur als optionaler Upgrade-Pfad sichtbar (Issue #136).
      supported: platform === 'win32' || sipsActive,
      sipsActive,
      preferredBackend: readCropBackendPreferenceFn({ homeDir }),
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

  const imageMagickSupported = Boolean(status.imageMagick && status.imageMagick.supported);
  const imageMagickAvailable = Boolean(status.imageMagick && status.imageMagick.available);

  const areas = imageMagickSupported
    ? MAINTENANCE_AREAS.map(area =>
        area.id === 'imagemagick-install' && imageMagickAvailable
          ? { ...area, label: 'ImageMagick neu installieren/reparieren (für passgenauen Bildzuschnitt)' }
          : area
      )
    : MAINTENANCE_AREAS.filter(area => area.id !== 'imagemagick-install');

  return {
    mode: isFirstSetup ? 'first-setup' : 'maintenance',
    areas,
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
    setupClaudeCodeConfig: setupClaudeCodeConfigFn = setupClaudeCodeConfig,
    setupCodexConfig: setupCodexConfigFn = setupCodexConfig,
    isClaudeRunning: isClaudeRunningFn = defaultIsClaudeDesktopRunning,
    installSkillsForProvider: installSkillsForProviderFn = installKurspilotSkillsForProvider,
    writeWorkspaceSetting: writeWorkspaceSettingFn = writeKurspilotWorkspaceSetting,
    installLinks = OFFICIAL_INSTALL_LINKS,
    isImageMagickAvailable: isImageMagickAvailableFn = isImageMagickInstalled,
    installImageMagick: installImageMagickFn = defaultInstallImageMagick,
    installConfiguratorShortcut: installConfiguratorShortcutFn = installConfiguratorShortcut,
    cropBackendChoice,
    writeCropBackendPreference: writeCropBackendPreferenceFn = writeCropBackendPreference,
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
      claudeWasRunningDuringSave: false,
      imageMagickWarning: null,
      configuratorShortcutPath: null,
      configuratorShortcutWarning: null,
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
    executedSteps.push('Arbeitsbereich geändert');
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
          executedSteps.push('Moodle-URL geändert');
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

  let imageMagickWarning = null;
  const imageMagickSelected = usesMaintenanceSelection && selectedMaintenanceAreas.includes('imagemagick-install');
  if (imageMagickSelected && !isImageMagickAvailableFn()) {
    const installResult = installImageMagickFn();
    if (installResult.installed) {
      executedSteps.push('ImageMagick installiert');
    } else {
      imageMagickWarning = installResult.error;
    }
  }

  // Issue #140: cropBackendChoice kommt aus einem dedizierten Schalter (sips|
  // ImageMagick), der in der UI nur sichtbar ist, wenn beide Backends
  // verfuegbar sind - ist er nicht gerendert/abgeschickt worden, ist
  // cropBackendChoice undefined und es wird nichts geschrieben.
  if (cropBackendChoice === 'sips' || cropBackendChoice === 'imagemagick') {
    writeCropBackendPreferenceFn(cropBackendChoice, { homeDir });
    executedSteps.push(
      cropBackendChoice === 'imagemagick'
        ? 'ImageMagick als Bildausschnitt-Standard gesetzt'
        : 'sips als Bildausschnitt-Standard gesetzt'
    );
  }

  const configuredClients = [];
  let skillInstallAborted = false;
  const skillInstallWarnings = [];
  const skillInstallConflicts = [];
  const skillInstallConflictPrompts = [];
  const nodeExecPath = process.execPath;
  // Issue #130: Config wird immer geschrieben, unabhaengig davon, ob Claude
  // gerade laeuft (siehe Race-Condition-Analyse in dieser Datei oben).
  // "claudeWasRunningDuringSave" ist nur noch ein Hinweis fuer die Browser-UI,
  // damit sie nach dem Speichern optional "Beenden"/"Neustart" anbieten kann -
  // keine Blockierung mehr (vorher: claudeRunningBlocked).
  let claudeWasRunningDuringSave = false;

  for (const client of shouldRun('kurspilot-setup-or-repair') ? selectedClients : []) {
    if (!detectedClients[client]) {
      continue;
    }

    if (client === 'claude' && isClaudeRunningFn()) {
      claudeWasRunningDuringSave = true;
    }

    if (client === 'codex') {
      setupCodexConfigFn(path.join(homeDir, '.codex', 'config.toml'), START_MCP_PATH, nodeExecPath);
    } else if (client === 'claude') {
      setupClaudeDesktopConfigFn(
        getClaudeDesktopConfigPath(homeDir),
        START_MCP_PATH,
        nodeExecPath
      );
      setupClaudeCodeConfigFn(
        getClaudeCodeConfigPath(homeDir),
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
      skillInstallConflictPrompts.push(...(installResult.conflictPrompts || []));
      break;
    }

    configuredClients.push(client);
  }
  if (configuredClients.length > 0) {
    executedSteps.push('Kurspilot eingerichtet/repariert');
  }

  // Issue #132: die Verknuepfung "Kurspilot konfigurieren" wird bei jedem
  // nicht blockierten Lauf (neu) erzeugt - idempotent, da
  // installConfiguratorShortcut bestehende Dateien einfach ueberschreibt,
  // kein Duplikat-Wachstum. Ein Fehler dabei (z.B. nicht unterstuetzte
  // Plattform) darf den restlichen, bereits erfolgreichen Setup-Lauf nicht
  // nachtraeglich als gescheitert melden - deshalb Warnung statt throw.
  // Live verifiziert auf macOS (Setup-Lauf erzeugt/aktualisiert die .app,
  // idempotent bei wiederholtem Aufruf). Windows (.lnk im Startmenue) ist
  // hier nicht live getestet, sondern eine Annahme analog zu Issue #130 -
  // die Unit-Tests aus #127 (test/shortcut-install.test.js) decken den
  // VBS-/cscript-Pfad ab, ein echter Windows-Lauf stand in dieser Session
  // nicht zur Verfuegung.
  let configuratorShortcutPath = null;
  let configuratorShortcutWarning = null;
  try {
    const shortcutResult = installConfiguratorShortcutFn({
      nodePath: nodeExecPath,
      appPath: REPO_ROOT,
      writeFile: (filePath, content) => fs.writeFileSync(filePath, content),
    });
    configuratorShortcutPath = shortcutResult.shortcutPath;
  } catch (error) {
    configuratorShortcutWarning = error.message;
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
    skillInstallConflictPrompts,
    claudeWasRunningDuringSave,
    imageMagickWarning,
    configuratorShortcutPath,
    configuratorShortcutWarning,
  };
}

module.exports = {
  buildMaintenanceSelection,
  buildSetupStatus,
  getClaudeCodeConfigPath,
  getClaudeDesktopConfigPath,
  resolveMaintenanceAreaSelection,
  runSetupFlow,
  defaultDetectClients,
  defaultWorkspacePath,
  defaultGetClientSetupStatus,
  defaultIsClaudeDesktopRunning,
  defaultEndClaudeDesktop,
  defaultWaitForClaudeToExit,
  defaultRestartClaudeDesktop,
  findWindowsClaudeExecutable,
  MAINTENANCE_AREAS,
  OFFICIAL_INSTALL_LINKS,
};
