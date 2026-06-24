'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');

const {
  buildMaintenanceSelection,
  buildSetupStatus,
  runSetupFlow,
} = require('./setup-flow');

const LOCAL_HOST = '127.0.0.1';
const TOKEN_HELP_ASSET_URL = '/assets/setup/token-help.svg';
const TOKEN_HELP_ASSET_PATH = path.join(__dirname, '..', 'assets', 'setup', 'token-help.svg');
const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clientStatusText(name, detected) {
  const label = name === 'codex' ? 'Codex' : 'Claude/Cowork';
  return `${label} wurde ${detected ? '' : 'nicht '}erkannt`;
}

function renderStatusItems(status) {
  const items = [
    clientStatusText('codex', status.detectedClients.codex),
    clientStatusText('claude', status.detectedClients.claude),
    status.moodle.url ? 'Moodle-URL ist gespeichert' : 'Moodle-URL fehlt',
    status.moodle.tokenPresent ? 'Moodle-Token ist gespeichert' : 'Moodle-Token fehlt',
    status.workspace.configured ? 'Arbeitsbereich ist eingerichtet' : 'Arbeitsbereich fehlt',
    status.kurspilotRepairRequired
      ? 'Kurspilot muss eingerichtet oder repariert werden'
      : 'Kurspilot-Reparatur ist nicht erforderlich',
  ];

  return items.map(item => `<li>${escapeHtml(item)}</li>`).join('\n');
}

function renderClientChoices(status, disabled = false) {
  const clients = Object.entries(status.detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => {
      const label = client === 'codex' ? 'Codex' : 'Claude/Cowork';
      const disabledAttr = disabled ? ' disabled' : '';
      return (
        '<li>' +
        `<label><input type="checkbox" name="client" value="${escapeHtml(client)}" checked${disabledAttr}> ` +
        `${escapeHtml(label)}</label>` +
        '</li>'
      );
    })
    .join('\n');

  return clients || '<li>Kein Client erkannt</li>';
}

function detectedClientLabels(status) {
  return Object.entries(status.detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => (client === 'codex' ? 'Codex' : 'Claude/Cowork'));
}

function renderChangeCheckbox(id, label, preselected) {
  const checked = preselected.has(id) ? ' checked' : '';
  return (
    `<label><input type="checkbox" name="maintenance" value="${escapeHtml(id)}"` +
    ` data-enables="${escapeHtml(id)}"${checked}> ${escapeHtml(label)}</label>`
  );
}

function renderDisabledAttribute(preselected, areaId) {
  return preselected.has(areaId) ? '' : ' disabled';
}

