'use strict';

/**
 * HTML-Rendering fuer das Setup-Browser-Tool (Issue #148: aus
 * lib/setup-browser-server.js herausgeloest). Reine Funktionen: Status-/
 * Konfigurationsdaten rein, HTML-String raus - kein HTTP, kein Filesystem,
 * kein Aufruf von setup-flow/skill-install/mcp-config-setup/imagemagick-setup.
 * Die einzige Nicht-Kern-Abhaengigkeit ist lib/activity-registry.js (statische,
 * seiteneffektfreie Datenstruktur).
 */

const { listActivities } = require('./activity-registry');
const { clientLabel } = require('./client-registry');

const TOKEN_HELP_ASSET_URL = '/assets/setup/token-help.svg';
const CLOSE_TAB_HINT = 'Sie können diesen Tab jetzt schließen.';
const SUCCESS_NOTICE_STYLE = (
  '.success-notice{color:#107c10;text-align:center;max-width:400px;margin:0 auto}' +
  '.success-notice h2{font-size:1.4rem;margin-bottom:1rem}' +
  '.success-notice p{color:#555;margin-bottom:0}'
);

// Issue #209: Wird der Konfigurationsserver spaeter beendet, bleibt der offene
// Tab zurueck. Ein Health-Poll gegen /health blendet nach zwei Fehlversuchen
// einen deutlichen Neustart-Hinweis ein.
const SERVER_GONE_BANNER = (
  '<div id="server-gone-banner" hidden style="position:fixed;top:0;left:0;right:0;z-index:1000;' +
  "background:#b00020;color:#fff;padding:0.9rem 1rem;text-align:center;font-weight:600;" +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif\">\n" +
  '  Kurspilot konfigurieren läuft nicht mehr. Bitte „Kurspilot konfigurieren“ neu starten.\n' +
  '</div>\n'
);

const HEALTH_POLL_SCRIPT = (
  '<script>\n' +
  '  (function () {\n' +
  '    var failures = 0;\n' +
  '    setInterval(function () {\n' +
  '      if (window.kurspilotServiceStopped) return;\n' +
  '      fetch("/health").then(function (response) {\n' +
  '        if (response.ok) { failures = 0; } else { failures += 1; }\n' +
  '      }).catch(function () {\n' +
  '        failures += 1;\n' +
  '      }).then(function () {\n' +
  '        if (failures >= 2) {\n' +
  '          window.kurspilotServiceStopped = true;\n' +
  '          var banner = document.getElementById("server-gone-banner");\n' +
  '          if (banner) banner.hidden = false;\n' +
  '          var header = document.querySelector("header");\n' +
  '          if (header) header.inert = true;\n' +
  '          var main = document.querySelector("main");\n' +
  '          if (main) main.inert = true;\n' +
  '          var overlay = document.getElementById("service-stopped-overlay");\n' +
  '          if (overlay) overlay.hidden = false;\n' +
  '        }\n' +
  '      });\n' +
  '    }, 4000);\n' +
  '  }());\n' +
  '</script>\n'
);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const MACOS_IMAGEMAGICK_DISK_USAGE_MB = {
  homebrew: 500,
  imagemagickWithDependencies: 60,
};

/**
 * Listet die Speicherplatz-Posten fuer die macOS-ImageMagick-Installation auf
 * (Issue #136: jeder Posten einzeln + Summe sichtbar, bevor irgendetwas
 * heruntergeladen wird). Ob Homebrew bereits installiert ist, wird hier
 * bewusst NICHT geprueft - die tatsaechliche Installation (lib/imagemagick-setup.js,
 * installImageMagickMacOS, Issue #137) prueft das selbst per isHomebrewInstalled
 * und ueberspringt den Homebrew-Schritt, falls bereits vorhanden. Hier wird der
 * Homebrew-Posten unabhaengig davon als "falls noch nicht vorhanden" ausgewiesen,
 * damit die Lehrkraft vorab den realistischen Maximalverbrauch sieht statt einer
 * zu niedrigen Schaetzung.
 */
function renderImageMagickDiskUsageItems() {
  return [
    { label: 'Homebrew (Paketverwaltung, falls noch nicht vorhanden)', sizeMb: MACOS_IMAGEMAGICK_DISK_USAGE_MB.homebrew },
    { label: 'ImageMagick + Abhängigkeiten', sizeMb: MACOS_IMAGEMAGICK_DISK_USAGE_MB.imagemagickWithDependencies },
  ];
}

function renderImageMagickDiskUsageList() {
  const items = renderImageMagickDiskUsageItems();
  const totalMb = items.reduce((sum, item) => sum + item.sizeMb, 0);
  const itemLines = items
    .map(item => `          <li>${escapeHtml(item.label)}: ca. ${item.sizeMb} MB</li>`)
    .join('\n');
  return (
    '        <div class="imagemagick-disk-usage">\n' +
    '          <p class="field-label">Benötigter Speicherplatz</p>\n' +
    '          <ul>\n' +
    `${itemLines}\n` +
    '          </ul>\n' +
    `          <p>Summe: ca. ${totalMb} MB</p>\n` +
    '        </div>\n'
  );
}


/**
 * Wartungs-Ansicht (Issue #202, Parent #200/Spec 0005): einzige Ansicht des
 * Konfigurators (#237). Header mit Titel/Untertitel und Live-Statuszeile,
 * Card-Grid und ein Footer mit "Dienst beenden" (POST /abort) und
 * "Einstellungen zurücksetzen" (POST /reset-settings, #236).
 *
 * Token-Fluss: die Seite liest den CSRF-Token aus der aktuellen URL und haengt
 * ihn an die fetch-Aufrufe.
 */
function moodleSummaryText(moodle) {
  const url = moodle.url || 'Moodle-URL fehlt';
  const token = moodle.tokenPresent ? 'Token gespeichert' : 'Token fehlt';
  return `${url} · ${token}`;
}

function renderMoodleCard(status) {
  // ponytail: natives <details open> statt JS-Toggle
  const detailsOpen = status.moodle.tokenPresent ? '' : ' open';
  return (
    '<article class="card card-wide" data-card-id="moodle">\n' +
    '  <div class="card-header">\n' +
    '    <h2>Moodle-Zugang</h2>\n' +
    '    <button class="card-edit btn-tertiary" type="button" data-card-id="moodle" aria-expanded="false">Ändern</button>\n' +
    '  </div>\n' +
    `  <p class="card-summary" data-card-summary="moodle">${escapeHtml(moodleSummaryText(status.moodle))}</p>\n` +
    '  <div class="card-detail" data-card-detail="moodle" hidden>\n' +
    '    <label>Moodle-URL\n' +
    `      <input type="url" name="moodleUrl" value="${escapeHtml(status.moodle.url || '')}">\n` +
    '    </label>\n' +
    '    <label>Token\n' +
    `      <input type="password" name="moodleToken" autocomplete="off" placeholder="${status.moodle.tokenPresent ? 'gespeichert' : 'Token einfügen'}">\n` +
    '    </label>\n' +
    `    <details${detailsOpen}>\n` +
    '      <summary>Token-Anleitung</summary>\n' +
    '      <p>Token erstellen oder erneuern: in Moodle oben das Nutzerfeld öffnen, Einstellungen wählen, Sicherheitsschlüssel öffnen, beim Dienst Coursepilot einen neuen Token generieren und den Token direkt hier einfügen.</p>\n' +
    `      <img class="token-help" src="${TOKEN_HELP_ASSET_URL}" alt="Lokale Anleitung: Moodle-Token erstellen oder erneuern">\n` +
    '    </details>\n' +
    '    <button class="btn-primary card-save" type="button" data-card-id="moodle">Speichern</button>\n' +
    '    <p class="card-save-status" data-card-save-status="moodle" role="status" aria-live="polite"></p>\n' +
    '  </div>\n' +
    '</article>\n'
  );
}

