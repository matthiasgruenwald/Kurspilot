'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildSetupStatus,
  computeSetupProgress,
  nextOpenCondition,
  defaultDetectClients,
  defaultGetClientSetupStatus,
  defaultIsClaudeDesktopRunning,
  defaultEndClaudeDesktop,
  defaultIsCodexRunning,
  defaultEndCodex,
  defaultWaitForClaudeToExit,
  defaultRestartClaudeDesktop,
  CODEX_DESKTOP_APP_NAME,
  LEGACY_CODEX_DESKTOP_APP_NAME,
  CODEX_WINDOWS_EXECUTABLE,
  LEGACY_CODEX_WINDOWS_EXECUTABLE,
  getClaudeCodeConfigPath,
  getClaudeDesktopConfigPath,
  isMinimumConfigured,
  resolveMaintenanceAreaSelection,
  runSetupFlow,
  OFFICIAL_INSTALL_LINKS,
} = require('../lib/setup-flow');

const INSTALL_LINKS = {
  codex: 'https://openai.com/codex',
  claude: 'https://claude.ai/download',
};

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-setup-flow-test-'));
}

function noClientsDetected() {
  return { codex: false, claude: false, opencode: false };
}

function bothClientsDetected() {
  return { codex: true, claude: true, opencode: false };
}

function allClientsDetected() {
  return { codex: true, claude: true, opencode: true };
}

function onlyOpenCodeDetected() {
  return { codex: false, claude: false, opencode: true };
}

function makeStubs(baseDir, overrides = {}) {
  const calls = {
    setCredentials: [],
    setupClaudeDesktopConfig: [],
    setupClaudeCodeConfig: [],
    setupCodexConfig: [],
    setupOpenCodeConfig: [],
    installSkills: [],
    installSkillsAlias: [],
    writeWorkspaceSetting: [],
    installConfiguratorShortcut: [],
  };

  return {
    calls,
    detectClients: overrides.detectClients || bothClientsDetected,
    isClaudeRunning: overrides.isClaudeRunning || (() => false),
    isCodexRunning: overrides.isCodexRunning || (() => false),
    setCredentials: (url, token) => {
      calls.setCredentials.push({ url, token });
    },
    setupClaudeDesktopConfig: (...args) => {
      calls.setupClaudeDesktopConfig.push(args);
      return { created: true, backupPath: null, configPath: args[0] };
    },
    setupClaudeCodeConfig: (...args) => {
      calls.setupClaudeCodeConfig.push(args);
      return { created: true, backupPath: null, configPath: args[0] };
    },
    setupCodexConfig: (...args) => {
      calls.setupCodexConfig.push(args);
      return { created: true, backupPath: null, configPath: args[0] };
    },
    setupOpenCodeConfig: (...args) => {
      calls.setupOpenCodeConfig.push(args);
      return { created: true, backupPath: null, configPath: args[0] };
    },
    installSkillsForProvider: (...args) => {
      calls.installSkills.push(args);
      return { targetRoot: args[2], written: ['fake.md'], unchanged: [], aborted: false };
    },
    installSkillsAliasForClaude: (...args) => {
      calls.installSkillsAlias.push(args);
      return { targetRoot: args[1], written: ['alias-link'], unchanged: [], aborted: false };
    },
    writeWorkspaceSetting: (...args) => {
      calls.writeWorkspaceSetting.push(args);
      return { configPath: path.join(baseDir, 'workspace-config.json'), contextRoot: args[0] };
    },
    installConfiguratorShortcut: (options) => {
      calls.installConfiguratorShortcut.push(options);
      return { platform: options.platform || process.platform, shortcutPath: '/fake/shortcut' };
    },
    installLinks: INSTALL_LINKS,
    ...overrides,
  };
}

// --- Konfigurationsstatus / Wartungsmodell ----------------------------------

test('Statusmodell berichtet ImageMagick-Verfuegbarkeit und Plattform-Unterstuetzung', () => {
  const baseDir = makeTmpDir();
  const baseOptions = {
    homeDir: baseDir,
    detectClients: () => ({ codex: true, claude: false }),
    readCredentials: () => null,
    readWorkspaceSetting: () => null,
    getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
  };

  const onWindowsInstalled = buildSetupStatus({
    ...baseOptions,
    platform: 'win32',
    isImageMagickAvailable: () => true,
    isSipsAvailable: () => false,
  });
  assert.deepStrictEqual(onWindowsInstalled.imageMagick, { available: true, supported: true, sipsActive: false, preferredBackend: null });

  const onWindowsMissing = buildSetupStatus({
    ...baseOptions,
    platform: 'win32',
    isImageMagickAvailable: () => false,
    isSipsAvailable: () => false,
  });
  assert.deepStrictEqual(onWindowsMissing.imageMagick, { available: false, supported: true, sipsActive: false, preferredBackend: null });

  const onMac = buildSetupStatus({
    ...baseOptions,
    platform: 'darwin',
    isImageMagickAvailable: () => false,
    isSipsAvailable: () => true,
  });
  assert.deepStrictEqual(onMac.imageMagick, { available: false, supported: true, sipsActive: true, preferredBackend: null });
});

test('Statusmodell liefert configuredActivityIds aus injiziertem Reader, default null (Issue #96-Folgefehler)', () => {
  const baseDir = makeTmpDir();
  const baseOptions = {
    homeDir: baseDir,
    detectClients: () => ({ codex: true, claude: false }),
    readCredentials: () => null,
    readWorkspaceSetting: () => null,
    getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
  };

  const withoutOverride = buildSetupStatus(baseOptions);
  assert.strictEqual(withoutOverride.configuredActivityIds, null);

  const calls = [];
  const withStub = buildSetupStatus({
    ...baseOptions,
    readConfiguredActivityIds: (paths) => {
      calls.push(paths);
      return ['quiz', 'fragensammlung'];
    },
  });
  assert.deepStrictEqual(withStub.configuredActivityIds, ['quiz', 'fragensammlung']);
  assert.strictEqual(calls[0].codexConfigPath, path.join(baseDir, '.codex', 'config.toml'));
});

test('Statusmodell liest gespeicherte Backend-Praeferenz (#139)', () => {
  const baseDir = makeTmpDir();
  const status = buildSetupStatus({
    homeDir: baseDir,
    platform: 'darwin',
    detectClients: () => ({ codex: true, claude: false }),
    readCredentials: () => null,
    readWorkspaceSetting: () => null,
    getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    isImageMagickAvailable: () => true,
    isSipsAvailable: () => true,
    readCropBackendPreference: () => 'imagemagick',
  });

  assert.strictEqual(status.imageMagick.preferredBackend, 'imagemagick');
});

test('Statusmodell: auf macOS ist ImageMagick als optionaler Zusatz "supported", auch ohne Installation - sips bleibt der aktive Standard-Pfad', () => {
  const baseDir = makeTmpDir();
  const status = buildSetupStatus({
    homeDir: baseDir,
    platform: 'darwin',
    detectClients: () => ({ codex: true, claude: false }),
    readCredentials: () => null,
    readWorkspaceSetting: () => null,
    getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
    isImageMagickAvailable: () => false,
    isSipsAvailable: () => true,
  });

  assert.strictEqual(status.imageMagick.sipsActive, true, 'sips ist auf macOS der aktive Standard-Pfad fuer den Bildausschnitt');
  assert.strictEqual(status.imageMagick.supported, true, 'ImageMagick bleibt als optionaler Upgrade-Pfad sichtbar');
});

