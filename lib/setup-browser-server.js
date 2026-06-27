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
  defaultIsClaudeDesktopRunning,
  defaultWaitForClaudeToExit,
  defaultWorkspacePath,
  runSetupFlow,
} = require('./setup-flow');
const updateCheck = require('./update-check');
const defaultCheckAppUpdate = updateCheck.checkAppUpdate;
const defaultCheckImageMagickUpdate = updateCheck.checkImageMagickUpdate;
const defaultApplyAppUpdate = updateCheck.applyAppUpdate;
const defaultApplyImageMagickUpdate = updateCheck.applyImageMagickUpdate;

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
  const label = name === 'codex' ? 'Codex' : 'Claude';
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

  if (status.imageMagick && status.imageMagick.supported) {
    items.push(status.imageMagick.available ? 'ImageMagick ist installiert' : 'ImageMagick ist nicht installiert');
  }

  return items.map(item => `<li>${escapeHtml(item)}</li>`).join('\n');
}

function renderClientChoices(status, disabled = false) {
  const clients = Object.entries(status.detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => {
      const label = client === 'codex' ? 'Codex' : 'Claude';
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
    .map(([client]) => (client === 'codex' ? 'Codex' : 'Claude'));
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
  const imageMagickArea = areaById.get('imagemagick-install');
  const imageMagickRow = imageMagickArea
    ? '    <article class="maintenance-row">\n' +
      '      <div>\n' +
      `        ${renderChangeCheckbox('imagemagick-install', imageMagickArea.label, preselected)}\n` +
      '        <p data-change-status data-current="ImageMagick fehlt noch" data-selected="Wird installiert">ImageMagick fehlt noch</p>\n' +
      '      </div>\n' +
      '      <div>\n' +
      '        <p>Ermöglicht der KI, Bilder im Kurs passgenau zuzuschneiden (Gezielter Bildausschnitt). ' +
      'Wenig Zusatzaufwand: einmal hier bestätigen, der Rest läuft automatisch.</p>\n' +
      '      </div>\n' +
      '    </article>\n'
    : '';

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
    imageMagickRow +
    '  </div>\n' +
    '</section>\n'
  );
}

/**
 * Banner + gesperrter Submit, solange Claude noch laeuft (Issue #112): die
 * laufende App wuerde einen frisch geschriebenen mcpServers-Key kurz danach
 * wieder per eigenem Persistierungs-Zyklus ueberschreiben.
 */
function renderClaudeRunningBanner() {
  return (
    '<section role="alert">\n' +
    '  <p>⚠️ Claude läuft noch und würde die Konfiguration sofort wieder überschreiben. ' +
    'Bitte Claude beenden, bevor die Änderungen gespeichert werden.</p>\n' +
    '  <button id="end-claude-button" type="button">Claude jetzt beenden und fortfahren</button>\n' +
    '</section>\n'
  );
}

/**
 * "Nach Updates suchen" (Issue #128, ADR 0008 "Updates und Skill-Konflikte"):
 * eigener Bereich mit Knopf, Ergebnisliste und - bei Skill-Konflikt - dem
 * fertigen Copy&Paste-Prompt fuer die KI. Die eigentliche Pruef-/Install-Logik
 * steckt in lib/update-check.js; hier wird nur gerendert und client-seitig
 * gegen die /check-updates- und /apply-updates-Routen gesprochen.
 */
function renderUpdateSection() {
  return (
    '<section aria-labelledby="updates-heading">\n' +
    '  <h2 id="updates-heading">Updates</h2>\n' +
    '  <button id="check-updates-button" type="button">Nach Updates suchen</button>\n' +
    '  <div id="update-status" role="status" aria-live="polite"></div>\n' +
    '  <div id="update-conflicts"></div>\n' +
    '</section>\n'
  );
}

function renderSetupPage(status, options = {}) {
  const { startMode = 'default' } = options;
  const selection = buildMaintenanceSelection(status);
  const modeText = startMode === 'after-install'
    ? 'Nach der Installation'
    : (selection.mode === 'first-setup' ? 'Ersteinrichtung' : 'Wartung');
  const submitButton = status.claudeRunning
    ? '<button type="submit" disabled>Ausgewählte Änderungen speichern</button>'
    : '<button type="submit">Ausgewählte Änderungen speichern</button>';

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
    (status.claudeRunning ? renderClaudeRunningBanner() : '') +
    `    ${renderUpdateSection()}` +
    '    <form method="post" action="/done">\n' +
    `    ${renderCurrentStateAndChanges(status, selection)}` +
    `      ${submitButton}\n` +
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
    '      document.getElementById("end-claude-button")?.addEventListener("click", async event => {\n' +
    '        const button = event.currentTarget;\n' +
    '        button.disabled = true;\n' +
    '        try {\n' +
    '          await fetch("/end-claude-and-continue", { method: "POST" });\n' +
    '        } finally {\n' +
    '          location.reload();\n' +
    '        }\n' +
    '      });\n' +
    '      function renderUpdateLine(info) {\n' +
    '        if (info.offline || info.error) return `<li>${info.label}: ${info.error}</li>`;\n' +
    '        return `<li>${info.label}: ${info.updateAvailable ? "Update verfügbar" : "Aktuell"}</li>`;\n' +
    '      }\n' +
    '      function renderConflictPrompts(conflictPrompts) {\n' +
    '        if (!conflictPrompts || conflictPrompts.length === 0) return "";\n' +
    '        return conflictPrompts.map(item => (\n' +
    '          "<article class=\\"skill-conflict\\">" +\n' +
    '          `<p>Skill-Konflikt bei <strong>${item.skillName}</strong>: lokale Änderungen erkannt, Update wurde nicht überschrieben.</p>` +\n' +
    '          "<p>Folgenden Prompt in die KI (Claude/Codex) einfügen, Ergebnis bestätigen, danach Update erneut ausführen:</p>" +\n' +
    '          `<textarea readonly rows="3" class="conflict-prompt">${item.prompt}</textarea>` +\n' +
    '          `<button type="button" class="copy-prompt-button" data-prompt="${item.prompt.replace(/"/g, "&quot;")}">In Zwischenablage kopieren</button>` +\n' +
    '          "</article>"\n' +
    '        )).join("");\n' +
    '      }\n' +
    '      document.getElementById("check-updates-button")?.addEventListener("click", async event => {\n' +
    '        const button = event.currentTarget;\n' +
    '        const statusEl = document.getElementById("update-status");\n' +
    '        const conflictsEl = document.getElementById("update-conflicts");\n' +
    '        button.disabled = true;\n' +
    '        statusEl.textContent = "Prüfe auf Updates...";\n' +
    '        conflictsEl.innerHTML = "";\n' +
    '        try {\n' +
    '          const response = await fetch("/check-updates");\n' +
    '          const result = await response.json();\n' +
    '          if (result.offline) {\n' +
    '            statusEl.textContent = result.error;\n' +
    '            return;\n' +
    '          }\n' +
    '          const lines = [renderUpdateLine(result.app)];\n' +
    '          if (result.imageMagick.supported) lines.push(renderUpdateLine(result.imageMagick));\n' +
    '          statusEl.innerHTML = `<ul>${lines.join("")}</ul>`;\n' +
    '          const anyUpdateAvailable = result.app.updateAvailable || (result.imageMagick.supported && result.imageMagick.updateAvailable);\n' +
    '          if (anyUpdateAvailable) {\n' +
    '            const installButton = document.createElement("button");\n' +
    '            installButton.type = "button";\n' +
    '            installButton.textContent = "Updates installieren";\n' +
    '            installButton.addEventListener("click", async () => {\n' +
    '              installButton.disabled = true;\n' +
    '              statusEl.textContent = "Installiere Updates...";\n' +
    '              conflictsEl.innerHTML = "";\n' +
    '              try {\n' +
    '                const applyResponse = await fetch("/apply-updates", { method: "POST" });\n' +
    '                const applyResult = await applyResponse.json();\n' +
    '                if (applyResult.offline) {\n' +
    '                  statusEl.textContent = applyResult.error;\n' +
    '                  return;\n' +
    '                }\n' +
    '                statusEl.textContent = applyResult.skillInstallAborted\n' +
    '                  ? "Update teilweise installiert: Skill-Konflikt, siehe unten."\n' +
    '                  : "Update installiert.";\n' +
    '                conflictsEl.innerHTML = renderConflictPrompts(applyResult.skillInstallConflictPrompts);\n' +
    '                for (const copyButton of conflictsEl.querySelectorAll(".copy-prompt-button")) {\n' +
    '                  copyButton.addEventListener("click", () => {\n' +
    '                    navigator.clipboard?.writeText(copyButton.dataset.prompt);\n' +
    '                  });\n' +
    '                }\n' +
    '              } finally {\n' +
    '                installButton.disabled = false;\n' +
    '              }\n' +
    '            });\n' +
    '            statusEl.append(installButton);\n' +
    '          }\n' +
    '        } catch {\n' +
    '          statusEl.textContent = "Update-Prüfung war nicht möglich.";\n' +
    '        } finally {\n' +
    '          button.disabled = false;\n' +
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
  const allWarnings = [
    ...(report.claudeRunningWarning ? [report.claudeRunningWarning] : []),
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
  const defaultLocation = currentPath && fs.existsSync(currentPath)
    ? currentPath
    : (currentPath ? path.dirname(currentPath) : defaultWorkspacePath(homeDir));

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
      const selected = execFileSyncFn('osascript', ['-e', script], { encoding: 'utf8' }).trim();
      return { workspacePath: selected || null, confirmed: Boolean(selected) };
    }

    if (process.platform === 'win32') {
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
    endClaudeDesktop = defaultEndClaudeDesktop,
    waitForClaudeToExit = defaultWaitForClaudeToExit,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    updateOptions = {},
  } = options;
  const checkAppUpdate = updateOptions.checkAppUpdate || defaultCheckAppUpdate;
  const checkImageMagickUpdate = updateOptions.checkImageMagickUpdate || defaultCheckImageMagickUpdate;
  const applyAppUpdate = updateOptions.applyAppUpdate || defaultApplyAppUpdate;
  const applyImageMagickUpdate = updateOptions.applyImageMagickUpdate || defaultApplyImageMagickUpdate;
  const isClaudeRunning = statusOptions.isClaudeRunning || defaultIsClaudeDesktopRunning;

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

    if (req.method === 'POST' && req.url === '/end-claude-and-continue') {
      endClaudeDesktop();
      waitForClaudeToExit({ isClaudeRunning }).then(() => {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Claude wurde beendet.\n');
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
  defaultChooseWorkspaceFolder,
};
