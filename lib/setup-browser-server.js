'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

const {
  buildSetupStatus,
  computeSetupProgress,
  nextOpenCondition,
  defaultEndClaudeDesktop,
  defaultEndCodex,
  defaultWorkspacePath,
  runSetupFlow,
} = require('./setup-flow');
const updateCheck = require('./update-check');
const defaultCheckAppUpdate = updateCheck.checkAppUpdate;
const defaultCheckImageMagickUpdate = updateCheck.checkImageMagickUpdate;
const defaultApplyAppUpdate = updateCheck.applyAppUpdate;
const defaultApplyImageMagickUpdate = updateCheck.applyImageMagickUpdate;
const {
  TOKEN_HELP_ASSET_URL,
  CLOSE_TAB_HINT,
  SUCCESS_NOTICE_STYLE,
  renderMaintenancePage,
  renderSuccessNotice,
} = require('./setup-render');
const {
  defaultRuntimeStatePath,
  writeRuntimeState,
  readRuntimeState,
  removeRuntimeState,
} = require('./setup-server-state');
const { runUninstallFlow } = require('./uninstall-flow');

const MAINTENANCE_CARD_IDS = new Set(['moodle', 'workspace', 'clients', 'activities', 'crop-backend', 'version']);

const LOCAL_HOST = '127.0.0.1';
const TOKEN_HELP_ASSET_PATH = path.join(__dirname, '..', 'assets', 'setup', 'token-help.svg');
// Der offene Tab pollt /health alle vier Sekunden. Bleibt dieses Signal zwei
// Minuten aus (z.B. weil der Tab geschlossen wurde), darf der Dienst enden.
const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_FIRST_REQUEST_TIMEOUT_MS = 60 * 1000;
const WORKSPACE_DIALOG_TIMEOUT_MS = 8000;
// Deckt Oeffnen und Durchklicken in einem Rutsch ab (ein execFileSync-Timeout
// fuer den gesamten Vorgang, keine getrennte Phase fuers Oeffnen).
const WORKSPACE_DIALOG_TIMEOUT_MS_WIN32 = 140000;
const TOKEN_ERROR_MESSAGE = 'Ungueltiges oder fehlendes Token. Bitte die URL aus dem Terminal verwenden.';

function defaultGenerateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

function formValue(form, name) {
  const value = form.get(name);
  return value ? String(value) : undefined;
}

function finishAndClose(res, statusCode, contentType, body, close) {
  res.writeHead(statusCode, {
    'content-type': contentType,
    connection: 'close',
  });
  res.end(body, () => {
    close();
  });
}

function rejectMissingToken(res) {
  res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`${TOKEN_ERROR_MESSAGE}\n`);
}

function matchRoute(routes, method, pathname) {
  return routes.find(route => route.method === method && route.path === pathname);
}

function defaultOpenBrowser(url) {
  if (process.env.KURSPILOT_NO_BROWSER === '1') {
    return;
  }

  let child;
  if (process.platform === 'darwin') {
    child = execFile('open', [url], { stdio: 'ignore' });
    child.on('error', () => {});
    return;
  }

  if (process.platform === 'win32') {
    child = execFile('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
    child.on('error', () => {});
    return;
  }

  child = execFile('xdg-open', [url], { stdio: 'ignore' });
  child.on('error', () => {});
}

function defaultIsPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: Prozess existiert, gehoert aber einem anderen Benutzer.
    return error.code === 'EPERM';
  }
}

