'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildMaintenanceSelection,
  buildSetupStatus,
  defaultDetectClients,
  defaultIsClaudeDesktopRunning,
  defaultEndClaudeDesktop,
  resolveMaintenanceAreaSelection,
  runSetupFlow,
} = require('../lib/setup-flow');

const INSTALL_LINKS = {
  codex: 'https://openai.com/codex',
  claude: 'https://claude.ai/download',
};

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-setup-flow-test-'));
}

function noClientsDetected() {
  return { codex: false, claude: false };
}

function bothClientsDetected() {
  return { codex: true, claude: true };
}

function makeStubs(baseDir, overrides = {}) {
  const calls = {
    setCredentials: [],
    setupClaudeDesktopConfig: [],
    setupCodexConfig: [],
    installSkills: [],
    writeWorkspaceSetting: [],
  };

  return {
    calls,
    detectClients: overrides.detectClients || bothClientsDetected,
    isClaudeRunning: overrides.isClaudeRunning || (() => false),
    setCredentials: (url, token) => {
      calls.setCredentials.push({ url, token });
    },
    setupClaudeDesktopConfig: (...args) => {
      calls.setupClaudeDesktopConfig.push(args);
      return { created: true, backupPath: null, configPath: args[0] };
    },
    setupCodexConfig: (...args) => {
      calls.setupCodexConfig.push(args);
      return { created: true, backupPath: null, configPath: args[0] };
    },
    installSkillsForProvider: (...args) => {
      calls.installSkills.push(args);
      return { targetRoot: args[2], written: ['fake.md'], unchanged: [] };
    },
    writeWorkspaceSetting: (...args) => {
      calls.writeWorkspaceSetting.push(args);
      return { configPath: path.join(baseDir, 'workspace-config.json'), contextRoot: args[0] };
    },
    installLinks: INSTALL_LINKS,
    ...overrides,
  };
}

// --- Konfigurationsstatus / Wartungsmodell ----------------------------------

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

test('defaultIsClaudeDesktopRunning erkennt macOS-Prozess ueber injizierten Fake-pgrep-Aufruf', () => {
  const calls = [];
  const fakeExecFileSync = (command, args) => {
    calls.push({ command, args });
    return '4321\n';
  };

  const result = defaultIsClaudeDesktopRunning({ platform: 'darwin', execFileSync: fakeExecFileSync });

  assert.strictEqual(result, true);
  assert.strictEqual(calls[0].command, 'pgrep');
  assert.deepStrictEqual(calls[0].args, ['-x', 'Claude']);
});