test('Statusmodell berichtet vorhandene Konfiguration ohne Moodle-Token auszugeben', () => {
  const baseDir = makeTmpDir();
  const workspacePath = path.join(baseDir, 'Kurspilot');
  const secretToken = 'geheimes-token-darf-nicht-im-status-stehen';

  const status = buildSetupStatus({
    homeDir: baseDir,
    detectClients: () => ({ codex: true, claude: false }),
    readCredentials: () => ({ url: 'https://moodle.example.test', token: secretToken }),
    readWorkspaceSetting: () => ({
      ok: true,
      status: 'configured',
      configPath: path.join(baseDir, 'workspace-config.json'),
      contextRoot: workspacePath,
    }),
    getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
  });

  assert.deepStrictEqual(status.detectedClients, { codex: true, claude: false });
  assert.deepStrictEqual(status.workspace, {
    configured: true,
    path: workspacePath,
    status: 'configured',
  });
  assert.deepStrictEqual(status.moodle, {
    url: 'https://moodle.example.test',
    tokenPresent: true,
  });
  assert.strictEqual(status.kurspilotRepairRequired, false);
  assert.ok(!JSON.stringify(status).includes(secretToken), 'Token darf nicht im Statusmodell stehen');
});

test('defaultGetClientSetupStatus meldet needsRepair fuer claude, wenn ~/.claude.json kein kurspilot-core hat (Issue #112-Folgefehler)', () => {
  const homeDir = makeTmpDir();
  const claudeDesktopConfigPath = getClaudeDesktopConfigPath(homeDir);
  fs.mkdirSync(path.dirname(claudeDesktopConfigPath), { recursive: true });
  fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify({ mcpServers: { 'kurspilot-core': {} } }));
  // ~/.claude.json fehlt komplett - Claude Code wurde nie konfiguriert.

  const status = defaultGetClientSetupStatus({ codex: false, claude: true }, { homeDir });

  assert.strictEqual(status.claude.needsRepair, true);
});

test('defaultGetClientSetupStatus meldet kein needsRepair, wenn sowohl claude_desktop_config.json als auch ~/.claude.json kurspilot-core enthalten', () => {
  const homeDir = makeTmpDir();
  const claudeDesktopConfigPath = getClaudeDesktopConfigPath(homeDir);
  fs.mkdirSync(path.dirname(claudeDesktopConfigPath), { recursive: true });
  fs.writeFileSync(claudeDesktopConfigPath, JSON.stringify({ mcpServers: { 'kurspilot-core': {} } }));
  fs.writeFileSync(getClaudeCodeConfigPath(homeDir), JSON.stringify({ mcpServers: { 'kurspilot-core': {} } }));

  const status = defaultGetClientSetupStatus({ codex: false, claude: true }, { homeDir });

  assert.strictEqual(status.claude.needsRepair, false);
});

test('Statusmodell meldet laufendes Claude nur, wenn Claude auch erkannt wurde', () => {
  const baseDir = makeTmpDir();
  const baseOptions = {
    homeDir: baseDir,
    readCredentials: () => null,
    readWorkspaceSetting: () => null,
    getClientSetupStatus: () => ({ codex: { needsRepair: false }, claude: { needsRepair: false } }),
  };

  const runningButNotDetected = buildSetupStatus({
    ...baseOptions,
    detectClients: () => ({ codex: false, claude: false }),
    isClaudeRunning: () => true,
  });
  assert.strictEqual(runningButNotDetected.claudeRunning, false);

  const detectedAndRunning = buildSetupStatus({
    ...baseOptions,
    detectClients: () => ({ codex: false, claude: true }),
    isClaudeRunning: () => true,
  });
  assert.strictEqual(detectedAndRunning.claudeRunning, true);

  const detectedAndNotRunning = buildSetupStatus({
    ...baseOptions,
    detectClients: () => ({ codex: false, claude: true }),
    isClaudeRunning: () => false,
  });
  assert.strictEqual(detectedAndNotRunning.claudeRunning, false);
});

// --- Plattformabhaengige Prozess-Erkennung (Issue #112) ---------------------