function defaultCheckHealth(healthUrl) {
  return new Promise(resolve => {
    const req = http.get(healthUrl, { timeout: 1500 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => {
      resolve(false);
    });
  });
}

function defaultStopServer(url) {
  return new Promise(resolve => {
    const source = new URL(url);
    const target = new URL('/abort', source);
    target.search = source.search;
    const req = http.request(target, { method: 'POST' }, res => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', resolve);
    req.end();
  });
}

function defaultChooseWorkspaceFolder(currentPath, options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const execFileSyncFn = options.execFileSync || execFileSync;
  const platform = options.platform || process.platform;
  const timeout = options.dialogTimeoutMs || WORKSPACE_DIALOG_TIMEOUT_MS;
  const defaultLocation = currentPath && fs.existsSync(currentPath)
    ? currentPath
    : (currentPath ? path.dirname(currentPath) : defaultWorkspacePath(homeDir));

  try {
    if (platform === 'darwin') {
      const script = [
        `set defaultFolder to POSIX file ${JSON.stringify(defaultLocation)}`,
        'try',
        '  return POSIX path of (choose folder with prompt "Kurspilot-Arbeitsbereich wählen" default location defaultFolder)',
        'on error errorMessage number errorNumber',
        '  if errorNumber is -128 then return ""',
        '  return "ERROR:" & errorMessage',
        'end try',
      ].join('\n');
      const selected = execFileSyncFn('osascript', ['-e', script], { encoding: 'utf8', timeout }).trim();
      if (selected.startsWith('ERROR:')) {
        return { workspacePath: null, confirmed: false, error: selected.slice('ERROR:'.length).trim() };
      }
      return { workspacePath: selected || null, confirmed: Boolean(selected) };
    }

    if (platform === 'win32') {
      // Ohne Owner-Fenster oeffnet FolderBrowserDialog.ShowDialog() im Hintergrund
      // hinter dem Browserfenster (kein sichtbares Fenster, PowerShell haengt in
      // ShowDialog() fest, Lehrkraft sieht nur den grauen Button). Ein unsichtbares,
      // TopMost-Owner-Fenster erzwingt den Vordergrund fuer den Dialog.
      const command = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
        `$dialog.SelectedPath = ${JSON.stringify(defaultLocation)};`,
        '$owner = New-Object System.Windows.Forms.Form;',
        '$owner.TopMost = $true;',
        '$owner.ShowInTaskbar = $false;',
        '$owner.WindowState = "Minimized";',
        '$owner.Show();',
        '$owner.Hide();',
        '$result = $dialog.ShowDialog($owner);',
        '$owner.Close();',
        'if ($result -eq "OK") { $dialog.SelectedPath }',
      ].join(' ');
      const winTimeout = options.dialogTimeoutMs || WORKSPACE_DIALOG_TIMEOUT_MS_WIN32;
      const selected = execFileSyncFn('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', timeout: winTimeout }).trim();
      return { workspacePath: selected || null, confirmed: Boolean(selected) };
    }

    for (const command of ['zenity', 'kdialog']) {
      try {
        const args = command === 'zenity'
          ? ['--file-selection', '--directory', '--filename', defaultLocation]
          : ['--getexistingdirectory', defaultLocation];
        const selected = execFileSyncFn(command, args, { encoding: 'utf8' }).trim();
        return { workspacePath: selected || null, confirmed: Boolean(selected) };
      } catch {
        // try next local dialog helper
      }
    }
  } catch (err) {
    if (err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      return {
        workspacePath: null,
        confirmed: false,
        error: 'Ordnerdialog wurde von macOS nicht geöffnet. Pfad bitte direkt ins Textfeld eintragen.',
      };
    }
    return { workspacePath: null, confirmed: false, error: err.message };
  }

  return { workspacePath: null, confirmed: false };
}

