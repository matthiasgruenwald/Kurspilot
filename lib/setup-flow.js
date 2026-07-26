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
const { setupClaudeDesktopConfig, setupClaudeCodeConfig, setupCodexConfig, setupOpenCodeConfig, getSelectedActivityIds, readConfiguredActivityIds: defaultReadConfiguredActivityIds } = require('./mcp-config-setup');
const { listActivities } = require('./activity-registry');
const { installKurspilotSkillsForProvider, installKurspilotSkillsAliasForClaude } = require('./skill-install');
const { isImageMagickInstalled, installImageMagick: defaultInstallImageMagick } = require('./imagemagick-setup');
const { isSipsAvailable } = require('./image-crop');
const { installConfiguratorShortcut } = require('./shortcut-install');
const {
  CLIENTS,
  CLIENT_IDS,
  OFFICIAL_INSTALL_LINKS,
  detectClients: defaultDetectClients,
  clientLabel,
  getClaudeDesktopConfigPath,
  getClaudeCodeConfigPath,
} = require('./client-registry');

const REPO_ROOT = path.join(__dirname, '..');
const START_MCP_PATH = path.join(REPO_ROOT, 'scripts', 'start-mcp.js');
const CODEX_DESKTOP_APP_NAME = 'ChatGPT';
const LEGACY_CODEX_DESKTOP_APP_NAME = 'Codex';
const CODEX_WINDOWS_EXECUTABLE = 'ChatGPT.exe';
const LEGACY_CODEX_WINDOWS_EXECUTABLE = 'codex.exe';

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
      // Issue #96-Folgefehler (zweiter Live-Test-Befund): sowohl "pgrep -x
      // Claude" als auch der nachgebesserte "pgrep -f
      // Claude.app/Contents/MacOS/Claude" verfehlten das echte, laufende
      // Claude.app auf einem Testgeraet - p_comm scheint dort nicht
      // zuverlaessig vorhersagbar (macOS-/Entitlement-abhaengig). Fragt
      // stattdessen ueber Launch Services ab ("application X is running"),
      // genau wie macOS Apps selbst identifiziert - kein Prozessnamen-Pattern
      // mehr und kein "tell application System Events"-Block, der zusaetzlich
      // eine Automation-/Accessibility-Freigabe braeuchte.
      const output = run('osascript', ['-e', 'application "Claude" is running'], { encoding: 'utf8' });
      return output.trim() === 'true';
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
      run('taskkill', ['/IM', 'claude.exe', '/F', '/T'], { encoding: 'utf8' });
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
 * Erkennt plattformabhaengig, ob Codex laeuft (Issue #96-Folgefehler,
 * Pendant zu defaultIsClaudeDesktopRunning).
 *
 * Seit der ChatGPT-Codex-Zusammenlegung wird primär auf die ChatGPT-App
 * geprüft, für Restbestände aber zusätzlich auf den alten Codex-Namen.
 * macOS wurde live am 2026-07-10 gegen /Applications/ChatGPT.app verifiziert
 * (CFBundleName/CFBundleExecutable = "ChatGPT", Bundle-ID com.openai.codex).
 * Windows nutzt mangels Live-Verifikation in dieser Session die analogen
 * Annahmen "ChatGPT.exe" plus Legacy-"codex.exe"; die Konstanten halten das
 * notfalls an einer Stelle.
 *
 * ponytail: prueft nur die App, nicht welche Sitzung -
 * mehrere parallele Codex-Terminals sind serverseitig nicht unterscheidbar.
 */