test('defaultIsClaudeDesktopRunning erkennt Windows-Prozess ueber injizierten Fake-tasklist-Aufruf', () => {
  const calls = [];
  const fakeExecFileSync = (command, args) => {
    calls.push({ command, args });
    return 'Image Name                     PID Session Name        Session#    Mem Usage\r\nclaude.exe                  1234 Console                    1     50.000 K\r\n';
  };

  const result = defaultIsClaudeDesktopRunning({ platform: 'win32', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, true);
  assert.strictEqual(calls[0].command, 'tasklist');
  assert.deepStrictEqual(calls[0].args, ['/FI', 'IMAGENAME eq claude.exe']);
});

test('defaultIsClaudeDesktopRunning meldet Windows-Prozess als nicht laufend, wenn tasklist keine Treffer liefert', () => {
  const fakeExecFileSync = () => 'INFO: Es wurden keine Aufgaben mit den angegebenen Kriterien gefunden.\r\n';

  const result = defaultIsClaudeDesktopRunning({ platform: 'win32', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, false);
});

test('defaultIsClaudeDesktopRunning erkennt macOS-App ueber injizierten Fake-osascript-Aufruf', () => {
  const calls = [];
  const fakeExecFileSync = (command, args) => {
    calls.push({ command, args });
    return 'true\n';
  };

  const result = defaultIsClaudeDesktopRunning({ platform: 'darwin', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, true);
  assert.strictEqual(calls[0].command, 'osascript');
  // Issue #96-Folgefehler (zweiter Live-Test-Befund): sowohl "pgrep -x Claude"
  // als auch der nachgebesserte "pgrep -f Claude.app/.../Claude" verfehlten
  // das echte, laufende Claude.app auf einem Testgeraet - der p_comm-Name
  // scheint dort nicht zuverlaessig vorhersagbar. "application X is running"
  // fragt stattdessen ueber Launch Services ab, wie macOS Apps selbst
  // identifiziert (kein p_comm-Pattern-Matching mehr), ohne Automation-/
  // Accessibility-Freigabe noetig zu haben (kein "tell application System
  // Events"-Block).
  assert.deepStrictEqual(calls[0].args, ['-e', 'application "Claude" is running']);
});

test('defaultIsClaudeDesktopRunning meldet macOS-App als nicht laufend, wenn osascript "false" liefert', () => {
  const fakeExecFileSync = () => 'false\n';

  const result = defaultIsClaudeDesktopRunning({ platform: 'darwin', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, false);
});

test('defaultIsClaudeDesktopRunning meldet macOS-App als nicht laufend, wenn osascript fehlschlaegt', () => {
  const fakeExecFileSync = () => {
    throw new Error('osascript: Fehler');
  };

  const result = defaultIsClaudeDesktopRunning({ platform: 'darwin', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, false);
});

test('defaultEndClaudeDesktop beendet ueber plattformabhaengigen Fake-Befehl und meldet Erfolg', () => {
  const winCalls = [];
  const winResult = defaultEndClaudeDesktop({
    platform: 'win32',
    execFileSync: (command, args) => {
      winCalls.push({ command, args });
      return '';
    },
  });
  assert.strictEqual(winResult, true);
  assert.strictEqual(winCalls[0].command, 'taskkill');
  assert.deepStrictEqual(winCalls[0].args, ['/IM', 'claude.exe', '/F', '/T']);

  const macCalls = [];
  const macResult = defaultEndClaudeDesktop({
    platform: 'darwin',
    execFileSync: (command, args) => {
      macCalls.push({ command, args });
      return '';
    },
  });
  assert.strictEqual(macResult, true);
  assert.strictEqual(macCalls[0].command, 'killall');
  assert.deepStrictEqual(macCalls[0].args, ['Claude']);
});

test('defaultEndClaudeDesktop meldet false statt zu werfen, wenn der Fake-Befehl fehlschlaegt', () => {
  const result = defaultEndClaudeDesktop({
    platform: 'win32',
    execFileSync: () => {
      throw new Error('Prozess nicht gefunden');
    },
  });
  assert.strictEqual(result, false);
});

// --- Codex-Prozess-Erkennung/Beenden (Issue #96-Folgefehler) ---------------

test('defaultIsCodexRunning erkennt Windows-Prozess ueber injizierten Fake-tasklist-Aufruf', () => {
  const calls = [];
  const fakeExecFileSync = (command, args) => {
    calls.push({ command, args });
    return `Image Name                     PID Session Name        Session#    Mem Usage\r\n${CODEX_WINDOWS_EXECUTABLE}                   1234 Console                    1     50.000 K\r\n`;
  };

  const result = defaultIsCodexRunning({ platform: 'win32', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, true);
  assert.strictEqual(calls[0].command, 'tasklist');
  assert.deepStrictEqual(calls[0].args, []);
});

test('defaultIsCodexRunning erkennt unter Windows auch den Legacy-Prozessnamen', () => {
  const fakeExecFileSync = () => `Image Name                     PID Session Name        Session#    Mem Usage\r\n${LEGACY_CODEX_WINDOWS_EXECUTABLE}                   1234 Console                    1     50.000 K\r\n`;

  const result = defaultIsCodexRunning({ platform: 'win32', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, true);
});

test('defaultIsCodexRunning meldet macOS-App als nicht laufend, wenn beide osascript-Aufrufe "false" liefern', () => {
  const calls = [];
  const fakeExecFileSync = (command, args) => {
    calls.push({ command, args });
    return 'false\n';
  };

  const result = defaultIsCodexRunning({ platform: 'darwin', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, false);
  assert.deepStrictEqual(calls.map(call => call.command), ['osascript', 'osascript']);
  assert.deepStrictEqual(calls.map(call => call.args), [
    ['-e', `application "${CODEX_DESKTOP_APP_NAME}" is running`],
    ['-e', `application "${LEGACY_CODEX_DESKTOP_APP_NAME}" is running`],
  ]);
});

test('defaultIsCodexRunning meldet macOS-App als nicht laufend, wenn osascript fehlschlaegt', () => {
  const fakeExecFileSync = () => {
    throw new Error('osascript: Fehler');
  };

  const result = defaultIsCodexRunning({ platform: 'darwin', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, false);
});

test('defaultIsCodexRunning erkennt macOS-App ueber injizierten Fake-osascript-Aufruf', () => {
  const calls = [];
  const fakeExecFileSync = (command, args) => {
    calls.push({ command, args });
    return 'true\n';
  };

  const result = defaultIsCodexRunning({ platform: 'darwin', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, true);
  assert.strictEqual(calls[0].command, 'osascript');
  assert.deepStrictEqual(calls[0].args, ['-e', `application "${CODEX_DESKTOP_APP_NAME}" is running`]);
});

test('defaultIsCodexRunning faellt auf Legacy-Codex.app zurueck, wenn ChatGPT nicht laeuft', () => {
  const calls = [];
  const fakeExecFileSync = (command, args) => {
    calls.push({ command, args });
    return calls.length === 1 ? 'false\n' : 'true\n';
  };

  const result = defaultIsCodexRunning({ platform: 'darwin', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, true);
  assert.deepStrictEqual(calls.map(call => call.args), [
    ['-e', `application "${CODEX_DESKTOP_APP_NAME}" is running`],
    ['-e', `application "${LEGACY_CODEX_DESKTOP_APP_NAME}" is running`],
  ]);
});

test('defaultEndCodex beendet ueber plattformabhaengigen Fake-Befehl und meldet Erfolg', () => {
  const winCalls = [];
  const winResult = defaultEndCodex({
    platform: 'win32',
    execFileSync: (command, args) => {
      winCalls.push({ command, args });
      return '';
    },
  });
  assert.strictEqual(winResult, true);
  assert.deepStrictEqual(winCalls, [
    { command: 'taskkill', args: ['/IM', CODEX_WINDOWS_EXECUTABLE, '/F', '/T'] },
    { command: 'taskkill', args: ['/IM', LEGACY_CODEX_WINDOWS_EXECUTABLE, '/F', '/T'] },
  ]);

  const macCalls = [];
  const macResult = defaultEndCodex({
    platform: 'darwin',
    execFileSync: (command, args) => {
      macCalls.push({ command, args });
      return '';
    },
  });
  assert.strictEqual(macResult, true);
  assert.deepStrictEqual(macCalls, [
    { command: 'killall', args: [CODEX_DESKTOP_APP_NAME] },
    { command: 'killall', args: [LEGACY_CODEX_DESKTOP_APP_NAME] },
  ]);
});

test('defaultEndCodex meldet true, wenn wenigstens einer der Zielprozesse beendet wurde', () => {
  const calls = [];
  const result = defaultEndCodex({
    platform: 'win32',
    execFileSync: (command, args) => {
      calls.push({ command, args });
      if (args[1] === CODEX_WINDOWS_EXECUTABLE) {
        throw new Error('Prozess nicht gefunden');
      }
      return '';
    },
  });
  assert.strictEqual(result, true);
  assert.strictEqual(calls.length, 2);
});

test('defaultEndCodex meldet false statt zu werfen, wenn beide Zielbefehle fehlschlagen', () => {
  const result = defaultEndCodex({
    platform: 'win32',
    execFileSync: () => {
      throw new Error('Prozess nicht gefunden');
    },
  });
  assert.strictEqual(result, false);
});

test('defaultWaitForClaudeToExit wartet, bis isClaudeRunning false meldet, statt sofort zurueckzukehren', async () => {
  const sleepCalls = [];
  let remainingRunningChecks = 3;
  const result = await defaultWaitForClaudeToExit({
    isClaudeRunning: () => {
      remainingRunningChecks -= 1;
      return remainingRunningChecks >= 0;
    },
    sleep: ms => {
      sleepCalls.push(ms);
      return Promise.resolve();
    },
  });

  assert.strictEqual(result, true);
  assert.strictEqual(sleepCalls.length, 3);
});

test('defaultWaitForClaudeToExit gibt nach maxAttempts auf und meldet den letzten Status', async () => {
  const result = await defaultWaitForClaudeToExit({
    isClaudeRunning: () => true,
    maxAttempts: 2,
    sleep: () => Promise.resolve(),
  });

  assert.strictEqual(result, false);
});

// --- Neustart als Opt-in nach dem Speichern (Issue #130) --------------------

test('defaultRestartClaudeDesktop beendet, wartet auf Prozessende und startet danach ueber Fake-open neu (macOS)', async () => {
  const launchCalls = [];
  let claudeRunning = true;
  const endCalls = [];

  const result = await defaultRestartClaudeDesktop({
    platform: 'darwin',
    endClaudeDesktop: () => {
      endCalls.push(true);
      claudeRunning = false;
      return true;
    },
    waitForClaudeToExit: async ({ isClaudeRunning }) => !isClaudeRunning(),
    isClaudeRunning: () => claudeRunning,
    launch: (command, args) => {
      launchCalls.push({ command, args });
    },
  });

  assert.strictEqual(result, true);
  assert.strictEqual(endCalls.length, 1);
  assert.strictEqual(launchCalls[0].command, 'open');
  assert.deepStrictEqual(launchCalls[0].args, ['-a', 'Claude']);
});

test('defaultRestartClaudeDesktop faellt unter Windows ohne gefundene exe auf "claude.exe" zurueck', async () => {
  const launchCalls = [];

  const result = await defaultRestartClaudeDesktop({
    platform: 'win32',
    endClaudeDesktop: () => true,
    waitForClaudeToExit: async () => true,
    existsSync: () => false,
    launch: (command, args) => {
      launchCalls.push({ command, args });
    },
  });

  assert.strictEqual(result, true);
  assert.strictEqual(launchCalls[0].command, 'cmd');
  assert.deepStrictEqual(launchCalls[0].args, ['/c', 'start', '', 'claude.exe']);
});

test('defaultRestartClaudeDesktop startet unter Windows die gefundene Claude.exe (Issue #129)', async () => {
  const launchCalls = [];
  const localAppData = path.join('fake', 'AppData', 'Local');
  const expectedExePath = path.join(localAppData, 'AnthropicClaude', 'Claude.exe');

  const result = await defaultRestartClaudeDesktop({
    platform: 'win32',
    localAppData,
    endClaudeDesktop: () => true,
    waitForClaudeToExit: async () => true,
    existsSync: candidate => candidate === expectedExePath,
    launch: (command, args) => {
      launchCalls.push({ command, args });
    },
  });

  assert.strictEqual(result, true);
  assert.strictEqual(launchCalls[0].command, 'cmd');
  assert.deepStrictEqual(launchCalls[0].args, ['/c', 'start', '', expectedExePath]);
});

test('defaultRestartClaudeDesktop meldet false statt zu werfen, wenn der Fake-Start fehlschlaegt', async () => {
  const result = await defaultRestartClaudeDesktop({
    platform: 'darwin',
    endClaudeDesktop: () => true,
    waitForClaudeToExit: async () => true,
    launch: () => {
      throw new Error('open nicht gefunden');
    },
  });

  assert.strictEqual(result, false);
});

test('Codex-Erkennung findet die lokale Codex-CLI auch ausserhalb des Prozess-PATH', () => {
  const homeDir = makeTmpDir();
  const localBin = path.join(homeDir, '.local', 'bin');
  const codexPath = path.join(localBin, 'codex');
  fs.mkdirSync(localBin, { recursive: true });
  fs.writeFileSync(codexPath, '#!/bin/sh\n');
  fs.chmodSync(codexPath, 0o755);

  assert.strictEqual(defaultDetectClients({ homeDir, pathEnv: '' }).codex, true);
});

function statusFromBits({ hasUrl, hasToken, workspaceConfigured, hasClient, repairRequired }) {
  return {
    moodle: {
      url: hasUrl ? 'https://moodle.example.test' : null,
      tokenPresent: hasToken,
    },
    workspace: {
      configured: workspaceConfigured,
      path: workspaceConfigured ? '/Users/test/Kurspilot' : null,
      status: workspaceConfigured ? 'configured' : 'missing',
    },
    detectedClients: { codex: hasClient, claude: false, opencode: false },
    kurspilotRepairRequired: repairRequired,
  };
}

test('isMinimumConfigured Wahrheitstabelle: genau dann wahr, wenn alle 5 Mindestbedingungen erfuellt sind', () => {
  // Alle 2^5 Kombinationen; Erwartung unabhaengig vom Code aus den Eingabebits.
  for (let bits = 0; bits < 32; bits += 1) {
    const hasUrl = Boolean(bits & 1);
    const hasToken = Boolean(bits & 2);
    const workspaceConfigured = Boolean(bits & 4);
    const hasClient = Boolean(bits & 8);
    const repairRequired = Boolean(bits & 16);
    const status = statusFromBits({ hasUrl, hasToken, workspaceConfigured, hasClient, repairRequired });
    const expected = hasUrl && hasToken && workspaceConfigured && hasClient && !repairRequired;
    assert.strictEqual(isMinimumConfigured(status), expected, `Kombination ${bits}`);
  }
});

test('isMinimumConfigured: jede einzelne fehlende Bedingung kippt das Ergebnis (notwendige Bedingungen)', () => {
  const full = statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: true, hasClient: true, repairRequired: false });
  assert.strictEqual(isMinimumConfigured(full), true);

  assert.strictEqual(isMinimumConfigured(statusFromBits({ hasUrl: false, hasToken: true, workspaceConfigured: true, hasClient: true, repairRequired: false })), false, 'Moodle-URL fehlt');
  assert.strictEqual(isMinimumConfigured(statusFromBits({ hasUrl: true, hasToken: false, workspaceConfigured: true, hasClient: true, repairRequired: false })), false, 'Moodle-Token fehlt');
  assert.strictEqual(isMinimumConfigured(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: false, hasClient: true, repairRequired: false })), false, 'Arbeitsbereich fehlt');
  assert.strictEqual(isMinimumConfigured(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: true, hasClient: false, repairRequired: false })), false, 'kein Client erkannt');
  assert.strictEqual(isMinimumConfigured(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: true, hasClient: true, repairRequired: true })), false, 'Reparatur erforderlich');
});

test('isMinimumConfigured: jeder erkannte Client (Codex/Claude/opencode) zaehlt als Mindest-Client', () => {
  const base = {
    moodle: { url: 'https://moodle.example.test', tokenPresent: true },
    workspace: { configured: true, path: '/Users/test/Kurspilot', status: 'configured' },
    kurspilotRepairRequired: false,
  };
  assert.strictEqual(isMinimumConfigured({ ...base, detectedClients: { codex: true, claude: false, opencode: false } }), true);
  assert.strictEqual(isMinimumConfigured({ ...base, detectedClients: { codex: false, claude: true, opencode: false } }), true);
  assert.strictEqual(isMinimumConfigured({ ...base, detectedClients: { codex: false, claude: false, opencode: true } }), true);
  assert.strictEqual(isMinimumConfigured({ ...base, detectedClients: { codex: false, claude: false, opencode: false } }), false);
});

test('computeSetupProgress liefert {done, total} ueber alle 6 Schritte inkl. tautologischem Schritt 0 (#229)', () => {
  assert.deepStrictEqual(
    computeSetupProgress(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: true, hasClient: true, repairRequired: false })),
    { done: 6, total: 6 }
  );
  // URL + Token fehlen, Reparatur noetig -> nur Arbeitsbereich + Client + Schritt 0 erfuellt.
  assert.deepStrictEqual(
    computeSetupProgress(statusFromBits({ hasUrl: false, hasToken: false, workspaceConfigured: true, hasClient: true, repairRequired: true })),
    { done: 3, total: 6 }
  );
  // ponytail: Schritt 0 ist tautologisch -> selbst bei 0/5 echten Bedingungen immer 1/6.
  assert.deepStrictEqual(
    computeSetupProgress(statusFromBits({ hasUrl: false, hasToken: false, workspaceConfigured: false, hasClient: false, repairRequired: true })),
    { done: 1, total: 6 }
  );
});

test('computeSetupProgress Wahrheitstabelle: done ist Anzahl erfuellter Bedingungen + tautologischer Schritt 0 (#229)', () => {
  for (let bits = 0; bits < 32; bits += 1) {
    const hasUrl = Boolean(bits & 1);
    const hasToken = Boolean(bits & 2);
    const workspaceConfigured = Boolean(bits & 4);
    const hasClient = Boolean(bits & 8);
    const repairRequired = Boolean(bits & 16);
    const status = statusFromBits({ hasUrl, hasToken, workspaceConfigured, hasClient, repairRequired });
    const expectedDone = 1 + [hasUrl, hasToken, workspaceConfigured, hasClient, !repairRequired].filter(Boolean).length;
    assert.deepStrictEqual(computeSetupProgress(status), { done: expectedDone, total: 6 }, `Kombination ${bits}`);
  }
});

test('Invariante: isMinimumConfigured ist genau dann wahr, wenn der Fortschritt vollstaendig ist', () => {
  for (let bits = 0; bits < 32; bits += 1) {
    const hasUrl = Boolean(bits & 1);
    const hasToken = Boolean(bits & 2);
    const workspaceConfigured = Boolean(bits & 4);
    const hasClient = Boolean(bits & 8);
    const repairRequired = Boolean(bits & 16);
    const status = statusFromBits({ hasUrl, hasToken, workspaceConfigured, hasClient, repairRequired });
    const progress = computeSetupProgress(status);
    assert.strictEqual(isMinimumConfigured(status), progress.done === progress.total, `Kombination ${bits}`);
  }
});

test('computeSetupProgress: bei Programmstart ohne Konfiguration mindestens 1/6 (#229)', () => {
  const empty = statusFromBits({ hasUrl: false, hasToken: false, workspaceConfigured: false, hasClient: false, repairRequired: true });
  const progress = computeSetupProgress(empty);
  assert.ok(progress.done >= 1, 'Schritt 0 ist tautologisch erfuellt');
  assert.strictEqual(progress.total, 6);
});

test('nextOpenCondition bildet jede erste offene Bedingung auf Card und Nutzerlabel ab (#230)', () => {
  assert.deepStrictEqual(
    nextOpenCondition(statusFromBits({ hasUrl: false, hasToken: true, workspaceConfigured: true, hasClient: true, repairRequired: false })),
    { cardId: 'moodle', label: 'Moodle-URL' }
  );
  assert.deepStrictEqual(
    nextOpenCondition(statusFromBits({ hasUrl: true, hasToken: false, workspaceConfigured: true, hasClient: true, repairRequired: false })),
    { cardId: 'moodle', label: 'Moodle-Token' }
  );
  assert.deepStrictEqual(
    nextOpenCondition(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: false, hasClient: true, repairRequired: false })),
    { cardId: 'workspace', label: 'Arbeitsordner' }
  );
  assert.deepStrictEqual(
    nextOpenCondition(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: true, hasClient: false, repairRequired: false })),
    { cardId: 'clients', label: 'KI-Clients' }
  );
  assert.deepStrictEqual(
    nextOpenCondition(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: true, hasClient: true, repairRequired: true })),
    { cardId: 'clients', label: 'KI-Clients einrichten' }
  );
});