function workspaceSummaryText(workspace) {
  return workspace.configured && workspace.path ? workspace.path : 'Nicht eingerichtet';
}

/**
 * Card 'Arbeitsordner' (Issue #204, Spec 0005 S4): Pfad-Feld mit
 * word-break:break-all, 'Ordner wählen…'-Button (bestehendes
 * GET /choose-workspace) und Instant-Save über POST /apply/workspace.
 */
function renderWorkspaceCard(status) {
  return (
    '<article class="card" data-card-id="workspace">\n' +
    '  <div class="card-header">\n' +
    '    <h2>Arbeitsordner</h2>\n' +
    '    <button class="card-edit btn-tertiary" type="button" data-card-id="workspace" aria-expanded="false">Ändern</button>\n' +
    '  </div>\n' +
    `  <p class="card-summary card-path" data-card-summary="workspace">${escapeHtml(workspaceSummaryText(status.workspace))}</p>\n` +
    '  <div class="card-detail" data-card-detail="workspace" hidden>\n' +
    '    <label>Arbeitsordner\n' +
    `      <input class="card-path" type="text" name="workspacePath" value="${escapeHtml(status.workspace.path || '')}">\n` +
    '    </label>\n' +
    '    <button class="choose-workspace-button btn-secondary" type="button">Ordner wählen…</button>\n' +
    '    <p class="choose-workspace-status" role="status" aria-live="polite"></p>\n' +
    '    <button class="btn-primary card-save" type="button" data-card-id="workspace">Speichern</button>\n' +
    '    <p class="card-save-status" data-card-save-status="workspace" role="status" aria-live="polite"></p>\n' +
    '  </div>\n' +
    '</article>\n'
  );
}

function clientsSummaryText(status) {
  const labels = Object.entries(status.detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => clientLabel(client));
  return labels.length > 0 ? labels.join(', ') : 'Kein Client erkannt';
}

/**
 * Card 'KI-Clients' (Issue #205, Spec 0005 S5): Checkboxen pro erkanntem Client
 * (Claude/Codex/opencode), Instant-Save über POST /apply/clients. Die Antwort
 * trägt restartRequired; das Client-JS (renderRestartBlock in
 * renderMaintenancePage) blendet pro laufendem Codex/Claude einen
 * Neustart-Button (POST /restart-client) und für opencode eine reine
 * Hinweiszeile ein - opencode lädt MCP bei jedem neuen Chat frisch, kein
 * Neustart nötig. Der Neustart-Slot liegt bewusst ausserhalb von card-detail,
 * damit er nach dem Speichern (detail wird zugeklappt) sichtbar bleibt.
 */
function renderClientsCard(status) {
  const detected = Object.entries(status.detectedClients)
    .filter(([, isDetected]) => isDetected)
    .map(([client]) => client);
  const choices = detected
    .map(client => (
      `    <label class="checkbox-choice"><input type="checkbox" name="client" value="${escapeHtml(client)}" checked> ` +
      `${escapeHtml(clientLabel(client))}</label>\n`
    ))
    .join('');
  // ponytail: Option nur sichtbar bei >=2 erkannten Clients; Client-JS toggelt bei Checkbox-Änderung
  const sharedStorageHidden = detected.length < 2 ? ' hidden' : '';
  const sharedStorage = choices
    ? `    <div data-shared-skill-storage${sharedStorageHidden}>\n` +
      '      <label class="checkbox-choice"><input type="checkbox" name="sharedSkillStorage" value="1" checked> Gemeinsame Skill-Ablage (empfohlen)</label>\n' +
      '      <p>Beide KI-Programme greifen auf dieselben Kurspilot-Bausteine zu. Abwählen, wenn jedes Programm eine eigene Kopie erhalten soll.</p>\n' +
      '    </div>\n'
    : '';
  const detail = choices
    ? choices + sharedStorage +
      '    <button class="btn-primary card-save" type="button" data-card-id="clients">Speichern</button>\n' +
      '    <p class="card-save-status" data-card-save-status="clients" role="status" aria-live="polite"></p>\n'
    : '    <p>Kein Client erkannt</p>\n';

  return (
    '<article class="card" data-card-id="clients">\n' +
    '  <div class="card-header">\n' +
    '    <h2>KI-Clients</h2>\n' +
      (choices ? '    <button class="card-edit btn-tertiary" type="button" data-card-id="clients" aria-expanded="false">Ändern</button>\n' : '') +
    '  </div>\n' +
    `  <p class="card-summary" data-card-summary="clients">${escapeHtml(clientsSummaryText(status))}</p>\n` +
    '  <div class="card-detail" data-card-detail="clients"' + (choices ? ' hidden' : '') + '>\n' +
    detail +
    '  </div>\n' +
    '  <div class="card-restart" data-card-restart="clients"></div>\n' +
    '</article>\n'
  );
}

function activitiesSummaryText(status) {
  const configured = status.configuredActivityIds;
  const labels = listActivities()
    .filter(activity => activity.apiSupported)
    .filter(activity => configured === null ? activity.default : configured.includes(activity.id))
    .map(activity => activity.label);
  if (labels.length === 0) return 'Keine Aktivitäten';
  return `${labels.length} Aktivitäten: ${labels.join(' · ')}`;
}

const MOODLE_ACTIVITY_ICON_COMPONENTS = Object.freeze({
  page: 'mod_page',
  label: 'mod_label',
  url: 'mod_url',
  resource: 'mod_resource',
  folder: 'mod_folder',
  choice: 'mod_choice',
  forum: 'mod_forum',
  assign: 'mod_assign',
  quiz: 'mod_quiz',
  fragensammlung: 'mod_qbank',
});

function renderActivitiesCard(status) {
  const configured = status.configuredActivityIds;
  const moodleUrl = status.moodle.url ? status.moodle.url.replace(/\/$/, '') : '';
  const choices = listActivities()
    .filter(activity => activity.apiSupported)
    .map(activity => {
      const isChecked = configured === null ? activity.default : configured.includes(activity.id);
      const icon = moodleUrl
        ? `<img class="activity-icon" src="${escapeHtml(moodleUrl)}/theme/image.php/boost/${MOODLE_ACTIVITY_ICON_COMPONENTS[activity.id]}/0/monologo" alt="">`
        : '';
      return (
        `    <label class="checkbox-choice"><input type="checkbox" name="activity" value="${escapeHtml(activity.id)}"` +
        `${isChecked ? ' checked' : ''}>${icon}<span>${escapeHtml(activity.label)}</span></label>\n`
      );
    })
    .join('');

  return (
    '<article class="card card-wide" data-card-id="activities">\n' +
    '  <div class="card-header">\n' +
    '    <h2>MCP-Aktivitäten</h2>\n' +
    '    <button class="card-edit btn-tertiary" type="button" data-card-id="activities" aria-expanded="false">Ändern</button>\n' +
    '  </div>\n' +
    `  <p class="card-summary" data-card-summary="activities">${escapeHtml(activitiesSummaryText(status))}</p>\n` +
    '  <div class="card-detail" data-card-detail="activities" hidden>\n' +
    choices +
    '    <button class="btn-primary card-save" type="button" data-card-id="activities">Speichern</button>\n' +
    '    <p class="card-save-status" data-card-save-status="activities" role="status" aria-live="polite"></p>\n' +
    '  </div>\n' +
    '  <div class="card-restart" data-card-restart="activities"></div>\n' +
    '</article>\n'
  );
}

function cropBackendSummaryText(imageMagick) {
  if (!imageMagick) {
    return '–';
  }
  if (imageMagick.sipsActive) {
    return imageMagick.preferredBackend === 'imagemagick' ? 'ImageMagick' : 'sips';
  }
  return imageMagick.available ? 'ImageMagick' : '–';
}