function renderCurrentStateAndChanges(status, selection) {
  const preselected = new Set(selection.preselectedAreaIds);
  const areaById = new Map(selection.areas.map(area => [area.id, area]));
  const urlDisabled = renderDisabledAttribute(preselected, 'moodle-url-change');
  const tokenDisabled = renderDisabledAttribute(preselected, 'moodle-token-renewal');
  const workspaceDisabled = renderDisabledAttribute(preselected, 'workspace-change');
  const workspaceStatus = status.workspace.configured
    ? `Eingerichtet: ${status.workspace.path}`
    : 'Noch nicht eingerichtet';
  const tokenStatus = status.moodle.tokenPresent ? 'Moodle-Token ist gespeichert' : 'Moodle-Token fehlt';
  const urlStatus = status.moodle.url ? 'Gespeichert' : 'Moodle-URL fehlt';
  const clientLabels = detectedClientLabels(status);
  const clientStatusSubject = clientLabels.length > 0 ? clientLabels.join(' und ') : 'keinen erkannten Client';
  const repairStatus = status.kurspilotRepairRequired
    ? 'Einrichtung oder Reparatur erforderlich'
    : `Für ${clientStatusSubject} ist keine Reparatur erforderlich`;

  return (
    '<section aria-labelledby="changes-heading">\n' +
    '  <h2 id="changes-heading">Aktueller Stand und Änderungen</h2>\n' +
    '  <div class="maintenance-list">\n' +
    '    <article class="maintenance-row">\n' +
    '      <div>\n' +
    `        ${renderChangeCheckbox('kurspilot-setup-or-repair', areaById.get('kurspilot-setup-or-repair').label, preselected)}\n` +
    `        <p data-change-status data-current="${escapeHtml(repairStatus)}" data-selected="Ausgewählte Clients werden eingerichtet/repariert">${escapeHtml(repairStatus)}</p>\n` +
    '      </div>\n' +
    '      <div>\n' +
    '        <p class="field-label">Erkannte Clients</p>\n' +
    `        <ul class="inline-list">${renderClientChoices(status)}</ul>\n` +
    '      </div>\n' +
    '    </article>\n' +
    '    <article class="maintenance-row">\n' +
    '      <div>\n' +
    `        ${renderChangeCheckbox('moodle-token-renewal', areaById.get('moodle-token-renewal').label, preselected)}\n` +
    `        <p data-change-status data-current="${escapeHtml(tokenStatus)}" data-selected="Moodle-Token wird erneuert">${escapeHtml(tokenStatus)}</p>\n` +
    '      </div>\n' +
    '      <div>\n' +
    `        <input type="password" name="moodleToken" autocomplete="off"${tokenDisabled} data-enabled-by="moodle-token-renewal" placeholder="${status.moodle.tokenPresent ? 'gespeichert' : 'Token einfügen'}">\n` +
    '        <details>\n' +
    '          <summary>Token-Anleitung</summary>\n' +
    '          <p>Token erstellen oder erneuern: in Moodle oben das Nutzerfeld öffnen, Einstellungen wählen, Sicherheitsschlüssel öffnen, beim Dienst Coursepilot einen neuen Token generieren und den Token direkt hier einfügen.</p>\n' +
    `          <img class="token-help" src="${TOKEN_HELP_ASSET_URL}" alt="Lokale Anleitung: Moodle-Token erstellen oder erneuern">\n` +
    '        </details>\n' +
    '      </div>\n' +
    '    </article>\n' +
    '    <article class="maintenance-row">\n' +
    '      <div>\n' +
    `        ${renderChangeCheckbox('moodle-url-change', areaById.get('moodle-url-change').label, preselected)}\n` +
    `        <p data-change-status data-current="${escapeHtml(urlStatus)}" data-selected="Wird geändert">${escapeHtml(urlStatus)}</p>\n` +
    '      </div>\n' +
    '      <div>\n' +
    `        <input type="url" name="moodleUrl" value="${escapeHtml(status.moodle.url || '')}"${urlDisabled} data-enabled-by="moodle-url-change" placeholder="https://moodle.example.de">\n` +
    '      </div>\n' +
    '    </article>\n' +
    '    <article class="maintenance-row">\n' +
    '      <div>\n' +
    `        ${renderChangeCheckbox('workspace-change', areaById.get('workspace-change').label, preselected)}\n` +
    `        <p data-change-status data-current="${escapeHtml(workspaceStatus)}" data-selected="Arbeitsbereich wird geändert">${escapeHtml(workspaceStatus)}</p>\n` +
    '      </div>\n' +
    '      <div>\n' +
    `        <input id="workspace-path" type="text" name="workspacePath" value="${escapeHtml(status.workspace.path || '')}"${workspaceDisabled} data-enabled-by="workspace-change">\n` +
    `        <button id="choose-workspace-button" type="button"${workspaceDisabled} data-enabled-by="workspace-change">Ordner wählen</button>\n` +
    `        <input type="hidden" name="workspaceSelectionConfirmed" value="1"${workspaceDisabled} data-enabled-by="workspace-change">\n` +
    '      </div>\n' +
    '    </article>\n' +
    '  </div>\n' +
    '</section>\n'
  );
}

