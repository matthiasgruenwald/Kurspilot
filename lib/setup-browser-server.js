'use strict';

const http = require('node:http');
const { execFile } = require('node:child_process');

const {
  buildMaintenanceSelection,
  buildSetupStatus,
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
        `<label><input type="checkbox" name="maintenance" value="${escapeHtml(area.id)}"${checked} disabled> ` +
        `${escapeHtml(area.label)}</label>` +
        '</li>'
      );
    })
    .join('\n');
}

function renderSetupPage(status) {
  const selection = buildMaintenanceSelection(status);
  const modeText = selection.mode === 'first-setup' ? 'Ersteinrichtung' : 'Wartung';

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
    '    <section aria-labelledby="maintenance-heading">\n' +
    '      <h2 id="maintenance-heading">Wartungsbereich-Auswahl</h2>\n' +
    `      <ul>${renderMaintenanceAreas(selection)}</ul>\n` +
    '    </section>\n' +
    '    <form method="post" action="/abort">\n' +
    '      <button type="submit">Abbrechen und Dienst beenden</button>\n' +
    '    </form>\n' +
    '  </main>\n' +
    '</body>\n' +
    '</html>\n'
  );
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
    statusOptions = {},
  } = options;

  let resolveClosed;
  let closeStarted = false;
  const closed = new Promise(resolve => {
    resolveClosed = resolve;
  });

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      const html = renderSetupPage(buildSetupStatus(statusOptions));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && (req.url === '/abort' || req.url === '/done')) {
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