test('defaultIsClaudeDesktopRunning meldet macOS-Prozess als nicht laufend, wenn pgrep ohne Treffer fehlschlaegt', () => {
  const fakeExecFileSync = () => {
    const error = new Error('pgrep: keine Treffer');
    error.status = 1;
    throw error;
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
  assert.deepStrictEqual(winCalls[0].args, ['/IM', 'claude.exe', '/F']);

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

test('Codex-Erkennung findet die lokale Codex-CLI auch ausserhalb des Prozess-PATH', () => {
  const homeDir = makeTmpDir();
  const localBin = path.join(homeDir, '.local', 'bin');
  const codexPath = path.join(localBin, 'codex');
  fs.mkdirSync(localBin, { recursive: true });
  fs.writeFileSync(codexPath, '#!/bin/sh\n');
  fs.chmodSync(codexPath, 0o755);

  assert.strictEqual(defaultDetectClients({ homeDir, pathEnv: '' }).codex, true);
});

test('Modus und Vorauswahl unterscheiden Ersteinrichtung von Wartung', () => {
  const firstSetup = buildMaintenanceSelection({
    detectedClients: { codex: true, claude: false },
    workspace: { configured: false, path: null, status: 'missing' },
    moodle: { url: null, tokenPresent: false },
    kurspilotRepairRequired: true,
  });

  assert.strictEqual(firstSetup.mode, 'first-setup');
  assert.deepStrictEqual(firstSetup.preselectedAreaIds, [
    'kurspilot-setup-or-repair',
    'moodle-url-change',
    'moodle-token-renewal',
    'workspace-change',
  ]);

  const maintenance = buildMaintenanceSelection({
    detectedClients: { codex: true, claude: true },
    workspace: { configured: true, path: '/Users/test/Kurspilot', status: 'configured' },
    moodle: { url: 'https://moodle.example.test', tokenPresent: false },
    kurspilotRepairRequired: false,
  });

  assert.strictEqual(maintenance.mode, 'maintenance');
  assert.deepStrictEqual(maintenance.preselectedAreaIds, ['moodle-token-renewal']);
});

test('Wartungsbereich-Auswahl erlaubt mehrere Bereiche und enthaelt alle lehrkraftsichtbaren Optionen', () => {
  const selection = buildMaintenanceSelection({
    detectedClients: { codex: true, claude: true },
    workspace: { configured: true, path: '/Users/test/Kurspilot', status: 'configured' },
    moodle: { url: 'https://moodle.example.test', tokenPresent: true },
    kurspilotRepairRequired: false,
  });

  assert.strictEqual(selection.multipleSelectionAllowed, true);
  assert.deepStrictEqual(selection.areas.map(area => area.label), [
    'Kurspilot einrichten/reparieren',
    'Moodle-Token erneuern',
    'Moodle-URL ändern',
    'Arbeitsbereich ändern',
    'Nichts ändern',
  ]);

  assert.deepStrictEqual(
    resolveMaintenanceAreaSelection(['moodle-token-renewal', 'workspace-change']),
    ['moodle-token-renewal', 'workspace-change']
  );
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
  assert.deepStrictEqual(report.detectedClients, { codex: false, claude: false });
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

// --- Claude laeuft bereits: Schreiben blockiert (Issue #112) ----------------

test('Claude laeuft bereits: Config-Schreiben wird blockiert, Report enthaelt klaren Hinweis', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir, { isClaudeRunning: () => true });
  const workspacePath = path.join(baseDir, 'Kurspilot');

  const report = runSetupFlow({
    selectedClients: ['codex', 'claude'],
    workspacePath,
    moodleUrl: 'https://moodle.example.test',
    moodleToken: 'geheimes-token',
    ...stubs,
  });

  assert.strictEqual(stubs.calls.setupClaudeDesktopConfig.length, 0, 'darf nicht schreiben, solange Claude laeuft');
  assert.deepStrictEqual(report.configuredClients, ['codex']);
  assert.strictEqual(report.claudeRunningBlocked, true);
  assert.match(report.claudeRunningWarning, /Claude/);
  assert.match(report.claudeRunningWarning, /laeuft|läuft/);

  // Codex bleibt davon unberuehrt.
  assert.strictEqual(stubs.calls.setupCodexConfig.length, 1);
  assert.strictEqual(stubs.calls.installSkills.length, 1);
});

test('Claude laeuft nicht (mehr): Config wird normal geschrieben, kein Blocker im Report', () => {
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
  assert.strictEqual(report.claudeRunningBlocked, false);
  assert.strictEqual(report.claudeRunningWarning, null);
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

// --- Komposition statt Duplikation -------------------------------------------

test('Flow ruft setupCodexConfig/setupClaudeDesktopConfig und installSkillsForProvider mit erwarteten Pfaden auf', () => {
  const baseDir = makeTmpDir();
  const stubs = makeStubs(baseDir);
  const workspacePath = path.join(baseDir, 'Kurspilot');

  runSetupFlow({
    selectedClients: ['codex', 'claude'],
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
    'Verwalteter Kurspilot-Skill lokal verändert: kurspilot/SKILL.md.',
  ]);
  assert.deepStrictEqual(result.configuredClients, []);
});