test('nextOpenCondition nennt bei mehreren offenen Bedingungen die erste in Bedingungsreihenfolge (#230)', () => {
  assert.deepStrictEqual(
    nextOpenCondition(statusFromBits({ hasUrl: false, hasToken: false, workspaceConfigured: false, hasClient: false, repairRequired: true })),
    { cardId: 'moodle', label: 'Moodle-URL' },
    'fehlende URL kommt vor fehlendem Token'
  );
  assert.deepStrictEqual(
    nextOpenCondition(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: false, hasClient: false, repairRequired: true })),
    { cardId: 'workspace', label: 'Arbeitsordner' },
    'Arbeitsordner kommt vor Clients und Reparatur'
  );
});

test('nextOpenCondition liefert null, sobald alle Bedingungen erfuellt sind (#230)', () => {
  assert.strictEqual(
    nextOpenCondition(statusFromBits({ hasUrl: true, hasToken: true, workspaceConfigured: true, hasClient: true, repairRequired: false })),
    null
  );
});

test('Invariante: nextOpenCondition ist genau dann null, wenn der Fortschritt vollstaendig ist (#230)', () => {
  for (let bits = 0; bits < 32; bits += 1) {
    const status = statusFromBits({
      hasUrl: Boolean(bits & 1),
      hasToken: Boolean(bits & 2),
      workspaceConfigured: Boolean(bits & 4),
      hasClient: Boolean(bits & 8),
      repairRequired: Boolean(bits & 16),
    });
    const progress = computeSetupProgress(status);
    assert.strictEqual(nextOpenCondition(status) === null, progress.done === progress.total, `Kombination ${bits}`);
  }
});