function renderLaunchPage(token) {
  const openTarget = token ? `/?token=${token}` : '/';
  return (
    '<!DOCTYPE html>\n' +
    '<html lang="de"><head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>Kurspilot konfigurieren</title>\n' +
    '<style>\n' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;' +
    'margin:0;background:#f5f5f5;color:#333}\n' +
    '.box{text-align:center;max-width:400px;padding:2rem}\n' +
    'p{color:#555;margin-bottom:1.5rem}\n' +
    'button{font-size:1rem;padding:.75rem 1.5rem;cursor:pointer;' +
    'background:#0078d4;color:white;border:none;border-radius:4px}\n' +
    'button:hover{background:#106ebe}\n' +
    `${SUCCESS_NOTICE_STYLE}\n` +
    '</style></head><body>\n' +
    '<div class="box">\n' +
    '<div id="blocked">\n' +
    '<h1>Kurspilot konfigurieren</h1>\n' +
    '<p>Bitte klicken, um das Konfigurationsfenster zu öffnen.</p>\n' +
    '<button onclick="openSetup()">Konfigurieren öffnen</button>\n' +
    '</div>\n' +
    renderSuccessNotice('Geöffnet', [
      'Kurspilot konfigurieren läuft im anderen Tab.',
      CLOSE_TAB_HINT,
    ], { id: 'success', hidden: true }) +
    '</div>\n' +
    '<script>\n' +
    'function openSetup(){\n' +
    `  var w=window.open(${JSON.stringify(openTarget)},"_blank");\n` +
    '  if(w){\n' +
    '    document.getElementById("blocked").style.display="none";\n' +
    '    document.getElementById("success").hidden=false;\n' +
    '  }\n' +
    '}\n' +
    '(function(){\n' +
    `  var w=window.open(${JSON.stringify(openTarget)},"_blank");\n` +
    '  if(w){\n' +
    '    document.getElementById("blocked").style.display="none";\n' +
    '    document.getElementById("success").hidden=false;\n' +
    '  }\n' +
    '}());\n' +
    '<\/script>\n' +
    '</body></html>\n'
  );
}

function renderFinishedPage(title, lines) {
  return (
    '<!DOCTYPE html>\n' +
    '<html lang="de"><head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>Kurspilot konfigurieren</title>\n' +
    '<style>\n' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;' +
    'margin:0;background:#f5f5f5;color:#333}\n' +
    '.box{max-width:400px;padding:2rem;width:100%}\n' +
    `${SUCCESS_NOTICE_STYLE}\n` +
    '</style></head><body>\n' +
    '<div class="box">\n' +
    renderSuccessNotice(title, lines) +
    '</div>\n' +
    '</body></html>\n'
  );
}