/**
 * Card 'Bildbearbeitung' (Issue #204, Spec 0005 S4; Issue #234: asynchrone
 * Installation mit Polling): exklusive Radios sips|ImageMagick, Instant-Save
 * über POST /apply/crop-backend. Die Radios erscheinen nur, wenn beide
 * Backends verfügbar sind (sipsActive && available). Auf macOS ohne
 * ImageMagick zeigt die Card die Speicherplatz-Postenliste und einen
 * Installationsknopf; die Installation laeuft asynchron mit Polling.
 * Auf Windows (sipsActive=false) bleibt es beim bisherigen Verhalten.
 */
function renderCropBackendCard(status, options = {}) {
  const imageMagick = status.imageMagick;
  const bothAvailable = Boolean(imageMagick && imageMagick.sipsActive && imageMagick.available);
  const preferImageMagick = Boolean(imageMagick && imageMagick.preferredBackend === 'imagemagick');
  const sipsActive = Boolean(imageMagick && imageMagick.sipsActive);

  const installState = options.installState || { status: 'idle', error: null };
  const installStateAttr = installState.status !== 'idle'
    ? ` data-install-state="${escapeHtml(installState.status)}"`
    : '';

  const imageMagickAvailable = Boolean(imageMagick && imageMagick.available);
  let detail;
  if (bothAvailable) {
    detail =
      '    <label class="radio-choice"><input type="radio" name="cropBackend" value="sips"' + (preferImageMagick ? '' : ' checked') + '> sips (eingebautes macOS-Tool)</label>\n' +
      '    <label class="radio-choice"><input type="radio" name="cropBackend" value="imagemagick"' + (preferImageMagick ? ' checked' : '') + '> ImageMagick</label>\n' +
      '    <button class="btn-primary card-save" type="button" data-card-id="crop-backend">Speichern</button>\n' +
      '    <p class="card-save-status" data-card-save-status="crop-backend" role="status" aria-live="polite"></p>\n';
  } else if (imageMagickAvailable) {
    detail =
      '    <p>ImageMagick ist auf diesem Rechner installiert.</p>\n' +
      '    <button class="btn-primary card-save" type="button" data-card-id="crop-backend">Neu installieren/reparieren</button>\n' +
      '    <p class="card-save-status" data-card-save-status="crop-backend" role="status" aria-live="polite"></p>\n' +
      '    <input type="hidden" name="installImageMagick" value="1">\n';
  } else if (sipsActive) {
    detail =
      '    <p>ImageMagick ist auf diesem Rechner noch nicht installiert.</p>\n' +
      renderImageMagickDiskUsageList() +
      '    <button class="btn-primary card-save" type="button" data-card-id="crop-backend">Installieren</button>\n' +
      '    <p class="card-save-status" data-card-save-status="crop-backend" role="status" aria-live="polite"></p>\n' +
      '    <input type="hidden" name="installImageMagick" value="1">\n';
  } else {
    detail =
      '    <p>ImageMagick ist auf diesem Rechner noch nicht installiert.</p>\n' +
      '    <button class="btn-primary card-save" type="button" data-card-id="crop-backend">Installieren</button>\n' +
      '    <p class="card-save-status" data-card-save-status="crop-backend" role="status" aria-live="polite"></p>\n' +
      '    <input type="hidden" name="installImageMagick" value="1">\n';
  }

  return (
    `<article class="card" data-card-id="crop-backend"${installStateAttr}>\n` +
    '  <div class="card-header">\n' +
    '    <h2>Bildbearbeitung</h2>\n' +
    '    <button class="card-edit btn-tertiary" type="button" data-card-id="crop-backend" aria-expanded="false">Ändern</button>\n' +
    '  </div>\n' +
    `  <p class="card-summary" data-card-summary="crop-backend">${escapeHtml(cropBackendSummaryText(imageMagick))}</p>\n` +
    '  <div class="card-detail" data-card-detail="crop-backend" hidden>\n' +
    detail +
    '  </div>\n' +
    '</article>\n'
  );
}

/**
 * Card 'Version' (Issue #204, Spec 0005 S4): async Update-Check über das
 * bestehende GET /check-updates mit Ladestate; bei verfügbarem Update wechselt
 * das Button-Label auf 'Installieren' (→ bestehendes POST /apply-updates). Das
 * Ergebnis wird inline in der Card gerendert. Der Prüfknopf sitzt wie die
 * übrigen Card-Aktionen im Header; bei einem Update wird er zu Installieren.
 */
function renderVersionCard() {
  return (
    '<article class="card" data-card-id="version" tabindex="-1">\n' +
    '  <div class="card-header">\n' +
    '    <h2>Version</h2>\n' +
    '    <button class="version-check-button btn-tertiary" type="button" data-action="check">erneut prüfen</button>\n' +
    '  </div>\n' +
    '  <p class="card-summary" data-card-summary="version" role="status" aria-live="polite">–</p>\n' +
    '  <p class="version-result" role="status" aria-live="polite"></p>\n' +
    '  <div data-card-detail="version" hidden></div>\n' +
    '</article>\n'
  );
}

/**
 * Fortschrittsband der Wartungsansicht (Issue #230, Spec 0007): `progress`
 * ({done, total}) und `nextCondition` ({cardId, label}) kommen vom Aufrufer
 * (setup-browser-server.js ruft setup-flow.js#computeSetupProgress bzw.
 * #nextOpenCondition) - render-Funktionen rufen selbst keine setup-flow-
 * Funktionen auf (Issue #148). Sichtbar genau dann, wenn noch etwas offen ist
 * (done < total); bei erledigtem Fortschritt (6/6) leer, damit die ruhige
 * Wartungsansicht ohne Band bleibt.
 */
function renderMaintenanceProgress(progress, nextCondition) {
  if (!progress || !nextCondition || progress.done >= progress.total) {
    return '';
  }
  const { done, total } = progress;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    '    <div class="maintenance-progress" role="status" data-maintenance-progress>\n' +
    '      <div class="maintenance-progress-meter">\n' +
    `        <p class="maintenance-progress-text">Schritt ${done} von ${total} erledigt</p>\n` +
    '        <div class="maintenance-progress-bar" aria-hidden="true">\n' +
    `          <div class="maintenance-progress-fill" style="width:${percent}%"></div>\n` +
    '        </div>\n' +
    '      </div>\n' +
    `      <button class="btn-primary maintenance-progress-next" type="button" data-next-card="${escapeHtml(nextCondition.cardId)}">Weiter zu: ${escapeHtml(nextCondition.label)}</button>\n` +
    '    </div>\n'
  );
}

/**
 * Erfolgsbanner der Wartungsansicht (Issue #231, Spec 0007): erscheint, sobald
 * der Fortschritt erstmals in dieser Konfigurator-Session das Maximum erreicht
 * (done === total && wasIncomplete). `wasIncomplete` kommt vom Aufrufer
 * (setup-browser-server.js pflegt die In-Memory-Flag ueber alle Renders der
 * Session); ohne sie bleibt die Ansicht bei 6/6 ruhig - weder Band noch Banner.
 * Band und Banner schliessen sich ueber den Fortschritt gegenseitig aus.
 */
function renderMaintenanceSuccessBanner(progress, wasIncomplete) {
  if (!wasIncomplete || !progress || progress.done < progress.total) {
    return '';
  }
  return (
    '    <div class="maintenance-success-banner" role="status" data-maintenance-success>\n' +
    '      Kurspilot ist eingerichtet — Sie sind startklar\n' +
    '    </div>\n'
  );
}