// --- Client-Installationsblocker --------------------------------------------

test('kein Client erkannt: Blocker mit Install-Links, kein Setup ausgefuehrt', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: noClientsDetected });

  const report = runSetupFlow({
    selectedClients: [],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(report.blocked, true);
  assert.deepStrictEqual(report.detectedClients, { codex: false, claude: false, opencode: false });
  assert.deepStrictEqual(report.installLinks, INSTALL_LINKS);
  assert.strictEqual(report.proceeded, false);

  assert.strictEqual(stubs.calls.setCredentials.length, 0);
  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 0);
  assert.strictEqual(stubs.calls.setupCodexConfig.length, 0);
  assert.strictEqual(stubs.calls.installSkills.length, 0);
  assert.ok(!fs.existsSync(path.join(baseDir, 'Kurspilot')), 'Arbeitsbereich darf nicht angelegt werden');
});

test('Blocker-Report verraet weder Status noch Bestaetigung des Re-Check-Wegs ohne erneuten Aufruf', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: noClientsDetected });

  const firstReport = runSetupFlow({
    selectedClients: [],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });
  assert.strictEqual(firstReport.blocked, true);

  // Re-Check-Pfad: erneuter Aufruf mit jetzt erkannten Clients funktioniert normal weiter.
  const recheckStubs = makeStubs(baseDir, { detectClients: bothClientsDetected });
  const secondReport = runSetupFlow({
    selectedClients: ['codex'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...recheckStubs,
  });
  assert.strictEqual(secondReport.blocked, false);
  assert.strictEqual(secondReport.proceeded, true);
});

test('Blocker-Installationslinks fallen auf die offiziellen Links inkl. opencode zurueck (Issue #183)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: noClientsDetected });

  const report = runSetupFlow({
    selectedClients: [],
    ...stubs,
    installLinks: undefined,
  });

  assert.strictEqual(report.blocked, true);
  assert.deepStrictEqual(report.installLinks, OFFICIAL_INSTALL_LINKS);
  assert.strictEqual(report.installLinks.opencode, 'https://opencode.ai');
});

// --- Client-Auswahl respektiert ---------------------------------------------

test('beide Clients erkannt, nur Codex gewaehlt: nur Codex bekommt Config/Skills', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(report.blocked, false);
  assert.strictEqual(report.proceeded, true);
  assert.deepStrictEqual(report.configuredClients, ['codex']);

  assert.strictEqual(stubs.calls.setupCodexConfig.length, 1);
  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 0);
  assert.strictEqual(stubs.calls.installSkills.length, 1);
  assert.strictEqual(stubs.calls.installSkills[0][1], '.agents/skills');
});

test('beide Clients erkannt und gewaehlt: beide bekommen Config/Skills', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex', 'claude'],
    sharedSkillStorage: false, // Grundtest fuer Copy-Modus (beide bekommen separate Kopie)
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.deepStrictEqual(report.configuredClients.sort(), ['claude', 'codex']);
  assert.strictEqual(stubs.calls.setupCodexConfig.length, 1);
  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 1);
  assert.strictEqual(stubs.calls.installSkills.length, 2);
});

// --- Claude laeuft bereits: Schreiben laeuft trotzdem, nur Hinweis (Issue #130) ---

test('Claude laeuft bereits: Config wird trotzdem geschrieben, Report meldet nur den Laufzeit-Hinweis', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { isClaudeRunning: () => true });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex', 'claude'],
    sharedSkillStorage: false, // Test prueft Copy-Modus; Alias-Modus wird in Issue-#165-Tests getestet
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 1, 'muss auch bei laufendem Claude schreiben (Issue #130)');
  assert.deepStrictEqual(report.configuredClients.sort(), ['claude', 'codex']);
  assert.strictEqual(report.claudeWasRunningDuringSave, true);
  assert.strictEqual(report.claudeRunningBlocked, undefined, 'Blockier-Feld aus #112 darf nicht mehr existieren');

  // Codex bleibt davon unberuehrt.
  assert.strictEqual(stubs.calls.setupCodexConfig.length, 1);
  assert.strictEqual(stubs.calls.installSkills.length, 2);
});

test('Codex laeuft beim Speichern: Config wird trotzdem geschrieben, Bericht meldet codexWasRunningDuringSave (Issue #96-Folgefehler)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { isCodexRunning: () => true });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex', 'claude'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(stubs.calls.setupCodexConfig.length, 1, 'muss auch bei laufendem Codex schreiben');
  assert.strictEqual(report.codexWasRunningDuringSave, true);
  assert.strictEqual(report.claudeWasRunningDuringSave, false);
});