function defaultIsCodexRunning(options = {}) {
  const platform = options.platform || process.platform;
  const run = options.execFileSync || require('node:child_process').execFileSync;
  try {
    if (platform === 'win32') {
      const output = run('tasklist', [], { encoding: 'utf8' });
      return [CODEX_WINDOWS_EXECUTABLE, LEGACY_CODEX_WINDOWS_EXECUTABLE]
        .some(name => new RegExp(name.replace('.', '\\.'), 'i').test(output));
    }
    if (platform === 'darwin') {
      for (const appName of [CODEX_DESKTOP_APP_NAME, LEGACY_CODEX_DESKTOP_APP_NAME]) {
        const output = run('osascript', ['-e', `application "${appName}" is running`], { encoding: 'utf8' });
        if (output.trim() === 'true') {
          return true;
        }
      }
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Beendet Codex plattformabhaengig (Issue #96-Folgefehler, Pendant zu
 * defaultEndClaudeDesktop).
 *
 * ponytail: killall/taskkill auf ChatGPT plus Legacy-Codex-Namen, exakt wie
 * bei Claude - triffe damit auch unbeteiligte, parallel offene Sitzungen.
 * Bewusst akzeptiertes Risiko, keine Sitzungs-/PID-Auswahl gebaut.
 */
function defaultEndCodex(options = {}) {
  const platform = options.platform || process.platform;
  const run = options.execFileSync || require('node:child_process').execFileSync;
  const targets = platform === 'win32'
    ? [CODEX_WINDOWS_EXECUTABLE, LEGACY_CODEX_WINDOWS_EXECUTABLE]
    : platform === 'darwin'
      ? [CODEX_DESKTOP_APP_NAME, LEGACY_CODEX_DESKTOP_APP_NAME]
      : null;

  if (!targets) {
    return false;
  }

  let attempted = false;
  for (const target of targets) {
    try {
      run(platform === 'win32' ? 'taskkill' : 'killall', platform === 'win32' ? ['/IM', target, '/F', '/T'] : [target], {
        encoding: 'utf8',
      });
      attempted = true;
    } catch {
      // Legacy/modern target may simply not be present; keep trying the rest.
    }
  }

  return attempted;
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

function defaultWorkspacePath(homeDir) {
  return path.join(homeDir, 'Documents', 'Kurspilot');
}

function ensureWorkspaceDirectory(workspacePath) {
  fs.mkdirSync(workspacePath, { recursive: true });
}

function defaultGetClientSetupStatus(detectedClients, options = {}) {
  const homeDir = options.homeDir || os.homedir();

  const status = {};
  for (const clientId of CLIENT_IDS) {
    const client = CLIENTS[clientId];
    status[clientId] = {
      needsRepair: Boolean(detectedClients[clientId]) &&
        client.configPaths(homeDir).some(configPath => !fileContainsText(configPath, 'kurspilot-core')),
    };
  }
  return status;
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
    readConfiguredActivityIds: readConfiguredActivityIdsFn = defaultReadConfiguredActivityIds,
  } = options;

  const detectedClients = detectClients({ homeDir });
  const workspaceSetting = readWorkspaceSettingFn({ homeDir });
  const credentials = readCredentialsFn();
  const clientSetupStatus = getClientSetupStatus(detectedClients, { homeDir });
  const sipsActive = platform === 'darwin' && isSipsAvailableFn();
  // Issue #96-Folgefehler: bei Reparatur/Wartung soll die Aktivitaeten-
  // Checkliste die tatsaechlich gespeicherte Auswahl zeigen statt immer
  // wieder das Default-Buendel - null bedeutet "noch keine Auswahl
  // gespeichert" (Ersteinrichtung), die UI faellt dann auf das Default-
  // Buendel zurueck.
  const configuredActivityIds = readConfiguredActivityIdsFn({
    codexConfigPath: CLIENTS.codex.configPaths(homeDir)[0],
    claudeDesktopConfigPath: CLIENTS.claude.configPaths(homeDir)[0],
  });

  return {
    detectedClients,
    configuredActivityIds,
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
 * @param {string[]} [options.selectedClients] von der Lehrkraft gewaehlte Clients ('codex'/'claude'/'opencode')
 * @param {string[]} [options.selectedActivityIds] Aktivitaets-MCP-Auswahl (Issue #96, Default
 *   bei undefined: getDefaultBundle() in lib/mcp-config-setup.js)
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
 * @param {Function} [options.setupOpenCodeConfig] austauschbar (Tests/DI)
 * @param {Function} [options.installSkillsForProvider] austauschbar (Tests/DI)
 * @param {Function} [options.writeWorkspaceSetting] austauschbar (Tests/DI)
 * @param {object} [options.installLinks] austauschbare Install-Links (Tests/DI)
 * @returns {object} Statusreport - enthaelt nie den Moodle-Token
 */
function runSetupFlow(options = {}) {
  const {
    selectedMaintenanceAreaIds,
    selectedClients = [],
    selectedActivityIds,
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
    setupOpenCodeConfig: setupOpenCodeConfigFn = setupOpenCodeConfig,
    isClaudeRunning: isClaudeRunningFn = defaultIsClaudeDesktopRunning,
    isCodexRunning: isCodexRunningFn = defaultIsCodexRunning,
    installSkillsForProvider: installSkillsForProviderFn = installKurspilotSkillsForProvider,
    installSkillsAliasForClaude: installSkillsAliasForClaudeFn = installKurspilotSkillsAliasForClaude,
    sharedSkillStorage = true,
    writeWorkspaceSetting: writeWorkspaceSettingFn = writeKurspilotWorkspaceSetting,
    installLinks = OFFICIAL_INSTALL_LINKS,
    isImageMagickAvailable: isImageMagickAvailableFn = isImageMagickInstalled,
    installImageMagick: installImageMagickFn = defaultInstallImageMagick,
    installConfiguratorShortcut: installConfiguratorShortcutFn = installConfiguratorShortcut,
    cropBackendChoice,
    writeCropBackendPreference: writeCropBackendPreferenceFn = writeCropBackendPreference,
  } = options;

  const detectedClients = detectClients();
  const anyClientDetected = CLIENT_IDS.some(id => detectedClients[id]);
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
      codexWasRunningDuringSave: false,
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
  let claudeWasRunningDuringSave = false;
  let codexWasRunningDuringSave = false;

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

  if (credentialsSaved) {
    if (detectedClients.claude && isClaudeRunningFn()) {
      claudeWasRunningDuringSave = true;
    }
    if (detectedClients.codex && isCodexRunningFn()) {
      codexWasRunningDuringSave = true;
    }
  }

  let imageMagickWarning = null;
  const imageMagickSelected = usesMaintenanceSelection && selectedMaintenanceAreas.includes('imagemagick-install');
  if (imageMagickSelected) {
    // Issue #142: das Label "neu installieren/reparieren" (#138) gilt, wenn
    // ImageMagick schon installiert ist - installImageMagickFn() muss dann
    // mit force:true reparieren, sonst tut "brew install" bei vorhandener
    // Formula nichts und die Auswahl waere wirkungslos.
    const alreadyAvailable = isImageMagickAvailableFn();
    const installResult = installImageMagickFn({ force: alreadyAvailable });
    if (installResult.installed) {
      executedSteps.push(alreadyAvailable ? 'ImageMagick neu installiert/repariert' : 'ImageMagick installiert');
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

  // Issue #165: Gemeinsame Skill-Ablage (Alias-Modus).
  // Alias-Modus nur wenn beide Clients tatsaechlich eingerichtet werden:
  // Codex erhaelt die kanonische Kopie, Claude bekommt Aliases darauf.
  const bothClientsWillRun = shouldRun('kurspilot-setup-or-repair') &&
    selectedClients.includes('codex') && selectedClients.includes('claude') &&
    Boolean(detectedClients.codex) && Boolean(detectedClients.claude);
  const useAliasMode = sharedSkillStorage && bothClientsWillRun;
  // ponytail: Codex-Zielordner vorab - wird bei Claude im Alias-Modus benoetigt,
  // auch wenn Codex im Loop vorher laeuft.
  const codexSkillTargetRoot = CLIENTS.codex.skillTargetRoot(homeDir);

  // Issue #130: Config wird immer geschrieben, unabhaengig davon, ob Claude
  // gerade laeuft (siehe Race-Condition-Analyse in dieser Datei oben).
  // "claudeWasRunningDuringSave" ist nur noch ein Hinweis fuer die Browser-UI,
  // damit sie nach dem Speichern optional "Beenden"/"Neustart" anbieten kann -
  // keine Blockierung mehr (vorher: claudeRunningBlocked).
  for (const client of shouldRun('kurspilot-setup-or-repair') ? selectedClients : []) {
    if (!detectedClients[client]) {
      continue;
    }

    if (client === 'claude' && isClaudeRunningFn()) {
      claudeWasRunningDuringSave = true;
    }
    if (client === 'codex' && isCodexRunningFn()) {
      codexWasRunningDuringSave = true;
    }

    const clientDef = CLIENTS[client];
    if (!clientDef) {
      continue;
    }
    const configPaths = clientDef.configPaths(homeDir);

    if (client === 'codex') {
      setupCodexConfigFn(configPaths[0], START_MCP_PATH, nodeExecPath, {
        selectedActivityIds,
      });
    } else if (client === 'claude') {
      setupClaudeDesktopConfigFn(
        configPaths[0],
        START_MCP_PATH,
        nodeExecPath,
        { selectedActivityIds }
      );
      setupClaudeCodeConfigFn(
        configPaths[1],
        START_MCP_PATH,
        nodeExecPath,
        { selectedActivityIds }
      );
    } else if (client === 'opencode') {
      setupOpenCodeConfigFn(configPaths[0], START_MCP_PATH, nodeExecPath, {
        selectedActivityIds,
      });
    } else {
      continue;
    }

    const targetRoot = clientDef.skillTargetRoot(homeDir);
    // Issue #165: Alias-Modus - Claude bekommt Alias auf Codex-Ablage statt Kopie.
    const installResult = useAliasMode && client === 'claude'
      ? installSkillsAliasForClaudeFn(codexSkillTargetRoot, targetRoot)
      : installSkillsForProviderFn(REPO_ROOT, clientDef.providerRoot, targetRoot);
    if (installResult && installResult.aborted) {
      skillInstallAborted = true;
      // Issue #96-Folgefehler: Warnungen mit Client-Label taggen, damit bei
      // beiden Clients gleichzeitig erkennbar bleibt, wer betroffen ist.
      skillInstallWarnings.push(...(installResult.warnings || []).map(warning => `${clientLabel(client)}: ${warning}`));
      skillInstallConflicts.push(...(installResult.conflicts || []));
      skillInstallConflictPrompts.push(...(installResult.conflictPrompts || []));
      break;
    }

    configuredClients.push(client);
    executedSteps.push(`${clientLabel(client)} eingerichtet/repariert`);
    const writtenCount = installResult && installResult.written ? installResult.written.length : 0;
    executedSteps.push(
      writtenCount > 0
        ? `${clientLabel(client)}: Skills aktualisiert (${writtenCount})`
        : `${clientLabel(client)}: Skills bereits aktuell`
    );
  }

  // Issue #96-Folgefehler: vorher stand nur das vage "Kurspilot
  // eingerichtet/repariert" im Bericht - jetzt explizit, welche Aktivitaeten
  // tatsaechlich aktiv/deaktiviert sind (Abhaengigkeiten bereits aufgeloest).
  if (configuredClients.length > 0) {
    const activeIds = new Set(getSelectedActivityIds(selectedActivityIds));
    const activeLabels = [];
    const inactiveLabels = [];
    for (const activity of listActivities()) {
      (activeIds.has(activity.id) ? activeLabels : inactiveLabels).push(activity.label);
    }
    executedSteps.push(`Aktive Aktivitäten: ${activeLabels.join(', ')}`);
    if (inactiveLabels.length > 0) {
      executedSteps.push(`Deaktivierte Aktivitäten: ${inactiveLabels.join(', ')}`);
    }
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
    codexWasRunningDuringSave,
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
  defaultIsCodexRunning,
  defaultEndCodex,
  defaultWaitForClaudeToExit,
  defaultRestartClaudeDesktop,
  findWindowsClaudeExecutable,
  CODEX_DESKTOP_APP_NAME,
  LEGACY_CODEX_DESKTOP_APP_NAME,
  CODEX_WINDOWS_EXECUTABLE,
  LEGACY_CODEX_WINDOWS_EXECUTABLE,
  MAINTENANCE_AREAS,
  OFFICIAL_INSTALL_LINKS,
};