function startSetupBrowserServer(options = {}) {
  const {
    host = LOCAL_HOST,
    port = 0,
    openBrowser = defaultOpenBrowser,
    chooseWorkspaceFolder = defaultChooseWorkspaceFolder,
    startMode = 'default',
    statusOptions = {},
    flowOptions = {},
    endClaudeDesktop = defaultEndClaudeDesktop,
    endCodex = defaultEndCodex,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    firstRequestTimeoutMs = DEFAULT_FIRST_REQUEST_TIMEOUT_MS,
    updateOptions = {},
    generateToken = defaultGenerateToken,
    runtimeStatePath = null,
    uninstallFlow = runUninstallFlow,
  } = options;
  const checkAppUpdate = updateOptions.checkAppUpdate || defaultCheckAppUpdate;
  const checkImageMagickUpdate = updateOptions.checkImageMagickUpdate || defaultCheckImageMagickUpdate;
  const applyAppUpdate = updateOptions.applyAppUpdate || defaultApplyAppUpdate;
  const applyImageMagickUpdate = updateOptions.applyImageMagickUpdate || defaultApplyImageMagickUpdate;
  const endClientHandlers = { codex: endCodex, claude: endClaudeDesktop };
  const token = generateToken();

  let resolveClosed;
  let closeStarted = false;
  let idleTimer = null;
  let sawFirstRequest = false;
  // ponytail: In-Memory-Zustand fuer die asynchrone ImageMagick-Installation
  // (#234). Kein eigenes Modul noetig - lebt nur fuer die Server-Lebensdauer.
  let cropInstallState = { status: 'idle', error: null };
  // ponytail: In-Memory-Flag fuer das Erfolgsbanner (#231) - Closure-Variable
  // wie cropInstallState, Reset nur per Prozessneustart. Wird true, sobald der
  // Fortschritt in dieser Session erstmals unter dem Maximum lag; die
  // Wartungs-Ansicht zeigt dann bei 6/6 das Banner statt eines leeren Zustands.
  let wasIncompleteDuringSession = false;
  const closed = new Promise(resolve => {
    resolveClosed = resolve;
  });

  function refreshIdleTimeout() {
    const timeoutMs = sawFirstRequest ? idleTimeoutMs : firstRequestTimeoutMs;
    if (!timeoutMs) {
      return;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      close(sawFirstRequest ? 'idle-timeout' : 'no-browser-connection');
    }, timeoutMs);
    if (typeof idleTimer.unref === 'function') {
      idleTimer.unref();
    }
  }

  // ponytail: nur noch eine Ansicht — immer Wartungsseite (#237)
  function handleRoot(req, res) {
    const status = buildSetupStatus(statusOptions);
    const progress = computeSetupProgress(status);
    if (progress.done < progress.total) {
      wasIncompleteDuringSession = true;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderMaintenancePage(status, {
      installState: cropInstallState,
      progress,
      nextCondition: nextOpenCondition(status),
      wasIncomplete: wasIncompleteDuringSession,
    }));
  }

  // Issue #236: "Einstellungen zuruecksetzen" aus dem Footer der Wartungs-Ansicht.
  // Ruft die vorhandene nicht-interaktive Deinstallations-Routine mit ihrer
  // heutigen Semantik auf (Zugangsdaten, MCP-Eintraege, Skills entfernen; der
  // Arbeitsordner bleibt unangetastet) und setzt die Erfolgsbanner-Flag zurueck,
  // damit die abgesenkte Fortschrittsanzeige nach dem Neuladen ruhig steht.
  function handleResetSettings(req, res) {
    let report;
    try {
      report = uninstallFlow();
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: `Einstellungen zurücksetzen fehlgeschlagen: ${error.message}` }));
      return;
    }
    wasIncompleteDuringSession = false;
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, ...report }));
  }

  function handleRestartClient(req, res) {
    readRequestBody(req).then(body => {
      const form = new URLSearchParams(body);
      const client = form.get('client');
      // Issue #205: opencode laedt MCP-Server bei jedem neuen Chat frisch - kein
      // Prozess-Neustart noetig. Expliziter Guard statt No-Op-Handler in
      // endClientHandlers (Spec 0005 S5).
      if (client === 'opencode') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ done: true, kind: 'notice' }));
        return;
      }
      if (client !== 'codex' && client !== 'claude') {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'unbekannter Client' }));
        return;
      }
      Promise.resolve(endClientHandlers[client]()).then(() => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ done: true, kind: 'button' }));
      });
    });
  }

  function applyMoodle(req, res) {
    readRequestBody(req).then(body => {
      const form = new URLSearchParams(body);
      const report = runSetupFlow({
        ...flowOptions,
        selectedMaintenanceAreaIds: ['moodle-url-change', 'moodle-token-renewal'],
        moodleUrl: formValue(form, 'moodleUrl'),
        moodleToken: formValue(form, 'moodleToken'),
      });
      if (report.blocked) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'kein Client erkannt' }));
        return;
      }
      const newStatus = buildSetupStatus(statusOptions);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, restartRequired: [], newStatus }));
    }).catch(error => {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    });
  }

  function applyWorkspace(req, res) {
    readRequestBody(req).then(body => {
      const form = new URLSearchParams(body);
      const workspacePath = formValue(form, 'workspacePath');
      const report = runSetupFlow({
        ...flowOptions,
        selectedMaintenanceAreaIds: ['workspace-change'],
        workspacePath,
        workspaceSelectionConfirmed: Boolean(workspacePath),
      });
      if (report.blocked) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'kein Client erkannt' }));
        return;
      }
      const newStatus = buildSetupStatus(statusOptions);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, restartRequired: [], newStatus }));
    }).catch(error => {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    });
  }

  function applyCropBackend(req, res) {
    readRequestBody(req).then(body => {
      const form = new URLSearchParams(body);
      const cropBackend = formValue(form, 'cropBackend');
      const installImageMagick = formValue(form, 'installImageMagick') === '1';

      // ponytail: macOS-Installation (Homebrew) laeuft asynchron im
      // Kindprozess, damit der Event-Loop fuer das Polling frei bleibt (#234).
      // Windows bleibt beim bisherigen synchronen Weg.
      if (installImageMagick) {
        const currentStatus = buildSetupStatus(statusOptions);
        const isMacOS = Boolean(currentStatus.imageMagick && currentStatus.imageMagick.sipsActive);
        if (isMacOS) {
          if (cropInstallState.status !== 'running') {
            cropInstallState = { status: 'running', error: null };
            const installScript =
              `const { installImageMagick } = require(${JSON.stringify(path.join(__dirname, 'imagemagick-setup.js'))});` +
              'const r = installImageMagick({ force: true });' +
              'process.stdout.write(JSON.stringify(r));';
            execFile(process.execPath, ['-e', installScript], (err, stdout) => {
              if (err) {
                cropInstallState = { status: 'failed', error: err.message };
                return;
              }
              try {
                const result = JSON.parse(stdout);
                cropInstallState = result.installed
                  ? { status: 'success', error: null }
                  : { status: 'failed', error: result.error || 'Installation fehlgeschlagen' };
              } catch {
                cropInstallState = { status: 'failed', error: 'Unerwartete Antwort vom Installationsprozess' };
              }
            });
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, installing: true }));
          return;
        }
      }

      const report = runSetupFlow({
        ...flowOptions,
        selectedMaintenanceAreaIds: installImageMagick ? ['imagemagick-install'] : [],
        cropBackendChoice: cropBackend,
      });
      if (report.blocked) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'kein Client erkannt' }));
        return;
      }
      if (installImageMagick && report.imageMagickWarning) {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: report.imageMagickWarning }));
        return;
      }
      const newStatus = buildSetupStatus(statusOptions);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, restartRequired: [], newStatus }));
    }).catch(error => {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    });
  }

  function applyClients(req, res) {
    readRequestBody(req).then(body => {
      const form = new URLSearchParams(body);
      const selectedClients = form.getAll('client');
      const report = runSetupFlow({
        ...flowOptions,
        selectedMaintenanceAreaIds: ['kurspilot-setup-or-repair'],
        selectedClients,
        // ponytail: <2 Clients → undefined → Serverdefault true; >=2 → Checkbox-Wert (#233)
        sharedSkillStorage: selectedClients.length >= 2 ? form.get('sharedSkillStorage') === '1' : undefined,
      });
      if (report.blocked) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'kein Client erkannt' }));
        return;
      }
      // Issue #205: Neustart-Hinweis pro betroffenem Client. Codex/Claude liefen
      // beim Speichern -> Neustart-Button (kind:'button'); opencode konfiguriert ->
      // reiner Hinweis (kind:'notice'), da opencode MCP bei jedem Chat frisch laedt.
      const restartRequired = [
        ...(report.codexWasRunningDuringSave ? [{ client: 'codex', kind: 'button' }] : []),
        ...(report.claudeWasRunningDuringSave ? [{ client: 'claude', kind: 'button' }] : []),
        ...(report.configuredClients.includes('opencode') ? [{ client: 'opencode', kind: 'notice' }] : []),
      ];
      const newStatus = buildSetupStatus(statusOptions);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, restartRequired, newStatus }));
    }).catch(error => {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    });
  }

  function applyActivities(req, res) {
    readRequestBody(req).then(body => {
      const form = new URLSearchParams(body);
      const report = runSetupFlow({
        ...flowOptions,
        selectedMaintenanceAreaIds: ['kurspilot-setup-or-repair'],
        selectedClients: ['codex', 'claude', 'opencode'],
        selectedActivityIds: form.getAll('activity'),
      });
      if (report.blocked) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'kein Client erkannt' }));
        return;
      }
      const restartRequired = [
        ...(report.codexWasRunningDuringSave ? [{ client: 'codex', kind: 'button' }] : []),
        ...(report.claudeWasRunningDuringSave ? [{ client: 'claude', kind: 'button' }] : []),
        ...(report.configuredClients.includes('opencode') ? [{ client: 'opencode', kind: 'notice' }] : []),
      ];
      const newStatus = buildSetupStatus(statusOptions);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, restartRequired, newStatus }));
    }).catch(error => {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    });
  }

  function handleApplyCard(req, res, requestUrl) {
    const cardId = requestUrl.pathname.split('/')[2];
    if (!MAINTENANCE_CARD_IDS.has(cardId)) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'unbekannte Karte' }));
      return;
    }
    if (cardId === 'moodle') {
      applyMoodle(req, res);
      return;
    }
    if (cardId === 'workspace') {
      applyWorkspace(req, res);
      return;
    }
    if (cardId === 'clients') {
      applyClients(req, res);
      return;
    }
    if (cardId === 'activities') {
      applyActivities(req, res);
      return;
    }
    if (cardId === 'crop-backend') {
      applyCropBackend(req, res);
      return;
    }
    res.writeHead(501, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'noch nicht implementiert' }));
  }

  function handleFavicon(req, res) {
    res.writeHead(204);
    res.end();
  }

  function handleInstallStatus(req, res) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(cropInstallState));
  }

  function handleHealth(req, res) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
  }

  function handleTokenHelp(req, res) {
    fs.readFile(TOKEN_HELP_ASSET_PATH, 'utf8', (error, asset) => {
      if (error) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Nicht gefunden.\n');
        return;
      }
      res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8' });
      res.end(asset);
    });
  }

  function handleChooseWorkspace(req, res, requestUrl) {
    const result = chooseWorkspaceFolder(requestUrl.searchParams.get('current') || '');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  }

  function handleCheckUpdates(req, res) {
    Promise.resolve(checkAppUpdate(updateOptions.appUpdateOptions))
      .then(appResult => {
        if (appResult.offline) {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ offline: true, error: appResult.error }));
          return;
        }
        const imageMagickResult = checkImageMagickUpdate(updateOptions.imageMagickUpdateOptions);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          offline: false,
          app: { ...appResult, label: 'Skills/MCP-Server' },
          imageMagick: { ...imageMagickResult, label: 'ImageMagick' },
        }));
      })
      .catch(error => {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ offline: false, error: `Update-Prüfung fehlgeschlagen: ${error.message}` }));
      });
  }

  function handleApplyUpdates(req, res) {
    Promise.resolve(applyAppUpdate(updateOptions.appUpdateOptions))
      .then(async appResult => {
        if (appResult.offline) {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ offline: true, error: appResult.error }));
          return;
        }

        let imageMagickResult = null;
        const imageMagickStatus = checkImageMagickUpdate(updateOptions.imageMagickUpdateOptions);
        if (imageMagickStatus.supported && imageMagickStatus.updateAvailable) {
          imageMagickResult = await applyImageMagickUpdate(updateOptions.imageMagickUpdateOptions);
        }

        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          offline: false,
          installed: appResult.installed,
          skillInstallAborted: Boolean(appResult.skillInstallAborted),
          skillInstallWarnings: appResult.skillInstallWarnings || [],
          skillInstallConflicts: appResult.skillInstallConflicts || [],
          skillInstallConflictPrompts: appResult.skillInstallConflictPrompts || [],
          imageMagick: imageMagickResult,
        }));
      })
      .catch(error => {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ offline: false, error: `Update-Installation fehlgeschlagen: ${error.message}` }));
      });
  }

  function handleAbort(req, res) {
    finishAndClose(
      res,
      200,
      'text/html; charset=utf-8',
      renderFinishedPage('Beendet', [
        'Kurspilot-Konfiguration wurde beendet.',
        CLOSE_TAB_HINT,
      ]),
      close
    );
  }

  function handleLaunch(req, res) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderLaunchPage(token));
  }

  const ROUTES = [
    { method: 'GET', path: '/', handler: handleRoot, requireToken: true },
    { method: 'GET', path: '/health', handler: handleHealth, requireToken: false },
    { method: 'GET', path: '/favicon.ico', handler: handleFavicon, requireToken: false },
    { method: 'GET', path: TOKEN_HELP_ASSET_URL, handler: handleTokenHelp, requireToken: false },
    { method: 'GET', path: '/choose-workspace', handler: handleChooseWorkspace, requireToken: false },
    { method: 'GET', path: '/check-updates', handler: handleCheckUpdates, requireToken: false },
    { method: 'GET', path: '/install-status', handler: handleInstallStatus, requireToken: true },
    { method: 'GET', path: '/launch', handler: handleLaunch, requireToken: true },
    { method: 'POST', path: '/abort', handler: handleAbort, requireToken: true },
    { method: 'POST', path: '/reset-settings', handler: handleResetSettings, requireToken: true },
    { method: 'POST', path: '/restart-client', handler: handleRestartClient, requireToken: true },
    { method: 'POST', path: '/apply-updates', handler: handleApplyUpdates, requireToken: true },
  ];

  const server = http.createServer((req, res) => {
    sawFirstRequest = true;
    refreshIdleTimeout();

    const requestUrl = new URL(req.url, `http://${host}`);

    if (req.method === 'POST' && requestUrl.pathname.startsWith('/apply/')) {
      if (requestUrl.searchParams.get('token') !== token) {
        rejectMissingToken(res);
        return;
      }
      handleApplyCard(req, res, requestUrl);
      return;
    }

    const route = matchRoute(ROUTES, req.method, requestUrl.pathname);
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden.\n');
      return;
    }

    if (route.requireToken && requestUrl.searchParams.get('token') !== token) {
      rejectMissingToken(res);
      return;
    }

    route.handler(req, res, requestUrl);
  });

  function close(reason = 'manual') {
    if (closeStarted) {
      return closed;
    }
    closeStarted = true;
    clearTimeout(idleTimer);
    if (runtimeStatePath) {
      removeRuntimeState(runtimeStatePath);
    }
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(() => {
      resolveClosed(reason);
    });
    return closed;
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const url = `http://${address.address}:${address.port}/?token=${token}`;
      if (runtimeStatePath) {
        writeRuntimeState(runtimeStatePath, {
          pid: process.pid,
          port: address.port,
          token,
        });
      }
      refreshIdleTimeout();
      openBrowser(url);
      resolve({
        close,
        closed,
        server,
        url,
      });
    });
  });
}

async function launchSetupBrowserServer(options = {}) {
  const {
    runtimeStatePath = defaultRuntimeStatePath(),
    isPidAlive = defaultIsPidAlive,
    checkHealth = defaultCheckHealth,
    stopServer = defaultStopServer,
    openBrowser = defaultOpenBrowser,
    ...serverOptions
  } = options;

  const state = readRuntimeState(runtimeStatePath);
  if (state) {
    const url = `http://${LOCAL_HOST}:${state.port}/?token=${state.token}`;
    const healthUrl = `http://${LOCAL_HOST}:${state.port}/health`;
    if (isPidAlive(state.pid) && await checkHealth(healthUrl)) {
      await stopServer(url);
    }
    removeRuntimeState(runtimeStatePath);
  }

  const tool = await startSetupBrowserServer({
    ...serverOptions,
    openBrowser,
    runtimeStatePath,
  });
  return { ...tool, reused: false };
}

module.exports = {
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_FIRST_REQUEST_TIMEOUT_MS,
  startSetupBrowserServer,
  launchSetupBrowserServer,
  defaultChooseWorkspaceFolder,
};