function renderMaintenancePage(status, options = {}) {
  return (
    '<!doctype html>\n' +
    '<html lang="de">\n' +
    '<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '  <title>Kurspilot</title>\n' +
    '  <style>\n' +
    // Issue #211 (Spec 0006 Scheibe 1): semantische Light-Mode-Tokens als
    // gemeinsame Grundlage fuer Farben, Abstaende, Radien und Erhebung.
    // Issue #214: Dark Mode tauscht ausschliesslich diese Farbwerte.
    '    :root {\n' +
    '      color-scheme: light;\n' +
    '      --kp-surface: #f7f9fb;\n' +
    '      --kp-surface-raised: #ffffff;\n' +
    '      --kp-surface-sunken: #e4e7eb;\n' +
    '      --kp-surface-sunken-hover: #d7dbe1;\n' +
    '      --kp-surface-sunken-active: #c9cfd6;\n' +
    '      --kp-text: #1f2933;\n' +
    '      --kp-text-muted: #52606d;\n' +
    '      --kp-border: #d5dce3;\n' +
    '      --kp-accent: #0a66ff;\n' +
    '      --kp-accent-hover: #0856d9;\n' +
    '      --kp-accent-active: #064ab8;\n' +
    '      --kp-accent-subtle: #e9f1ff;\n' +
    '      --kp-accent-subtle-active: #d8e5ff;\n' +
    '      --kp-on-accent: #ffffff;\n' +
    '      --kp-success: #107c10;\n' +
    '      --kp-danger: #b00020;\n' +
    '      --kp-danger-hover: #9c001c;\n' +
    '      --kp-danger-active: #850018;\n' +
    '      --kp-on-danger: #ffffff;\n' +
    '      --kp-focus: #0a66ff;\n' +
    '      --kp-space-xs: 0.25rem;\n' +
    '      --kp-space-sm: 0.5rem;\n' +
    '      --kp-space-md: 0.75rem;\n' +
    '      --kp-space-lg: 1rem;\n' +
    '      --kp-space-xl: 1.5rem;\n' +
    '      --kp-space-2xl: 2rem;\n' +
    '      --kp-radius-sm: 4px;\n' +
    '      --kp-radius-md: 8px;\n' +
    '      --kp-elevation-1: 0 1px 2px rgba(15, 23, 32, 0.08);\n' +
    '      --kp-elevation-2: 0 6px 16px rgba(15, 23, 32, 0.16);\n' +
    '      --kp-target-size: 44px;\n' +
    '      --kp-card-closed-height: 9rem;\n' +
    '    }\n' +
    // Issue #214: Dark Mode folgt der OS-Praeferenz (prefers-color-scheme) ohne
    // gespeicherte Einstellung. Nur die semantischen Farbwerte werden getauscht;
    // Struktur, Abstaende, Radien und Rollen bleiben identisch. color-scheme: dark
    // laesst native Formularelemente (Checkboxen, Radios, Scrollbalken) mitfolgen.
    '    @media (prefers-color-scheme: dark) {\n' +
    '      :root {\n' +
    '        color-scheme: dark;\n' +
    '        --kp-surface: #12161b;\n' +
    '        --kp-surface-raised: #1b2129;\n' +
    '        --kp-surface-sunken: #262e38;\n' +
    '        --kp-surface-sunken-hover: #2e3742;\n' +
    '        --kp-surface-sunken-active: #36414d;\n' +
    '        --kp-text: #e8edf2;\n' +
    '        --kp-text-muted: #a3b1bf;\n' +
    '        --kp-border: #3c4654;\n' +
    '        --kp-accent: #6ea8ff;\n' +
    '        --kp-accent-hover: #8ab8ff;\n' +
    '        --kp-accent-active: #a5c9ff;\n' +
    '        --kp-accent-subtle: #1f3050;\n' +
    '        --kp-accent-subtle-active: #2a4066;\n' +
    '        --kp-on-accent: #0c1526;\n' +
    '        --kp-success: #5bd08d;\n' +
    '        --kp-danger: #ff7d8c;\n' +
    '        --kp-danger-hover: #ff98a4;\n' +
    '        --kp-danger-active: #ffb2bc;\n' +
    '        --kp-on-danger: #330a11;\n' +
    '        --kp-focus: #8ab8ff;\n' +
    '        --kp-elevation-1: 0 1px 2px rgba(0, 0, 0, 0.45);\n' +
    '        --kp-elevation-2: 0 6px 16px rgba(0, 0, 0, 0.55);\n' +
    '      }\n' +
    '    }\n' +
    '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: var(--kp-surface); color: var(--kp-text); line-height: 1.5; }\n' +
    '    .maintenance-header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--kp-space-sm) var(--kp-space-lg); max-width: 1100px; margin: 0 auto; padding: var(--kp-space-2xl) var(--kp-space-xl) var(--kp-space-sm); }\n' +
    '    .maintenance-header h1 { margin: 0; font-size: 1.9rem; line-height: 1.2; }\n' +
    '    .maintenance-header .subtitle { margin: 0; color: var(--kp-text-muted); }\n' +
    '    .status-line { margin: 0; color: var(--kp-success); font-weight: 600; white-space: nowrap; }\n' +
    '    main { max-width: 1100px; margin: 0 auto; padding: var(--kp-space-lg) var(--kp-space-xl) var(--kp-space-2xl); }\n' +
    // Issue #230: Fortschrittsband oberhalb der Cards; nutzt semantische Tokens
    // und folgt damit automatisch dem Dark Mode (#214).
    '    .maintenance-progress { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--kp-space-md) var(--kp-space-lg); margin: 0 0 var(--kp-space-lg); padding: var(--kp-space-md) var(--kp-space-lg); background: var(--kp-accent-subtle); border: 1px solid var(--kp-border); border-radius: var(--kp-radius-md); }\n' +
    '    .maintenance-progress-meter { flex: 1 1 240px; }\n' +
    '    .maintenance-progress-text { margin: 0; font-weight: 600; }\n' +
    '    .maintenance-progress-bar { height: 8px; background: var(--kp-surface-sunken); border-radius: 999px; overflow: hidden; margin-top: var(--kp-space-xs); }\n' +
    '    .maintenance-progress-fill { height: 100%; background: var(--kp-accent); }\n' +
    // Issue #231: Erfolgsbanner oberhalb der Cards; --kp-success folgt dem
    // Dark Mode (#214) ohne eigene Farbwerte.
    '    .maintenance-success-banner { margin: 0 0 var(--kp-space-lg); padding: var(--kp-space-md) var(--kp-space-lg); border: 1px solid var(--kp-success); border-left: 4px solid var(--kp-success); border-radius: var(--kp-radius-md); background: var(--kp-surface-raised); color: var(--kp-success); font-weight: 600; }\n' +
    '    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--kp-space-lg); align-items: start; }\n' +
    '    .card-column { display: grid; align-content: start; gap: var(--kp-space-lg); }\n' +
    '    @media (max-width: 959px) { :root { --kp-card-closed-height: 12rem; } }\n' +
    '    @media (max-width: 959px) { .card-grid { grid-template-columns: 1fr; } }\n' +
    '    .card { display: flex; flex-direction: column; background: var(--kp-surface-raised); border: 1px solid var(--kp-border); border-radius: var(--kp-radius-md); box-shadow: var(--kp-elevation-1); padding: var(--kp-space-lg); transition: border-color 120ms ease, box-shadow 120ms ease; }\n' +
    '    .card:not(.is-open) { box-sizing: border-box; height: var(--kp-card-closed-height); }\n' +
    // Issue #212: genau die geöffnete Card erhält einen sichtbaren offenen
    // Zustand (Akzent-Rahmen + erhöhte Schattenstufe). Kurzer Uebergang nur
    // auf Rahmen/Schatten - keine Layout-Eigenschaft, daher keine Verschiebung.
    '    .card.is-open { border-color: var(--kp-accent); box-shadow: var(--kp-elevation-2); }\n' +
    // Issue #235: Moodle- und Aktivitäten-Card öffnen zwei Rasterspalten breit.
    // Die Cards liegen in Kartenspalten (.card-column), darum bekommt die
    // enthaltende Spalte den Spann - die Card füllt sie und die Nachbar-Cards
    // in derselben Spalte behalten ihre volle Breite. Der Inhalt der geöffneten
    // Card fließt als Block in zwei Textspalten (column-count greift nicht auf
    // Grid-Boxen); break-inside hält Checkbox-Zeilen und Anleitung am Stück.
    '    .card-column:has(.card.is-open.card-wide) { grid-column: span 2; }\n' +
    '    .card.is-open.card-wide .card-detail { display: block; column-count: 2; column-gap: var(--kp-space-lg); }\n' +
    '    .card.is-open.card-wide .card-detail > * { break-inside: avoid; }\n' +
    '    .card.is-open.card-wide .card-detail > * + * { margin-top: var(--kp-space-sm); }\n' +
    '    .card.is-open.card-wide .card-detail > button { box-sizing: border-box; width: 100%; }\n' +
    '    @media (max-width: 959px) { .card-column:has(.card.is-open.card-wide) { grid-column: span 1; } .card.is-open.card-wide .card-detail { display: grid; column-count: 1; } .card.is-open.card-wide .card-detail > * + * { margin-top: 0; } }\n' +
    '    [data-card-id="version"]:focus { outline: none; border-color: var(--kp-accent); box-shadow: var(--kp-elevation-2); }\n' +
    '    .card-header { display: flex; align-items: center; justify-content: space-between; gap: var(--kp-space-sm); }\n' +
    '    .card-header h2 { margin: 0; font-size: 1.1rem; }\n' +
    '    .card-summary { flex: 1 1 auto; margin: var(--kp-space-xs) 0 0; color: var(--kp-text-muted); overflow-wrap: break-word; }\n' +
    '    .card-summary:not([data-card-summary="activities"]) { overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }\n' +
    '    [hidden] { display: none !important; }\n' +
    '    .card-detail { margin-top: var(--kp-space-md); display: grid; gap: var(--kp-space-sm); }\n' +
    '    .card-detail label:not(.checkbox-choice):not(.radio-choice) { display: grid; gap: var(--kp-space-xs); font-size: 0.9rem; font-weight: 600; }\n' +
    // Issue #214: Eingaben nutzen Oberflaechen- und Text-Tokens statt Browser-
    // Defaults, damit sie in beiden Farbschemata unterscheidbar bleiben.
    '    .card-detail input { font: inherit; font-weight: 400; background: var(--kp-surface-raised); color: var(--kp-text); box-sizing: border-box; width: 100%; min-height: var(--kp-target-size); padding: var(--kp-space-xs) var(--kp-space-md); border: 1px solid var(--kp-border); border-radius: var(--kp-radius-sm); }\n' +
    '    .card-save-status { margin: 0; color: var(--kp-text-muted); font-size: 0.9rem; }\n' +
    '    .card-path { word-break: break-all; }\n' +
    // Issue #235: die Anleitung-Grafik schrumpft auf Spalten-/Card-Breite mit,
    // sonst überläuft sie die Textspalte (und bei schmalem Fenster die Card).
    '    img.token-help { display: block; width: min(100%, 620px); height: auto; margin-top: 0.75rem; border: 1px solid var(--kp-border); }\n' +
    '    .checkbox-choice, .radio-choice { display: flex; align-items: center; font-weight: 400; }\n' +
    '    .checkbox-choice { gap: var(--kp-space-xs); min-height: var(--kp-target-size); }\n' +
    '    .radio-choice { gap: var(--kp-space-sm); min-height: var(--kp-target-size); }\n' +
    '    .checkbox-choice input { width: 1.25rem; height: 1.25rem; min-height: 0; margin: 0; }\n' +
    '    .radio-choice input { width: auto; min-height: 0; }\n' +
    '    [data-card-detail="activities"] { gap: 0; }\n' +
    '    .activity-icon { width: 1.25rem; height: 1.25rem; flex: 0 0 1.25rem; }\n' +
    '    .card-restart { display: grid; gap: var(--kp-space-sm); margin-top: var(--kp-space-sm); }\n' +
    '    .card-restart:empty { margin-top: 0; }\n' +
    '    .restart-notice { margin: 0; color: var(--kp-text-muted); font-size: 0.9rem; }\n' +
    '    .restart-client-status { margin-left: var(--kp-space-sm); color: var(--kp-text-muted); font-size: 0.9rem; }\n' +
    '    .version-result { margin: 0; color: var(--kp-text-muted); font-size: 0.9rem; }\n' +
    '    .version-result:empty { display: none; }\n' +
    '    .card-column-actions { display: flex; align-items: center; gap: var(--kp-space-sm); margin-top: var(--kp-space-lg); }\n' +
    '    .card-column-actions--end { justify-content: end; }\n' +
    '    button { font: inherit; cursor: pointer; }\n' +
    '    button:focus-visible, input:focus-visible { outline: 3px solid var(--kp-focus); outline-offset: 2px; }\n' +
    // Issue #211: vier Button-Rollen (primaer/sekundaer/tertiaer/destruktiv),
    // jede mit Hover-, Press-, focus-visible- und Disabled-Zustand; alle
    // interaktiven Flaeche erfuellen mindestens 44px Hoehe (Touch-Bedienung).
    '    .btn-primary, .btn-secondary, .btn-tertiary, .btn-destructive { min-height: var(--kp-target-size); padding: var(--kp-space-sm) var(--kp-space-lg); border: 1px solid transparent; border-radius: var(--kp-radius-sm); }\n' +
    '    .btn-primary:disabled, .btn-secondary:disabled, .btn-tertiary:disabled, .btn-destructive:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }\n' +
    '    .btn-primary { background: var(--kp-accent); border-color: var(--kp-accent); color: var(--kp-on-accent); box-shadow: var(--kp-elevation-1); }\n' +
    '    .btn-primary:hover { background: var(--kp-accent-hover); border-color: var(--kp-accent-hover); }\n' +
    '    .btn-primary:active { background: var(--kp-accent-active); border-color: var(--kp-accent-active); box-shadow: none; }\n' +
    '    .btn-secondary { background: var(--kp-surface-sunken); border-color: var(--kp-border); color: var(--kp-text); }\n' +
    '    .btn-secondary:hover { background: var(--kp-surface-sunken-hover); }\n' +
    '    .btn-secondary:active { background: var(--kp-surface-sunken-active); }\n' +
    '    .btn-tertiary { background: var(--kp-surface-raised); border-color: var(--kp-border); color: var(--kp-accent); text-decoration: none; padding: var(--kp-space-xs) var(--kp-space-sm); }\n' +
    '    .btn-tertiary:hover { background: var(--kp-accent-subtle); border-color: var(--kp-accent); }\n' +
    '    .btn-tertiary:active { background: var(--kp-accent-subtle-active); border-color: var(--kp-accent-active); color: var(--kp-accent-active); }\n' +
    '    .btn-destructive { background: var(--kp-surface-raised); border-color: var(--kp-danger); color: var(--kp-danger); }\n' +
    '    .btn-destructive:hover { background: var(--kp-danger); border-color: var(--kp-danger); color: var(--kp-on-danger); }\n' +
    '    .btn-destructive:active { background: var(--kp-danger-active); border-color: var(--kp-danger-active); color: var(--kp-on-danger); }\n' +
    '    .version-check-button[data-action="install"] { background: var(--kp-accent); border-color: var(--kp-accent); color: var(--kp-on-accent); box-shadow: var(--kp-elevation-1); }\n' +
    '    .version-check-button[data-action="install"]:hover { background: var(--kp-accent-hover); border-color: var(--kp-accent-hover); }\n' +
    '    .version-check-button[data-action="install"]:active { background: var(--kp-accent-active); border-color: var(--kp-accent-active); box-shadow: none; }\n' +
    '    #abort-status { margin-left: var(--kp-space-md); color: var(--kp-text-muted); }\n' +
    '    #service-stopped-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: var(--kp-space-xl); background: var(--kp-surface); }\n' +
    '    #service-stopped-overlay > div { max-width: 32rem; padding: var(--kp-space-xl); background: var(--kp-surface-raised); border: 1px solid var(--kp-border); border-radius: var(--kp-radius-md); box-shadow: var(--kp-elevation-2); text-align: center; }\n' +
    '    #service-stopped-overlay h2 { margin-top: 0; }\n' +
    '    @media (prefers-reduced-motion: reduce) { .card { transition: none; } }\n' +
    '    @media (prefers-color-scheme: dark) { .activity-icon { filter: invert(1); opacity: 0.75; } }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    SERVER_GONE_BANNER +
    '  <aside id="service-stopped-overlay" hidden aria-live="assertive">\n' +
    '    <div>\n' +
    '      <h2>Dienst beendet</h2>\n' +
    '      <p>Der Kurspilot-Dienst ist jetzt beendet. Sie können diesen Tab schließen.</p>\n' +
    '    </div>\n' +
    '  </aside>\n' +
    '  <header class="maintenance-header">\n' +
    '    <div>\n' +
    '      <h1>Kurspilot</h1>\n' +
    '      <p class="subtitle">Einstellungen</p>\n' +
    '    </div>\n' +
    '    <p class="status-line">● Alles läuft · Zuletzt geprüft: <span id="last-checked">gerade eben</span></p>\n' +
    '  </header>\n' +
    '  <main>\n' +
    renderMaintenanceProgress(options.progress, options.nextCondition) +
    renderMaintenanceSuccessBanner(options.progress, options.wasIncomplete) +
    '    <div class="card-grid" id="maintenance-cards">\n' +
    '      <div class="card-column">\n' +
    renderMoodleCard(status) +
    renderActivitiesCard(status) +
    '        <div class="card-column-actions">\n' +
    // Issue #211: keine Emoji als strukturelle Icons - der sichtbare Text
    // bleibt das alleinige Beschriftungsmittel der Footer-Aktionen.
    '          <button id="abort-button" class="btn-abort btn-destructive" type="button">Dienst beenden</button>\n' +
    '          <button id="reset-settings-button" class="btn-reset-settings btn-tertiary" type="button">Einstellungen zurücksetzen</button>\n' +
    '          <span id="abort-status" role="status" aria-live="polite"></span>\n' +
    '        </div>\n' +
    '      </div>\n' +
    '      <div class="card-column">\n' +
    renderWorkspaceCard(status) +
    renderCropBackendCard(status, options) +
    '      </div>\n' +
    '      <div class="card-column">\n' +
    renderClientsCard(status) +
    renderVersionCard() +
    '      </div>\n' +
    '    </div>\n' +
    '  </main>\n' +
    '  <script>\n' +
    '    function currentToken() {\n' +
    '      return new URLSearchParams(window.location.search).get("token") || "";\n' +
    '    }\n' +
    '    document.getElementById("last-checked").textContent = new Date().toLocaleTimeString("de-DE");\n' +
    '    document.getElementById("abort-button").addEventListener("click", async () => {\n' +
    '      const statusLine = document.getElementById("abort-status");\n' +
    '      window.kurspilotServiceStopped = true;\n' +
    '      statusLine.textContent = "Dienst wird beendet…";\n' +
    '      try {\n' +
    '        await fetch(`/abort?token=${encodeURIComponent(currentToken())}`, { method: "POST" });\n' +
    '      } catch {\n' +
    '        // Der Dienst beendet sich selbst; Verbindung bricht erwartungsgemaess ab.\n' +
    '      }\n' +
    '      statusLine.textContent = "Dienst beendet. Sie können diesen Tab schließen.";\n' +
    '      document.querySelector("header").inert = true;\n' +
    '      document.querySelector("main").inert = true;\n' +
    '      document.getElementById("service-stopped-overlay").hidden = false;\n' +
    '    });\n' +
    '    document.getElementById("reset-settings-button").addEventListener("click", async () => {\n' +
    '      if (!window.confirm("Alle Kurspilot-Einstellungen entfernen? Moodle-Zugangsdaten, MCP-Einträge und installierte Skills werden gelöscht. Ihr Arbeitsordner bleibt erhalten.")) {\n' +
    '        return;\n' +
    '      }\n' +
    '      const response = await fetch(`/reset-settings?token=${encodeURIComponent(currentToken())}`, { method: "POST" });\n' +
    '      if (response.ok) {\n' +
    '        window.location.reload();\n' +
    '      }\n' +
    '    });\n' +
    '    function moodleSummaryText(moodle) {\n' +
    '      const url = moodle.url || "Moodle-URL fehlt";\n' +
    '      const token = moodle.tokenPresent ? "Token gespeichert" : "Token fehlt";\n' +
    '      return `${url} · ${token}`;\n' +
    '    }\n' +
    '    function workspaceSummaryText(workspace) {\n' +
    '      return workspace.configured && workspace.path ? workspace.path : "Nicht eingerichtet";\n' +
    '    }\n' +
    '    function cropBackendSummaryText(imageMagick) {\n' +
    '      if (!imageMagick) return "–";\n' +
    '      if (imageMagick.sipsActive) return imageMagick.preferredBackend === "imagemagick" ? "ImageMagick" : "sips";\n' +
    '      return imageMagick.available ? "ImageMagick" : "–";\n' +
    '    }\n' +
    '    function clientLabel(name) {\n' +
    '      if (name === "codex") return "Codex";\n' +
    '      if (name === "claude") return "Claude";\n' +
    '      if (name === "opencode") return "opencode";\n' +
    '      return name;\n' +
    '    }\n' +
    '    function clientsSummaryText(status) {\n' +
    '      const labels = Object.entries(status.detectedClients)\n' +
    '        .filter(([, detected]) => detected)\n' +
    '        .map(([client]) => clientLabel(client));\n' +
    '      return labels.length > 0 ? labels.join(", ") : "Kein Client erkannt";\n' +
    '    }\n' +
    `    const ACTIVITIES_DATA = ${JSON.stringify(listActivities().filter(a => a.apiSupported).map(a => ({ id: a.id, label: a.label, default: a.default })))};\n` +
    '    function activitiesSummaryText(status) {\n' +
    '      const configured = status.configuredActivityIds;\n' +
    '      const labels = ACTIVITIES_DATA.filter(a => configured === null ? a.default : configured.includes(a.id)).map(a => a.label);\n' +
    '      if (labels.length === 0) return "Keine Aktivitäten";\n' +
    '      return labels.length + " Aktivitäten: " + labels.join(" · ");\n' +
    '    }\n' +
    '    function cardSummaryText(cardId, status) {\n' +
    '      if (cardId === "moodle") return moodleSummaryText(status.moodle);\n' +
    '      if (cardId === "workspace") return workspaceSummaryText(status.workspace);\n' +
    '      if (cardId === "clients") return clientsSummaryText(status);\n' +
    '      if (cardId === "activities") return activitiesSummaryText(status);\n' +
    '      if (cardId === "crop-backend") return cropBackendSummaryText(status.imageMagick);\n' +
    '      return "";\n' +
    '    }\n' +
    '    function setCardOpen(cardId, open, restoreFocus) {\n' +
    '      const detail = document.querySelector(`[data-card-detail="${cardId}"]`);\n' +
    '      if (!detail) return;\n' +
    '      const card = detail.closest(".card");\n' +
    '      const trigger = card ? card.querySelector(".card-edit") : null;\n' +
    '      detail.hidden = !open;\n' +
    '      if (card) card.classList.toggle("is-open", open);\n' +
    '      if (trigger) trigger.setAttribute("aria-expanded", open ? "true" : "false");\n' +
    '      if (open) {\n' +
    '        const firstField = detail.querySelector("input, button, select, textarea");\n' +
    '        if (firstField) firstField.focus();\n' +
    '      } else if (restoreFocus && trigger) {\n' +
    '        trigger.focus();\n' +
    '      }\n' +
    '    }\n' +
    '    function closeAllCards() {\n' +
    '      for (const detail of document.querySelectorAll("[data-card-detail]")) {\n' +
    '        setCardOpen(detail.getAttribute("data-card-detail"), false, false);\n' +
    '      }\n' +
    '    }\n' +
    '    const OPENCODE_RESTART_NOTICE = "Beim nächsten opencode-Chat aktiv — kein Neustart nötig";\n' +
    '    function renderRestartBlock(cardId, entries) {\n' +
    '      const container = document.querySelector(`[data-card-restart="${cardId}"]`);\n' +
    '      if (!container) return;\n' +
    '      container.innerHTML = "";\n' +
    '      for (const entry of entries || []) {\n' +
    '        if (entry.kind === "notice") {\n' +
    '          const notice = document.createElement("p");\n' +
    '          notice.className = "restart-notice";\n' +
    '          notice.dataset.client = entry.client;\n' +
    '          notice.textContent = OPENCODE_RESTART_NOTICE;\n' +
    '          container.append(notice);\n' +
    '          continue;\n' +
    '        }\n' +
    '        const button = document.createElement("button");\n' +
    '        button.type = "button";\n' +
    '        button.className = "restart-client-button btn-primary";\n' +
    '        button.dataset.client = entry.client;\n' +
    '        button.textContent = `${clientLabel(entry.client)} beenden`;\n' +
    '        const status = document.createElement("span");\n' +
    '        status.className = "restart-client-status";\n' +
    '        button.addEventListener("click", async () => {\n' +
    '          button.disabled = true;\n' +
    '          status.textContent = "Wird beendet…";\n' +
    '          try {\n' +
    '            const response = await fetch(`/restart-client?token=${encodeURIComponent(currentToken())}`, {\n' +
    '              method: "POST",\n' +
    '              headers: { "content-type": "application/x-www-form-urlencoded" },\n' +
    '              body: `client=${encodeURIComponent(entry.client)}`,\n' +
    '            });\n' +
    '            await response.json();\n' +
    '            status.textContent = `${clientLabel(entry.client)} beendet – bitte neu öffnen.`;\n' +
    '          } catch {\n' +
    '            status.textContent = "Beenden nicht möglich.";\n' +
    '            button.disabled = false;\n' +
    '          }\n' +
    '        });\n' +
    '        container.append(button, status);\n' +
    '      }\n' +
    '    }\n' +
    '    for (const button of document.querySelectorAll(".card-edit")) {\n' +
    '      button.addEventListener("click", () => {\n' +
    '        const cardId = button.dataset.cardId;\n' +
    '        const detail = document.querySelector(`[data-card-detail="${cardId}"]`);\n' +
    '        const wasOpen = !detail.hidden;\n' +
    '        closeAllCards();\n' +
    '        setCardOpen(cardId, !wasOpen, wasOpen);\n' +
    '      });\n' +
    '    }\n' +
    // Issue #230: "Weiter zu …" oeffnet die Card der naechsten offenen Bedingung,
    // schliesst vorher offene Cards; setCardOpen fokussiert das erste Feld.
    '    (function initProgressNextButton() {\n' +
    '      const nextButton = document.querySelector(".maintenance-progress-next");\n' +
    '      if (!nextButton) return;\n' +
    '      nextButton.addEventListener("click", () => {\n' +
    '        closeAllCards();\n' +
    '        setCardOpen(nextButton.dataset.nextCard, true, false);\n' +
    '      });\n' +
    '    })();\n' +
    '    for (const button of document.querySelectorAll(".card-save")) {\n' +
    '      button.addEventListener("click", async () => {\n' +
    '        const cardId = button.dataset.cardId;\n' +
    '        const detail = document.querySelector(`[data-card-detail="${cardId}"]`);\n' +
    '        const statusEl = document.querySelector(`[data-card-save-status="${cardId}"]`);\n' +
    '        const body = new URLSearchParams();\n' +
    '        for (const input of detail.querySelectorAll("input")) {\n' +
    '          if ((input.type === "radio" || input.type === "checkbox") && !input.checked) continue;\n' +
    '          body.append(input.name, input.value);\n' +
    '        }\n' +
    '        const isImageMagickInstall = body.has("installImageMagick");\n' +
    '        button.disabled = true;\n' +
    '        statusEl.textContent = isImageMagickInstall ? "Installiere…" : "Speichern…";\n' +
    '        try {\n' +
    '          const response = await fetch(`/apply/${cardId}?token=${encodeURIComponent(currentToken())}`, {\n' +
    '            method: "POST",\n' +
    '            headers: { "content-type": "application/x-www-form-urlencoded" },\n' +
    '            body: body.toString(),\n' +
    '          });\n' +
    '          const result = await response.json();\n' +
    '          if (result.ok && result.installing) {\n' +
    '            statusEl.textContent = "Installation läuft…";\n' +
    '            pollCropInstallStatus(statusEl, button);\n' +
    '            return;\n' +
    '          }\n' +
    '          if (result.ok) {\n' +
    '            statusEl.textContent = isImageMagickInstall ? "Installiert." : "Gespeichert.";\n' +
    '            const summary = document.querySelector(`[data-card-summary="${cardId}"]`);\n' +
    '            if (summary && result.newStatus) summary.textContent = cardSummaryText(cardId, result.newStatus);\n' +
    '            renderRestartBlock(cardId, result.restartRequired);\n' +
    '            if (!result.restartRequired || result.restartRequired.length === 0) setCardOpen(cardId, false, true);\n' +
    '          } else {\n' +
    '            statusEl.textContent = `Fehler: ${result.error || "unbekannt"}`;\n' +
    '          }\n' +
    '        } catch {\n' +
    '          statusEl.textContent = "Speichern nicht möglich.";\n' +
    '        } finally {\n' +
    '          button.disabled = false;\n' +
    '        }\n' +
    '      });\n' +
    '    }\n' +
    // ponytail: Polling-Funktion + Neulade-Erkennung fuer die asynchrone
    // ImageMagick-Installation (#234). Eine Funktion, zwei Aufrufwege.
    '    function pollCropInstallStatus(statusEl, button) {\n' +
    '      if (button) button.disabled = true;\n' +
    '      const timer = setInterval(async () => {\n' +
    '        try {\n' +
    '          const response = await fetch(`/install-status?token=${encodeURIComponent(currentToken())}`);\n' +
    '          const state = await response.json();\n' +
    '          if (state.status === "running") {\n' +
    '            statusEl.textContent = "Installation läuft…";\n' +
    '          } else if (state.status === "success") {\n' +
    '            clearInterval(timer);\n' +
    '            statusEl.textContent = "Installiert.";\n' +
    '            window.location.reload();\n' +
    '          } else if (state.status === "failed") {\n' +
    '            clearInterval(timer);\n' +
    '            statusEl.textContent = `Fehler: ${state.error || "Installation fehlgeschlagen"}`;\n' +
    '            if (button) button.disabled = false;\n' +
    '          }\n' +
    '        } catch {\n' +
    '          // Server nicht erreichbar - Polling läuft weiter.\n' +
    '        }\n' +
    '      }, 1000);\n' +
    '    }\n' +
    '    (function resumeCropInstallPolling() {\n' +
    '      const card = document.querySelector("[data-card-id=\\"crop-backend\\"]");\n' +
    '      if (!card || card.dataset.installState !== "running") return;\n' +
    '      setCardOpen("crop-backend", true, false);\n' +
    '      const statusEl = document.querySelector("[data-card-save-status=\\"crop-backend\\"]");\n' +
    '      const button = card.querySelector(".card-save");\n' +
    '      if (statusEl) pollCropInstallStatus(statusEl, button);\n' +
    '    })();\n' +
    '    // ponytail: sharedSkillStorage-Option nur bei >=2 angehakten Clients sichtbar (#233)\n' +
    '    (function initSharedSkillStorageToggle() {\n' +
    '      const wrapper = document.querySelector("[data-shared-skill-storage]");\n' +
    '      if (!wrapper) return;\n' +
    '      const card = wrapper.closest("[data-card-id=\\"clients\\"]");\n' +
    '      function update() {\n' +
    '        wrapper.hidden = card.querySelectorAll("[name=\\"client\\"]:checked").length < 2;\n' +
    '      }\n' +
    '      for (const cb of card.querySelectorAll("[name=\\"client\\"]")) cb.addEventListener("change", update);\n' +
    '      update();\n' +
    '    })();\n' +
    '    for (const button of document.querySelectorAll(".choose-workspace-button")) {\n' +
    '      button.addEventListener("click", async () => {\n' +
    '        const detail = button.closest("[data-card-detail]");\n' +
    '        const field = detail.querySelector("[name=\\"workspacePath\\"]");\n' +
    '        const status = detail.querySelector(".choose-workspace-status");\n' +
    '        if (status) status.textContent = "";\n' +
    '        button.disabled = true;\n' +
    '        try {\n' +
    '          const response = await fetch(`/choose-workspace?current=${encodeURIComponent(field.value)}`);\n' +
    '          if (!response.ok) return;\n' +
    '          const result = await response.json();\n' +
    '          if (result.workspacePath) field.value = result.workspacePath;\n' +
    '          else if (result.error && status) status.textContent = `Ordnerdialog konnte nicht geöffnet werden: ${result.error}`;\n' +
    '        } catch {\n' +
    '          if (status) status.textContent = "Ordnerdialog konnte nicht geöffnet werden.";\n' +
    '        } finally {\n' +
    '          button.disabled = false;\n' +
    '        }\n' +
    '      });\n' +
    '    }\n' +
    '    (function initVersionCard() {\n' +
    '      const button = document.querySelector(".version-check-button");\n' +
    '      if (!button) return;\n' +
    '      const card = button.closest("[data-card-id=\\"version\\"]");\n' +
    '      const summary = document.querySelector(\'[data-card-summary="version"]\');\n' +
    '      const result = document.querySelector(".version-result");\n' +
    '      async function check(userInitiated) {\n' +
    '        if (userInitiated) closeAllCards();\n' +
    '        setCardOpen("version", true, false);\n' +
    '        button.disabled = true;\n' +
    '        button.textContent = "prüfe…";\n' +
    '        result.textContent = "";\n' +
    '        try {\n' +
    '          const response = await fetch("/check-updates");\n' +
    '          const data = await response.json();\n' +
    '          if (data.offline) {\n' +
    '            summary.textContent = "Offline";\n' +
    '            result.textContent = data.error || "Update-Prüfung war nicht möglich.";\n' +
    '            button.textContent = "erneut prüfen";\n' +
    '            button.dataset.action = "check";\n' +
    '            return;\n' +
    '          }\n' +
    '          const app = data.app || {};\n' +
    '          if (app.updateAvailable) {\n' +
    '            const hint = app.versionCurrent ? ` (${app.versionCurrent} → ${app.versionNew})` : ` (${app.versionNew})`;\n' +
    '            summary.textContent = `Update verfügbar${hint}`;\n' +
    '            button.textContent = "Installieren";\n' +
    '            button.dataset.action = "install";\n' +
    '          } else {\n' +
    '            const version = app.versionCurrent || app.versionNew || "";\n' +
    '            summary.textContent = version ? `Aktuelle Version: ${version}` : "Aktuellste Version vorhanden";\n' +
    '            button.textContent = "erneut prüfen";\n' +
    '            button.dataset.action = "check";\n' +
    '          }\n' +
    '        } catch {\n' +
    '          summary.textContent = "Prüfung nicht möglich";\n' +
    '          result.textContent = "Update-Prüfung war nicht möglich.";\n' +
    '          button.textContent = "erneut prüfen";\n' +
    '          button.dataset.action = "check";\n' +
    '        } finally {\n' +
    '          button.disabled = false;\n' +
    '          if (userInitiated) { if (card) card.focus(); } else { setCardOpen("version", false, false); }\n' +
    '        }\n' +
    '      }\n' +
    '      async function install() {\n' +
    '        closeAllCards();\n' +
    '        setCardOpen("version", true, false);\n' +
    '        button.disabled = true;\n' +
    '        button.textContent = "installiere…";\n' +
    '        result.textContent = "";\n' +
    '        try {\n' +
    '          const response = await fetch(`/apply-updates?token=${encodeURIComponent(currentToken())}`, { method: "POST" });\n' +
    '          const data = await response.json();\n' +
    '          if (data.offline) {\n' +
    '            result.textContent = data.error || "Update-Installation war nicht möglich.";\n' +
    '          } else if (data.skillInstallAborted) {\n' +
    '            result.textContent = "Update teilweise installiert: Skill-Konflikt. Bitte Ersteinrichtung für die Details öffnen.";\n' +
    '          } else {\n' +
    '            result.textContent = "Update installiert.";\n' +
    '            await check(true);\n' +
    '            return;\n' +
    '          }\n' +
    '          button.textContent = "erneut prüfen";\n' +
    '          button.dataset.action = "check";\n' +
    '        } catch {\n' +
    '          result.textContent = "Update-Installation war nicht möglich.";\n' +
    '          button.textContent = "erneut prüfen";\n' +
    '          button.dataset.action = "check";\n' +
    '        } finally {\n' +
    '          button.disabled = false;\n' +
    '          if (card) card.focus();\n' +
    '        }\n' +
    '      }\n' +
    '      button.addEventListener("click", () => {\n' +
    '        if (button.dataset.action === "install") install();\n' +
    '        else check(true);\n' +
    '      });\n' +
    '      check(false);\n' +
    '    })();\n' +
    '  </script>\n' +
    HEALTH_POLL_SCRIPT +
    '</body>\n' +
    '</html>\n'
  );
}



function renderSuccessNotice(title, lines, options = {}) {
  const idAttr = options.id ? ` id="${escapeHtml(options.id)}"` : '';
  const hiddenAttr = options.hidden ? ' hidden' : '';
  return (
    `<section${idAttr} class="success-notice"${hiddenAttr}>\n` +
    `  <h2>✓ ${escapeHtml(title)}</h2>\n` +
    `  <p>${lines.map(escapeHtml).join('<br>')}</p>\n` +
    '</section>\n'
  );
}





module.exports = {
  TOKEN_HELP_ASSET_URL,
  CLOSE_TAB_HINT,
  SUCCESS_NOTICE_STYLE,
  escapeHtml,
  renderMaintenancePage,
  renderMoodleCard,
  renderWorkspaceCard,
  renderClientsCard,
  renderActivitiesCard,
  renderCropBackendCard,
  renderVersionCard,
  workspaceSummaryText,
  clientsSummaryText,
  activitiesSummaryText,
  cropBackendSummaryText,
  renderSuccessNotice,
};
