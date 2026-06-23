'use strict';

const http = require('node:http');
const { execFile } = require('node:child_process');

const {
  buildMaintenanceSelection,
  buildSetupStatus,
  runSetupFlow,
} = require('./setup-flow');

const LOCAL_HOST = '127.0.0.1';

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

function renderMaintenanceAreas(selection) {
  const preselected = new Set(selection.preselectedAreaIds);
  return selection.areas
    .map(area => {
      const checked = preselected.has(area.id) ? ' checked' : '';
      return (
        '<li>' +
        `<label><input type="checkbox" name="maintenance" value="${escapeHtml(area.id)}"${checked}> ` +
        `${escapeHtml(area.label)}</label>` +
        '</li>'
      );
    })
    .join('\n');
}

function renderClientChoices(status) {
  return Object.entries(status.detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => {
      const label = client === 'codex' ? 'Codex' : 'Claude/Cowork';
      return (
        '<li>' +
        `<label><input type="checkbox" name="client" value="${escapeHtml(client)}" checked> ` +
        `${escapeHtml(label)}</label>` +
        '</li>'
      );
    })
    .join('\n');
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
    '    button { font: inherit; padding: 0.55rem 0.8rem; }\n' +
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
    '    <section aria-labelledby="maintenance-heading">\n' +
    '      <h2 id="maintenance-heading">Wartungsbereich-Auswahl</h2>\n' +
    `      <ul>${renderMaintenanceAreas(selection)}</ul>\n` +
    '    </section>\n' +
    '    <section aria-labelledby="clients-heading">\n' +
    '      <h2 id="clients-heading">Clients</h2>\n' +
    `      <ul>${renderClientChoices(status)}</ul>\n` +
    '    </section>\n' +
    '    <section aria-labelledby="values-heading">\n' +
    '      <h2 id="values-heading">Werte</h2>\n' +
    '      <p><label>Moodle-URL <input type="url" name="moodleUrl"></label></p>\n' +
    '      <p><label>Moodle-Token <input type="password" name="moodleToken" autocomplete="off"></label></p>\n' +
    `      <p><label>Arbeitsbereich <input type="text" name="workspacePath" value="${escapeHtml(status.workspace.path || '')}"></label></p>\n` +
    '      <p><label><input type="checkbox" name="workspaceSelectionConfirmed" value="1"> Arbeitsbereich bestaetigen</label></p>\n' +
    '    </section>\n' +
    '      <button type="submit">Ausgewaehlte Wartung ausfuehren</button>\n' +
    '    </form>\n' +
    '    <form method="post" action="/abort">\n' +
    '      <button type="submit">Abbrechen und Dienst beenden</button>\n' +
    '    </form>\n' +
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
    return 'Kurspilot-Konfiguration wurde nicht ausgefuehrt: kein Client erkannt.\n';
  }

  const steps = report.executedSteps && report.executedSteps.length > 0
    ? report.executedSteps
    : ['Keine Aenderung ausgefuehrt'];
  return `Ausgefuehrte Schritte:\n${steps.map(step => `- ${step}`).join('\n')}\n`;
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

function startSetupBrowserServer(options = {}) {
  const {
    host = LOCAL_HOST,
    port = 0,
    openBrowser = defaultOpenBrowser,
    startMode = 'default',
    statusOptions = {},
    flowOptions = {},
  } = options;

  let resolveClosed;
  let closeStarted = false;
  const closed = new Promise(resolve => {
    resolveClosed = resolve;
  });

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      const html = renderSetupPage(buildSetupStatus(statusOptions), { startMode });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
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
        res.writeHead(report.blocked ? 400 : 200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(summaryToText(report), () => {
          close();
        });
      }).catch(error => {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Fehler: ${error.message}\n`, () => {
          close();
        });
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/abort') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Kurspilot-Konfiguration wurde beendet.\n', () => {
        close();
      });
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
  renderSetupPage,
  startSetupBrowserServer,
};