test('Claude laeuft nicht (mehr): Config wird normal geschrieben, kein Laufzeit-Hinweis im Report', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { isClaudeRunning: () => false });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['claude'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 1);
  assert.deepStrictEqual(report.configuredClients, ['claude']);
  assert.strictEqual(report.claudeWasRunningDuringSave, false);
});

test('Client claude schreibt zusaetzlich ~/.claude.json (Issue #112-Folgefehler: lokale Code-Sessions lesen von dort)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { isClaudeRunning: () => false });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  runSetupFlow({
    selectedClients: ['claude'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(stubs.calls.setupClaudeCodeConfig.length, 1);
  const [configPath] = stubs.calls.setupClaudeCodeConfig[0];
  assert.match(configPath, /\.claude\.json$/);
});

test('nicht erkannter, aber ausgewaehlter Client wird ignoriert (keine Config fuer nicht erkannten Client)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, {
    detectClients: () => ({ codex: true, claude: false }),
  });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex', 'claude'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.deepStrictEqual(report.configuredClients, ['codex']);
  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 0);
  assert.strictEqual(stubs.calls.installSkills.length, 1);
});

// --- Arbeitsbereich-Ort ------------------------------------------------------

test('Arbeitsbereich-Ort Default ist nur Vorschlag, solange ihn niemand bestaetigt', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const fakeHome = path.join(baseDir, 'home');
  fs.mkdirSync(fakeHome, { recursive: true });

  const report = runSetupFlow({
    selectedClients: ['codex'],
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    homeDir: fakeHome,
    ...stubs,
  });

  const expectedDefault = path.join(fakeHome, 'Documents', 'Kurspilot');
  assert.strictEqual(report.workspacePath, null);
  assert.strictEqual(report.suggestedWorkspacePath, expectedDefault);
  assert.strictEqual(report.workspaceSettingSaved, false);
  assert.strictEqual(stubs.calls.writeWorkspaceSetting.length, 0);
  assert.ok(!fs.existsSync(expectedDefault));
});

test('Arbeitsbereich-Ort wird fuer einen Cloud-/Custom-Pfad gespeichert und angelegt', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const customPath = path.join(baseDir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Schule', 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex'],
    workspacePath: customPath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(report.workspacePath, customPath);
  assert.strictEqual(report.workspaceSettingSaved, true);
  assert.ok(fs.existsSync(customPath));
  assert.deepStrictEqual(stubs.calls.writeWorkspaceSetting, [[customPath, { homeDir: os.homedir() }]]);
});

test('vorhandener Arbeitsbereich-Ort wird nicht beschaedigt (idempotent)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const workspacePath = path.join(baseDir, 'Kurspilot');
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'marker.txt'), 'bleibt erhalten');

  runSetupFlow({
    selectedClients: ['codex'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(fs.readFileSync(path.join(workspacePath, 'marker.txt'), 'utf8'), 'bleibt erhalten');
});

// --- Token-Schutz -------------------------------------------------------------

test('Token landet nicht im Statusobjekt, nur ein Ja/Nein-Hinweis', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const secretToken = 'super-geheimes-token-xyz';

  const report = runSetupFlow({
    selectedClients: ['codex'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    moodleUrl: 'https://moodle.example.test',
    moodleToken: secretToken,
    ...stubs,
  });

  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(secretToken), 'Token darf nicht im Report stehen');
  assert.strictEqual(report.credentialsSaved, true);
  assert.strictEqual(stubs.calls.setCredentials[0].token, secretToken);
});

test('ohne Moodle-URL/Token: credentialsSaved ist false, Flow laeuft trotzdem weiter', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);

  const report = runSetupFlow({
    selectedClients: ['codex'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  assert.strictEqual(report.credentialsSaved, false);
  assert.strictEqual(stubs.calls.setCredentials.length, 0);
  assert.strictEqual(report.proceeded, true);
});

test('ausgewaehlte Moodle-URL-Aenderung behaelt vorhandenen Token bei', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, {
    readCredentials: () => ({ url: 'https://alt.example.test', token: 'bestehender-token' }),
  });

  const report = runSetupFlow({
    selectedMaintenanceAreaIds: ['moodle-url-change'],
    selectedClients: ['codex'],
    moodleUrl: 'https://neu.example.test',
    ...stubs,
  });

  assert.deepStrictEqual(stubs.calls.setCredentials, [
    { url: 'https://neu.example.test', token: 'bestehender-token' },
  ]);
  assert.deepStrictEqual(report.executedSteps, ['Moodle-URL geändert']);
  assert.strictEqual(stubs.calls.setupCodexConfig.length, 0);
  assert.strictEqual(stubs.calls.writeWorkspaceSetting.length, 0);
  assert.ok(!JSON.stringify(report).includes('bestehender-token'));
});

test('Moodle-Zugangsdaten-Aenderung markiert laufende Clients fuer Neustart-Hinweis', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, {
    detectClients: () => ({ codex: true, claude: true }),
    readCredentials: () => ({ url: 'https://alt.example.test', token: 'bestehender-token' }),
    isCodexRunning: () => true,
    isClaudeRunning: () => false,
  });

  const report = runSetupFlow({
    selectedMaintenanceAreaIds: ['moodle-token-renewal'],
    moodleToken: 'neuer-token',
    ...stubs,
  });

  assert.strictEqual(report.credentialsSaved, true);
  assert.strictEqual(report.codexWasRunningDuringSave, true);
  assert.strictEqual(report.claudeWasRunningDuringSave, false);
});

test('ausgewaehlte Arbeitsbereich-Aenderung speichert nur bestaetigte Zielordner', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const workspacePath = path.join(baseDir, 'Kurspilot-neu');

  const unconfirmed = runSetupFlow({
    selectedMaintenanceAreaIds: ['workspace-change'],
    workspacePath,
    workspaceSelectionConfirmed: false,
    ...stubs,
  });

  assert.strictEqual(unconfirmed.workspacePath, null);
  assert.strictEqual(unconfirmed.workspaceSettingSaved, false);
  assert.strictEqual(stubs.calls.writeWorkspaceSetting.length, 0);
  assert.ok(!fs.existsSync(workspacePath));

  const confirmed = runSetupFlow({
    selectedMaintenanceAreaIds: ['workspace-change'],
    workspacePath,
    workspaceSelectionConfirmed: true,
    ...stubs,
  });

  assert.strictEqual(confirmed.workspacePath, workspacePath);
  assert.strictEqual(confirmed.workspaceSettingSaved, true);
  assert.deepStrictEqual(confirmed.executedSteps, ['Arbeitsbereich geändert']);
  assert.ok(fs.existsSync(workspacePath));
});

// --- ImageMagick-Installation (Windows) --------------------------------------

test('ausgewaehlte ImageMagick-Installation ruft den Installer auf und vermerkt den Schritt', () => {
  const baseDir = makeTmpDir();
  const installCalls = [];
  const stubs = makeStubs(baseDir, {
    isImageMagickAvailable: () => false,
    installImageMagick: () => {
      installCalls.push(true);
      return { installed: true, error: null };
    },
  });

  const report = runSetupFlow({
    selectedMaintenanceAreaIds: ['imagemagick-install'],
    ...stubs,
  });

  assert.strictEqual(installCalls.length, 1);
  assert.deepStrictEqual(report.executedSteps, ['ImageMagick installiert']);
  assert.strictEqual(report.imageMagickWarning, null);
});

