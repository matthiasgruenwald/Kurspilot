'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

const {
  buildMaintenanceSelection,
  buildSetupStatus,
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
  renderSetupPage,
  renderPostSaveActionsPage,
  renderSuccessNotice,
} = require('./setup-render');

const LOCAL_HOST = '127.0.0.1';
const TOKEN_HELP_ASSET_PATH = path.join(__dirname, '..', 'assets', 'setup', 'token-help.svg');
const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const WORKSPACE_DIALOG_TIMEOUT_MS = 8000;

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

function summaryToText(report) {
  if (report.blocked) {
    return 'Kurspilot-Konfiguration wurde nicht ausgeführt: kein Client erkannt.\n';
  }

  const steps = report.executedSteps && report.executedSteps.length > 0
    ? report.executedSteps
    : ['Keine Änderung ausgeführt'];
  const allWarnings = [
    ...(report.imageMagickWarning ? [report.imageMagickWarning] : []),
    ...(report.skillInstallWarnings || []),
  ];
  const warnings = allWarnings.length > 0
    ? `\nWarnungen:\n${allWarnings.map(warning => `- ${warning}`).join('\n')}\n`
    : '';
  return `Ausgeführte Schritte:\n${steps.map(step => `- ${step}`).join('\n')}\n${warnings}`;
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

function defaultOpenBrowser(url) {
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
      const command = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
        `$dialog.SelectedPath = ${JSON.stringify(defaultLocation)};`,
        'if ($dialog.ShowDialog() -eq "OK") { $dialog.SelectedPath }',
      ].join(' ');
      const selected = execFileSyncFn('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim();
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

function renderLaunchPage() {
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
    '  var w=window.open("/","_blank");\n' +
    '  if(w){\n' +
    '    document.getElementById("blocked").style.display="none";\n' +
    '    document.getElementById("success").hidden=false;\n' +
    '  }\n' +
    '}\n' +
    '(function(){\n' +
    '  var w=window.open("/","_blank");\n' +
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
    updateOptions = {},
  } = options;
  const checkAppUpdate = updateOptions.checkAppUpdate || defaultCheckAppUpdate;
  const checkImageMagickUpdate = updateOptions.checkImageMagickUpdate || defaultCheckImageMagickUpdate;
  const applyAppUpdate = updateOptions.applyAppUpdate || defaultApplyAppUpdate;
  const applyImageMagickUpdate = updateOptions.applyImageMagickUpdate || defaultApplyImageMagickUpdate;
  const endClientHandlers = { codex: endCodex, claude: endClaudeDesktop };

  let resolveClosed;
  let closeStarted = false;
  let idleTimer = null;
  let pendingPostSaveClients = new Set();
  const closed = new Promise(resolve => {
    resolveClosed = resolve;
  });

  function refreshIdleTimeout() {
    if (!idleTimeoutMs) {
      return;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      close();
    }, idleTimeoutMs);
    if (typeof idleTimer.unref === 'function') {
      idleTimer.unref();
    }
  }

  const server = http.createServer((req, res) => {
    refreshIdleTimeout();

    if (req.method === 'GET' && req.url === '/') {
      const status = buildSetupStatus(statusOptions);
      const selection = buildMaintenanceSelection(status);
      const html = renderSetupPage(status, selection, { startMode });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && req.url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === TOKEN_HELP_ASSET_URL) {
      fs.readFile(TOKEN_HELP_ASSET_PATH, 'utf8', (error, asset) => {
        if (error) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Nicht gefunden.\n');
          return;
        }
        res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8' });
        res.end(asset);
      });
      return;
    }

    if (req.method === 'GET' && req.url.startsWith('/choose-workspace')) {
      const requestUrl = new URL(req.url, `http://${host}`);
      const result = chooseWorkspaceFolder(requestUrl.searchParams.get('current') || '');
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && req.url === '/done') {
      readRequestBody(req).then(body => {
        const form = new URLSearchParams(body);
        const report = runSetupFlow({
          ...flowOptions,
          selectedMaintenanceAreaIds: form.getAll('maintenance'),
          selectedClients: form.getAll('client'),
          selectedActivityIds: form.has('activitiesSubmitted') ? form.getAll('activity') : undefined,
          moodleUrl: formValue(form, 'moodleUrl'),
          moodleToken: formValue(form, 'moodleToken'),
          workspacePath: formValue(form, 'workspacePath'),
          workspaceSelectionConfirmed: form.has('workspaceSelectionConfirmed'),
          sharedSkillStorage: form.get('sharedSkillStorage') === '1',
          cropBackendChoice: formValue(form, 'cropBackend'),
        });

        // Issue #130, erweitert in #96-Folgefehler: blockierte Faelle (kein
        // Client erkannt) und der Normalfall (weder Codex noch Claude liefen
        // beim Speichern) schliessen den Dienst weiterhin sofort. Lief
        // mindestens einer der beiden, bleibt der Dienst offen, bis fuer
        // JEDEN betroffenen Client "Beenden" oder "Spaeter von Hand"
        // bestaetigt wurde (Opt-in, siehe renderPostSaveActionsPage, /end-now,
        // /skip).
        if (report.blocked) {
          finishAndClose(res, 400, 'text/plain; charset=utf-8', summaryToText(report), close);
          return;
        }
        pendingPostSaveClients = new Set([
          ...(report.codexWasRunningDuringSave ? ['codex'] : []),
          ...(report.claudeWasRunningDuringSave ? ['claude'] : []),
        ]);
        if (pendingPostSaveClients.size === 0) {
          finishAndClose(res, 200, 'text/html; charset=utf-8', renderPostSaveActionsPage(report), close);
          return;
        }

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderPostSaveActionsPage(report));
      }).catch(error => {
        finishAndClose(res, 500, 'text/plain; charset=utf-8', `Fehler: ${error.message}\n`, close);
      });
      return;
    }

    if (req.method === 'POST' && (req.url === '/end-now' || req.url === '/skip')) {
      readRequestBody(req).then(body => {
        const form = new URLSearchParams(body);
        const client = form.get('client');
        if (client !== 'codex' && client !== 'claude') {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'unbekannter Client' }));
          return;
        }
        const action = req.url === '/end-now' ? endClientHandlers[client] : () => true;
        Promise.resolve(action()).then(() => {
          pendingPostSaveClients.delete(client);
          const done = pendingPostSaveClients.size === 0;
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ done }), () => {
            if (done) {
              close();
            }
          });
        });
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/finish-setup') {
      finishAndClose(res, 200, 'text/plain; charset=utf-8', `Fertig.\n${CLOSE_TAB_HINT}\n`, close);
      return;
    }

    if (req.method === 'GET' && req.url === '/check-updates') {
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
      return;
    }

    if (req.method === 'POST' && req.url === '/apply-updates') {
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
      return;
    }

    if (req.method === 'POST' && req.url === '/abort') {
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
      return;
    }

    if (req.method === 'GET' && req.url === '/launch') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderLaunchPage());
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden.\n');
  });

  function close() {
    if (closeStarted) {
      return closed;
    }
    closeStarted = true;
    clearTimeout(idleTimer);
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    server.close(() => {
      resolveClosed();
    });
    return closed;
  }

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      const url = `http://${address.address}:${address.port}/`;
      refreshIdleTimeout();
      openBrowser(`${url}launch`);
      resolve({
        close,
        closed,
        server,
        url,
      });
    });
  });
}

module.exports = {
  DEFAULT_IDLE_TIMEOUT_MS,
  renderSetupPage,
  startSetupBrowserServer,
  defaultChooseWorkspaceFolder,
};