function renderSetupPage(status, options = {}) {
  const { startMode = 'default' } = options;
  const selection = buildMaintenanceSelection(status);
  const modeText = startMode === 'after-install'
    ? 'Nach der Installation'
    : (selection.mode === 'first-setup' ? 'Ersteinrichtung' : 'Wartung');

  return (
    '<!doctype html>\n' +
    '<html lang="de">\n' +
    '<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '  <title>Kurspilot konfigurieren</title>\n' +
    '  <style>\n' +
    '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem auto; max-width: 760px; line-height: 1.5; color: #1f2933; }\n' +
    '    h1, h2 { line-height: 1.2; }\n' +
    '    section { margin-top: 1.75rem; }\n' +
    '    li { margin: 0.35rem 0; }\n' +
    '    .maintenance-list { display: grid; gap: 0.85rem; }\n' +
    '    .maintenance-row { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(260px, 1.25fr); gap: 1rem; align-items: start; padding: 0.9rem 0; border-top: 1px solid #d5dce3; }\n' +
    '    .maintenance-row p { margin: 0.25rem 0 0; }\n' +
    '    .maintenance-row input[type="url"], .maintenance-row input[type="password"], .maintenance-row input[type="text"] { box-sizing: border-box; width: 100%; font: inherit; padding: 0.45rem 0.55rem; }\n' +
    '    .maintenance-row input + button { margin-top: 0.5rem; }\n' +
    '    .field-label { font-weight: 600; }\n' +
    '    .inline-list { margin: 0.25rem 0 0; padding-left: 1.25rem; }\n' +
    '    button { font: inherit; padding: 0.55rem 0.8rem; }\n' +
    '    details { margin: 0.5rem 0 1rem; }\n' +
    '    summary { cursor: pointer; font-weight: 600; }\n' +
    '    img.token-help { display: block; width: min(100%, 620px); height: auto; margin-top: 0.75rem; border: 1px solid #d5dce3; }\n' +
    '    @media (max-width: 680px) { .maintenance-row { grid-template-columns: 1fr; } }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <main>\n' +
    '    <h1>Kurspilot konfigurieren</h1>\n' +
    `    <p>Modus: ${escapeHtml(modeText)}</p>\n` +
    '    <section aria-labelledby="status-heading">\n' +
    '      <h2 id="status-heading">Kurspilot-Status</h2>\n' +
    `      <ul>${renderStatusItems(status)}</ul>\n` +
    '    </section>\n' +
    '    <form method="post" action="/done">\n' +
    `    ${renderCurrentStateAndChanges(status, selection)}` +
    '      <button type="submit">Ausgewählte Änderungen speichern</button>\n' +
    '    </form>\n' +
    '    <form method="post" action="/abort">\n' +
    '      <button type="submit">Abbrechen und Dienst beenden</button>\n' +
    '    </form>\n' +
    '    <script>\n' +
    '      for (const checkbox of document.querySelectorAll("[data-enables]")) {\n' +
    '        const update = () => {\n' +
    '          for (const field of document.querySelectorAll(`[data-enabled-by="${checkbox.value}"]`)) {\n' +
    '            field.disabled = !checkbox.checked;\n' +
    '          }\n' +
    '          const status = checkbox.closest(".maintenance-row").querySelector("[data-change-status]");\n' +
    '          if (status) status.textContent = checkbox.checked ? status.dataset.selected : status.dataset.current;\n' +
    '        };\n' +
    '        checkbox.addEventListener("change", update);\n' +
    '        update();\n' +
    '      }\n' +
    '      document.getElementById("choose-workspace-button")?.addEventListener("click", async event => {\n' +
    '        const button = event.currentTarget;\n' +
    '        if (button.dataset.busy === "1") return;\n' +
    '        button.dataset.busy = "1";\n' +
    '        button.disabled = true;\n' +
    '        const field = document.getElementById("workspace-path");\n' +
    '        try {\n' +
    '          const response = await fetch(`/choose-workspace?current=${encodeURIComponent(field.value)}`);\n' +
    '          if (!response.ok) return;\n' +
    '          const result = await response.json();\n' +
    '          if (result.workspacePath) field.value = result.workspacePath;\n' +
    '        } catch {\n' +
    '          // Der native Dialog wurde abgebrochen oder der lokale Dienst beendet.\n' +
    '        } finally {\n' +
    '          button.dataset.busy = "0";\n' +
    '          button.disabled = !document.querySelector(`[data-enables="${button.dataset.enabledBy}"]`)?.checked;\n' +
    '        }\n' +
    '      });\n' +
    '    </script>\n' +
    '  </main>\n' +
    '</body>\n' +
    '</html>\n'
  );
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

function summaryToText(report) {
  if (report.blocked) {
    return 'Kurspilot-Konfiguration wurde nicht ausgeführt: kein Client erkannt.\n';
  }

  const steps = report.executedSteps && report.executedSteps.length > 0
    ? report.executedSteps
    : ['Keine Änderung ausgeführt'];
  const warnings = report.skillInstallWarnings && report.skillInstallWarnings.length > 0
    ? `\nWarnungen:\n${report.skillInstallWarnings.map(warning => `- ${warning}`).join('\n')}\n`
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

function defaultChooseWorkspaceFolder(currentPath) {
  const defaultLocation = currentPath && fs.existsSync(currentPath)
    ? currentPath
    : (currentPath ? path.dirname(currentPath) : process.cwd());

  try {
    if (process.platform === 'darwin') {
      const script = [
        `set defaultFolder to POSIX file ${JSON.stringify(defaultLocation)}`,
        'tell application "Finder" to activate',
        'delay 0.1',
        'try',
        '  return POSIX path of (choose folder with prompt "Kurspilot-Arbeitsbereich wählen" default location defaultFolder)',
        'on error',
        '  return ""',
        'end try',
      ].join('\n');
      const selected = execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim();
      return { workspacePath: selected || null, confirmed: Boolean(selected) };
    }

    if (process.platform === 'win32') {
      const command = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
        `$dialog.SelectedPath = ${JSON.stringify(defaultLocation)};`,
        'if ($dialog.ShowDialog() -eq "OK") { $dialog.SelectedPath }',
      ].join(' ');
      const selected = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim();
      return { workspacePath: selected || null, confirmed: Boolean(selected) };
    }

    for (const command of ['zenity', 'kdialog']) {
      try {
        const args = command === 'zenity'
          ? ['--file-selection', '--directory', '--filename', defaultLocation]
          : ['--getexistingdirectory', defaultLocation];
        const selected = execFileSync(command, args, { encoding: 'utf8' }).trim();
        return { workspacePath: selected || null, confirmed: Boolean(selected) };
      } catch {
        // try next local dialog helper
      }
    }
  } catch {
    return { workspacePath: null, confirmed: false };
  }

  return { workspacePath: null, confirmed: false };
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
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  } = options;

  let resolveClosed;
  let closeStarted = false;
  let idleTimer = null;
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
      const html = renderSetupPage(buildSetupStatus(statusOptions), { startMode });
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
          moodleUrl: formValue(form, 'moodleUrl'),
          moodleToken: formValue(form, 'moodleToken'),
          workspacePath: formValue(form, 'workspacePath'),
          workspaceSelectionConfirmed: form.has('workspaceSelectionConfirmed'),
        });
        finishAndClose(
          res,
          report.blocked ? 400 : 200,
          'text/plain; charset=utf-8',
          summaryToText(report),
          close
        );
      }).catch(error => {
        finishAndClose(res, 500, 'text/plain; charset=utf-8', `Fehler: ${error.message}\n`, close);
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/abort') {
      finishAndClose(res, 200, 'text/plain; charset=utf-8', 'Kurspilot-Konfiguration wurde beendet.\n', close);
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

module.exports = {
  DEFAULT_IDLE_TIMEOUT_MS,
  renderSetupPage,
  startSetupBrowserServer,
};