test('ImageMagick bereits installiert: Auswahl repariert/installiert per force neu, statt nichts zu tun (#142)', () => {
  const baseDir = makeTmpDir();
  const installCalls = [];
  const stubs = makeStubs(baseDir, {
    isImageMagickAvailable: () => true,
    installImageMagick: (installOptions) => {
      installCalls.push(installOptions);
      return { installed: true, error: null };
    },
  });

  const report = runSetupFlow({
    selectedMaintenanceAreaIds: ['imagemagick-install'],
    ...stubs,
  });

  assert.strictEqual(installCalls.length, 1, 'Label "neu installieren/reparieren" (#138) muss auch tatsaechlich etwas tun');
  assert.strictEqual(installCalls[0].force, true, 'muss force uebergeben, sonst tut "brew install" bei vorhandener Formula nichts');
  assert.deepStrictEqual(report.executedSteps, ['ImageMagick neu installiert/repariert']);
});

test('fehlschlagende ImageMagick-Installation wird als Warnung gemeldet, blockiert aber den uebrigen Flow nicht', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, {
    isImageMagickAvailable: () => false,
    installImageMagick: () => ({ installed: false, error: 'winget nicht gefunden' }),
  });

  const report = runSetupFlow({
    selectedMaintenanceAreaIds: ['imagemagick-install', 'workspace-change'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    workspaceSelectionConfirmed: true,
    ...stubs,
  });

  assert.deepStrictEqual(report.executedSteps, ['Arbeitsbereich geändert']);
  assert.match(report.imageMagickWarning, /winget nicht gefunden/);
  assert.strictEqual(report.proceeded, true);
});

test('ImageMagick-Installation nicht ausgewaehlt: kein Installationsaufruf', () => {
  const baseDir = makeTmpDir();
  const installCalls = [];
  const stubs = makeStubs(baseDir, {
    isImageMagickAvailable: () => false,
    installImageMagick: () => {
      installCalls.push(true);
      return { installed: true, error: null };
    },
  });

  runSetupFlow({
    selectedMaintenanceAreaIds: ['workspace-change'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    workspaceSelectionConfirmed: true,
    ...stubs,
  });

  assert.strictEqual(installCalls.length, 0);
});

test('cropBackendChoice "imagemagick" wird persistiert (#140, dedizierter Schalter statt Checkbox)', () => {
  const baseDir = makeTmpDir();
  const writeCalls = [];
  const stubs = makeStubs(baseDir);

  const report = runSetupFlow({
    cropBackendChoice: 'imagemagick',
    writeCropBackendPreference: (preference, options) => {
      writeCalls.push({ preference, options });
      return { configPath: '/fake/config.json', cropBackend: preference };
    },
    ...stubs,
  });

  assert.deepStrictEqual(writeCalls.map(call => call.preference), ['imagemagick']);
  assert.ok(report.executedSteps.some(step => /ImageMagick/.test(step)));
});

test('cropBackendChoice "sips" wird persistiert (#140)', () => {
  const baseDir = makeTmpDir();
  const writeCalls = [];
  const stubs = makeStubs(baseDir);

  runSetupFlow({
    cropBackendChoice: 'sips',
    workspacePath: path.join(baseDir, 'Kurspilot'),
    workspaceSelectionConfirmed: true,
    writeCropBackendPreference: (preference, options) => {
      writeCalls.push({ preference, options });
      return { configPath: '/fake/config.json', cropBackend: preference };
    },
    ...stubs,
  });

  assert.deepStrictEqual(writeCalls.map(call => call.preference), ['sips']);
});

test('ohne cropBackendChoice wird keine Praeferenz geschrieben (Schalter war nicht sichtbar/wurde nicht abgeschickt) (#140)', () => {
  const baseDir = makeTmpDir();
  const writeCalls = [];
  const stubs = makeStubs(baseDir);

  runSetupFlow({
    selectedMaintenanceAreaIds: ['workspace-change'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    workspaceSelectionConfirmed: true,
    writeCropBackendPreference: (preference, options) => {
      writeCalls.push({ preference, options });
      return { configPath: '/fake/config.json', cropBackend: preference };
    },
    ...stubs,
  });

  assert.deepStrictEqual(writeCalls, []);
});

// --- Komposition statt Duplikation -------------------------------------------

test('Flow ruft setupCodexConfig/setupClaudeDesktopConfig und installSkillsForProvider mit erwarteten Pfaden auf', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const workspacePath = path.join(baseDir, 'Kurspilot');

  runSetupFlow({
    selectedClients: ['codex', 'claude'],
    sharedSkillStorage: false, // Test prueft Copy-Modus (Kompositions-Pfade)
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(stubs.calls.setupCodexConfig.length, 1);
  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 1);
  assert.strictEqual(stubs.calls.installSkills.length, 2);
  const providerRoots = stubs.calls.installSkills.map(args => args[1]).sort();
  assert.deepStrictEqual(providerRoots, ['.agents/skills', '.claude/skills']);
});

test('Flow reicht selectedActivityIds an setupCodexConfig/setupClaudeDesktopConfig/setupClaudeCodeConfig weiter (Issue #96)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: () => ({ codex: true, claude: true }) });

  runSetupFlow({
    selectedClients: ['codex', 'claude'],
    selectedActivityIds: ['quiz'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(stubs.calls.setupCodexConfig.length, 1);
  assert.deepStrictEqual(stubs.calls.setupCodexConfig[0][3], { selectedActivityIds: ['quiz'] });
  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 1);
  assert.strictEqual(stubs.calls.setupClaudeCodeConfig.length, 1);
  assert.deepStrictEqual(stubs.calls.setupClaudeCodeConfig[0][3], { selectedActivityIds: ['quiz'] });
});

test('Flow gibt Warnungen bei lokal veraenderten verwalteten Skills strukturiert zurueck', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, {
    detectClients: () => ({ codex: true, claude: false }),
    installSkillsForProvider: (...args) => {
      stubs.calls.installSkills.push(args);
      return {
        targetRoot: args[2],
        written: [],
        unchanged: [],
        aborted: true,
        conflicts: ['kurspilot/SKILL.md'],
        warnings: ['Verwalteter Kurspilot-Skill lokal verändert: kurspilot/SKILL.md.'],
      };
    },
  });

  const result = runSetupFlow({
    selectedClients: ['codex'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  assert.strictEqual(result.skillInstallAborted, true);
  assert.deepStrictEqual(result.skillInstallConflicts, ['kurspilot/SKILL.md']);
  assert.deepStrictEqual(result.skillInstallWarnings, [
    'Codex: Verwalteter Kurspilot-Skill lokal verändert: kurspilot/SKILL.md.',
  ]);
  assert.deepStrictEqual(result.configuredClients, []);
});

test('executedSteps nennen pro Client, ob Skills aktualisiert wurden, statt nur "Kurspilot eingerichtet/repariert"', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, {
    detectClients: () => ({ codex: true, claude: true }),
    installSkillsForProvider: (...args) => {
      stubs.calls.installSkills.push(args);
      const isCodex = args[2].includes(`${path.sep}.agents${path.sep}`);
      return isCodex
        ? { targetRoot: args[2], written: ['kurspilot/SKILL.md', 'kurspilot-planen/SKILL.md'], unchanged: [] }
        : { targetRoot: args[2], written: [], unchanged: ['kurspilot/SKILL.md'] };
    },
  });

  const result = runSetupFlow({
    selectedClients: ['codex', 'claude'],
    sharedSkillStorage: false, // Test prueft Copy-Modus (aktualisiert vs. aktuell)
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  assert.deepStrictEqual(result.configuredClients, ['codex', 'claude']);
  assert.ok(result.executedSteps.includes('Codex eingerichtet/repariert'));
  assert.ok(result.executedSteps.includes('Codex: Skills aktualisiert (2)'));
  assert.ok(result.executedSteps.includes('Claude eingerichtet/repariert'));
  assert.ok(result.executedSteps.includes('Claude: Skills bereits aktuell'));
  assert.ok(!result.executedSteps.includes('Kurspilot eingerichtet/repariert'));
});

test('executedSteps listen aktive und deaktivierte Aktivitaeten explizit auf (Issue #96-Folgefehler)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: () => ({ codex: true, claude: false }) });

  const result = runSetupFlow({
    selectedClients: ['codex'],
    selectedActivityIds: ['page', 'quiz'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  assert.ok(result.executedSteps.includes('Aktive Aktivitäten: Textseite, Test, Fragensammlung'));
  assert.ok(result.executedSteps.includes('Deaktivierte Aktivitäten: Textfeld, URL, Datei, Verzeichnis, Abstimmung, Aufgabe, Forum'));
});

// --- Verknuepfung "Kurspilot konfigurieren" (Issue #132) --------------------

test('Flow erzeugt/aktualisiert die Verknuepfung "Kurspilot konfigurieren" bei jedem nicht blockierten Lauf', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(report.blocked, false);
  assert.strictEqual(stubs.calls.installConfiguratorShortcut.length, 1);
  const call = stubs.calls.installConfiguratorShortcut[0];
  assert.strictEqual(call.nodePath, process.execPath);
  assert.ok(call.appPath, 'erwartet appPath fuer die Verknuepfung');
  assert.strictEqual(report.configuratorShortcutPath, '/fake/shortcut');
});

test('Flow erzeugt die Verknuepfung auch ohne ausgewaehlte Clients (reine Reparatur/Status-Pruefung)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const workspacePath = path.join(baseDir, 'Kurspilot');

  runSetupFlow({
    selectedClients: [],
    workspacePath,
    ...stubs,
  });

  assert.strictEqual(stubs.calls.installConfiguratorShortcut.length, 1);
});

test('Flow erzeugt KEINE Verknuepfung, wenn kein Client erkannt wurde (Blocker)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: noClientsDetected });

  runSetupFlow({
    selectedClients: [],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  assert.strictEqual(stubs.calls.installConfiguratorShortcut.length, 0);
});

test('Flow meldet Verknuepfungsfehler als Warnung statt den gesamten Lauf abzubrechen', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, {
    installConfiguratorShortcut: () => {
      throw new Error('Plattform nicht unterstuetzt');
    },
  });

  const report = runSetupFlow({
    selectedClients: ['codex'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(report.blocked, false);
  assert.strictEqual(report.proceeded, true);
  assert.strictEqual(report.configuratorShortcutPath, null);
  assert.match(report.configuratorShortcutWarning, /Plattform nicht unterstuetzt/);
});

// --- Gemeinsame Skill-Ablage (Issue #165) ------------------------------------

test('sharedSkillStorage true: Claude erhaelt Alias auf Codex-Ablage bei beiden Clients', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);

  const report = runSetupFlow({
    selectedMaintenanceAreaIds: ['kurspilot-setup-or-repair'],
    selectedClients: ['codex', 'claude'],
    sharedSkillStorage: true,
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  assert.strictEqual(report.blocked, false);
  // Codex: normale Kopie; Claude: Alias
  assert.strictEqual(stubs.calls.installSkills.length, 1, 'Codex erhaelt Kopie');
  assert.strictEqual(stubs.calls.installSkillsAlias.length, 1, 'Claude erhaelt Alias');
  const [aliasCanonical, aliasTarget] = stubs.calls.installSkillsAlias[0];
  assert.match(aliasCanonical, /\.agents[\\/]skills$/);
  assert.match(aliasTarget, /\.claude[\\/]skills$/);
});

test('sharedSkillStorage false: Claude erhaelt eigene Kopie auch bei beiden Clients', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);

  const report = runSetupFlow({
    selectedMaintenanceAreaIds: ['kurspilot-setup-or-repair'],
    selectedClients: ['codex', 'claude'],
    sharedSkillStorage: false,
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  assert.strictEqual(report.blocked, false);
  assert.strictEqual(stubs.calls.installSkills.length, 2, 'Beide Clients erhalten separate Kopien');
  assert.strictEqual(stubs.calls.installSkillsAlias.length, 0, 'Kein Alias-Aufruf');
});

test('sharedSkillStorage default true: nur ein Client ausgewaehlt → kein Alias-Modus', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);

  const report = runSetupFlow({
    selectedMaintenanceAreaIds: ['kurspilot-setup-or-repair'],
    selectedClients: ['codex'],
    // sharedSkillStorage nicht uebergeben → default true, aber kein zweiter Client
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  assert.strictEqual(report.blocked, false);
  assert.strictEqual(stubs.calls.installSkills.length, 1, 'Codex bekommt Kopie');
  assert.strictEqual(stubs.calls.installSkillsAlias.length, 0, 'Kein Alias ohne zweiten Client');
});

// --- opencode End-to-End (Issue #184) ----------------------------------------

test('opencode erkannt und gewaehlt: Config wird geschrieben und Skills installiert (E2E, DI-Spiegel)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: onlyOpenCodeDetected });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['opencode'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(report.blocked, false);
  assert.strictEqual(report.proceeded, true);
  assert.deepStrictEqual(report.configuredClients, ['opencode']);
  assert.strictEqual(stubs.calls.setupOpenCodeConfig.length, 1);
  assert.strictEqual(stubs.calls.setupCodexConfig.length, 0);
  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 0);
  assert.strictEqual(stubs.calls.installSkills.length, 1);
  assert.strictEqual(stubs.calls.installSkills[0][1], '.opencode/skills');
});

test('opencode nicht erkannt, aber gewaehlt: wird ignoriert (keine Config)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: bothClientsDetected });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex', 'opencode'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.deepStrictEqual(report.configuredClients, ['codex']);
  assert.strictEqual(stubs.calls.setupOpenCodeConfig.length, 0);
});

test('nur opencode erkannt: Blocker bleibt aus, Flow laeuft (anyClientDetected inkl. opencode)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: onlyOpenCodeDetected });

  const report = runSetupFlow({
    selectedClients: ['opencode'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(report.blocked, false);
  assert.strictEqual(report.proceeded, true);
});

test('opencode: Aktivitaetsauswahl wirkt auf alle drei MCP-Server (core, fragensammlung, quiz)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: onlyOpenCodeDetected });

  runSetupFlow({
    selectedClients: ['opencode'],
    selectedActivityIds: ['quiz'],
    workspacePath: path.join(baseDir, 'Kurspilot'),
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(stubs.calls.setupOpenCodeConfig.length, 1);
  assert.deepStrictEqual(stubs.calls.setupOpenCodeConfig[0][3], { selectedActivityIds: ['quiz'] });
});

test('opencode: Config-Pfad ist plattformabhaengig (macOS/Linux vs. Windows, Stub)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: onlyOpenCodeDetected });

  runSetupFlow({
    selectedClients: ['opencode'],
    homeDir: baseDir,
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  const [configPath] = stubs.calls.setupOpenCodeConfig[0];
  assert.strictEqual(configPath, path.join(baseDir, '.config', 'opencode', 'opencode.json'));
});

test('alle drei Clients erkannt und gewaehlt: alle bekommen Config/Skills', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: allClientsDetected });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex', 'claude', 'opencode'],
    sharedSkillStorage: false,
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.deepStrictEqual(report.configuredClients.sort(), ['claude', 'codex', 'opencode']);
  assert.strictEqual(stubs.calls.setupCodexConfig.length, 1);
  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 1);
  assert.strictEqual(stubs.calls.setupOpenCodeConfig.length, 1);
  assert.strictEqual(stubs.calls.installSkills.length, 3);
});

test('opencode: Skills werden unter ~/.agents/skills installiert (skillTargetRoot aus Registry)', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { detectClients: onlyOpenCodeDetected });

  runSetupFlow({
    selectedClients: ['opencode'],
    homeDir: baseDir,
    workspacePath: path.join(baseDir, 'Kurspilot'),
    ...stubs,
  });

  const [, , targetRoot] = stubs.calls.installSkills[0];
  assert.strictEqual(targetRoot, path.join(baseDir, '.agents', 'skills'));
});
