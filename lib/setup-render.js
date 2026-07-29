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
  '      fetch("/health").then(function (response) {\n' +
  '        if (response.ok) { failures = 0; } else { failures += 1; }\n' +
  '      }).catch(function () {\n' +
  '        failures += 1;\n' +
  '      }).then(function () {\n' +
  '        if (failures >= 2) {\n' +
  '          var banner = document.getElementById("server-gone-banner");\n' +
  '          if (banner) banner.hidden = false;\n' +
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

function clientStatusText(name, detected) {
  const label = clientLabel(name);
  return `${label} wurde ${detected ? '' : 'nicht '}erkannt`;
}

// Issue #207: fehlende Minimum-Punkte werden als Verlust formuliert
// (Loss-Aversion) statt als neutrale Bestandsaufnahme - die positive
// Gegenseite bleibt erhalten. Die Reihenfolge folgt isMinimumConfigured/
// computeSetupProgress in lib/setup-flow.js. Wartungspunkte (ImageMagick,
// Aktivitäten) bleiben bewusst neutral.
function renderStatusItems(status) {
  const anyClientDetected = Object.values(status.detectedClients).some(Boolean);
  const items = [
    clientStatusText('codex', status.detectedClients.codex),
    clientStatusText('claude', status.detectedClients.claude),
    clientStatusText('opencode', status.detectedClients.opencode),
  ];

  if (!anyClientDetected) {
    items.push('Ohne KI-Client: Kurspilot ist nicht ansprechbar');
  }

  items.push(
    status.moodle.url
      ? 'Moodle-URL ist gespeichert'
      : 'Ohne Moodle-URL: keine Verbindung zum Kurs-System',
    status.moodle.tokenPresent
      ? 'Moodle-Token ist gespeichert'
      : 'Ohne Moodle-Token: keine Kurse abrufbar',
    status.workspace.configured
      ? 'Arbeitsbereich ist eingerichtet'
      : 'Ohne Arbeitsordner: kein lokaler Kurspilot-Kontext',
    status.kurspilotRepairRequired
      ? 'MCP nicht verdrahtet: KI-Client sieht Kurspilot nicht'
      : 'Kurspilot-Reparatur ist nicht erforderlich',
  );

  if (status.imageMagick && status.imageMagick.supported) {
    if (status.imageMagick.sipsActive) {
      items.push('Bildausschnitt läuft über das eingebaute macOS-Tool (sips)');
    }
    items.push(status.imageMagick.available ? 'ImageMagick ist installiert' : 'ImageMagick ist nicht installiert');
  }

  return items.map(item => `<li>${escapeHtml(item)}</li>`).join('\n');
}

/**
 * Erklaerender Absatz unter der Statusliste, NUR auf macOS mit aktivem sips
 * (Issue #136): positive Standard-Darstellung statt Alarm-Ton. Bewusst kurz
 * (Issue #139) - die Einschraenkungen (CMYK-JPEGs, animierte GIFs) stehen
 * bereits ausfuehrlich bei der ImageMagick-Option weiter unten.
 */
function renderSipsStatusNote(status) {
  if (!status.imageMagick || !status.imageMagick.sipsActive) {
    return '';
  }
  return (
    '      <p>Das eingebaute macOS-Tool (sips) schneidet Bilder zuverlässig zu - keine Installation ' +
    'nötig. Bei Problemen (CMYK-JPEGs, animierte GIFs): weiter unten auf ImageMagick wechseln.</p>\n'
  );
}

function renderClientChoices(status, disabled = false) {
  const clients = Object.entries(status.detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => {
      const label = clientLabel(client);
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

/**
 * Aktivitaets-MCP-Checkliste im Hauptflow (Issue #96): zeigt die in
 * lib/activity-registry.js gepflegten Aktivitaeten als Checkboxen - Core ist
 * immer aktiv und wird hier bewusst nicht aufgelistet (siehe
 * lib/mcp-config-setup.js, CORE_SERVER). Reichen das Setup-Tool unveraendert
 * per "activity"-Feldern weiter; die Abhaengigkeitsaufloesung (z.B. Quiz ->
 * Fragensammlung) passiert bereits in lib/mcp-config-setup.js und wird hier
 * nicht dupliziert.
 *
 * configuredActivityIds kommt aus lib/mcp-config-setup.js#readConfiguredActivityIds
 * (per buildSetupStatus durchgereicht): null bei Ersteinrichtung (noch keine
 * Auswahl gespeichert, Default-Buendel vorausgewaehlt), sonst die tatsaechlich
 * zuletzt geschriebene Auswahl (Issue #96-Folgefehler: vorher zeigte die
 * Checkliste bei jedem Lauf wieder das Default-Buendel, auch wenn vorher
 * gezielt abgewaehlt wurde).
 */
function renderActivityChecklist(configuredActivityIds, disabled = false) {
  const disabledAttr = disabled ? ' disabled' : '';
  const items = listActivities()
    .map(activity => {
      // Issue #96-Folgefehler: apiSupported:false (aktuell nur Forum) hat
      // kein moodle-mcp-*.js und keinen --server-Eintrag in start-mcp.js -
      // ankreuzbar wuerde einen kaputten MCP-Eintrag erzeugen, der beim
      // Start sofort abbricht. Deshalb fest deaktiviert, nie gecheckt,
      // unabhaengig vom Reparatur-Schalter.
      if (!activity.apiSupported) {
        return (
          '<li>' +
          `<label><input type="checkbox" name="activity" value="${escapeHtml(activity.id)}" disabled> ` +
          `${escapeHtml(activity.label)} (noch keine Moodle-API)</label>` +
          '</li>'
        );
      }
      const isChecked = configuredActivityIds === null
        ? activity.default
        : configuredActivityIds.includes(activity.id);
      const checked = isChecked ? ' checked' : '';
      return (
        '<li>' +
        `<label><input type="checkbox" name="activity" value="${escapeHtml(activity.id)}"` +
        ` data-enabled-by="kurspilot-setup-or-repair"${checked}${disabledAttr}> ` +
        `${escapeHtml(activity.label)}</label>` +
        '</li>'
      );
    })
    .join('\n');

  return (
    '<input type="hidden" name="activitiesSubmitted" value="1">\n' +
    '<p class="field-label">Aktivitäten (Core ist immer aktiv)</p>\n' +
    `<ul class="inline-list">${items}</ul>`
  );
}

function detectedClientLabels(status) {
  return Object.entries(status.detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => clientLabel(client));
}

/**
 * Geschaetzte Speicherplatz-Posten fuer die macOS-ImageMagick-Installation
 * (Issue #136, Brew-Installation seit Issue #137). Feste, dokumentierte
 * Schaetzwerte statt einer Live-Messung: `brew info imagemagick` liefert vor
 * der Installation keine zuverlaessige Gesamtgroessenangabe (Formel-Metadaten,
 * keine Download-/Installationsgroesse), ein generischer Bottle-Download ist
 * je nach macOS-Version/Architektur unterschiedlich gross. Werte basieren auf
 * der dokumentierten, typischen Homebrew-Erstinstallationsgroesse
 * (https://docs.brew.sh, "What are the disk space requirements?") und der
 * ueblichen ImageMagick-Bottle-Groesse inkl. Abhaengigkeiten (libpng, jpeg,
 * etc.) zum Zeitpunkt dieser Implementierung - keine Live-Messung in dieser
 * Session. Homebrew selbst wird nur dann als Posten gezeigt, wenn es noch
 * fehlt.
 */
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

/**
 * Option "Gemeinsame Skill-Ablage" (Issue #165): nur sichtbar, wenn
 * mindestens zwei Clients erkannt sind (Issue #183: opencode zaehlt gleich-
 * berechtigt mit) - JS aktualisiert die Sichtbarkeit dynamisch bei Aenderung
 * der Client-Auswahl. Lehrkraftsprache: kein "Symlink"/"Junction".
 */
function renderSharedStorageOption(status, disabled) {
  const detectedCount = Object.values(status.detectedClients).filter(Boolean).length;
  const hiddenAttr = detectedCount >= 2 ? '' : ' hidden';
  const disabledAttr = disabled ? ' disabled' : '';
  return (
    `        <div id="shared-storage-option"${hiddenAttr}>\n` +
    '          <p class="field-label">Skill-Ablage</p>\n' +
    `          <label><input type="checkbox" name="sharedSkillStorage" value="1" checked${disabledAttr} data-enabled-by="kurspilot-setup-or-repair"> Gemeinsame Skill-Ablage (empfohlen)</label>\n` +
    '          <p>Beide KI-Programme greifen auf dieselben Kurspilot-Bausteine zu. Wird ein Update eingespielt, profitieren beide sofort. Abwählen, wenn jedes Programm eine eigene Kopie erhalten soll – zum Beispiel, wenn die Bausteine in einem der Programme angepasst wurden.</p>\n' +
    '        </div>\n'
  );
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
 * Wartungszeile fuer ImageMagick (Issue #136). Zwei Darstellungen:
 * - Windows (sipsActive=false): ImageMagick ist der einzige Crop-Pfad,
 *   bisheriger Ton bleibt (kein "nachrangig"-Hinweis).
 * - macOS (sipsActive=true): sips ist bereits aktiv, ImageMagick wird klar
 *   als nachrangige, optionale Zusatzinstallation mit vorab sichtbarer
 *   Speicherplatz-Postenliste dargestellt (kein Alarm-Ton).
 */
function renderImageMagickMaintenanceRow(status, imageMagickArea, preselected) {
  if (!imageMagickArea) {
    return '';
  }

  const available = Boolean(status.imageMagick && status.imageMagick.available);

  if (status.imageMagick && status.imageMagick.sipsActive) {
    return (
      '    <article class="maintenance-row">\n' +
      '      <div>\n' +
      `        ${renderChangeCheckbox('imagemagick-install', `Nur bei diesen Problemen: ${imageMagickArea.label}`, preselected)}\n` +
      '        <p data-change-status data-current="Optionaler Zusatz, sips bleibt aktiv" data-selected="Wird installiert">Optionaler Zusatz, sips bleibt aktiv</p>\n' +
      '      </div>\n' +
      '      <div>\n' +
      '        <p>Nur nötig bei animierten GIFs oder CMYK-JPEGs ohne Farbprofil - dort kann sips Bilder anders ' +
      'verarbeiten als ImageMagick. Für den normalen Bildausschnitt ist sips bereits ausreichend.</p>\n' +
      renderImageMagickDiskUsageList() +
      '      </div>\n' +
      '    </article>\n'
    );
  }

  const currentStatus = available ? 'ImageMagick ist installiert' : 'ImageMagick fehlt noch';
  const selectedStatus = available ? 'Wird neu installiert' : 'Wird installiert';

  return (
    '    <article class="maintenance-row">\n' +
    '      <div>\n' +
    `        ${renderChangeCheckbox('imagemagick-install', imageMagickArea.label, preselected)}\n` +
    `        <p data-change-status data-current="${currentStatus}" data-selected="${selectedStatus}">${currentStatus}</p>\n` +
    '      </div>\n' +
    '      <div>\n' +
    '        <p>Ermöglicht der KI, Bilder im Kurs passgenau zuzuschneiden (Gezielter Bildausschnitt). ' +
    'Wenig Zusatzaufwand: einmal hier bestätigen, der Rest läuft automatisch.</p>\n' +
    '      </div>\n' +
    '    </article>\n'
  );
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
  const imageMagickRow = renderImageMagickMaintenanceRow(status, imageMagickArea, preselected);
  const cropBackendRow = renderCropBackendSwitchRow(status);

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
    renderSharedStorageOption(status, !preselected.has('kurspilot-setup-or-repair')) +
    `        ${renderActivityChecklist(status.configuredActivityIds, !preselected.has('kurspilot-setup-or-repair'))}\n` +
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
    '        <p id="choose-workspace-status" role="status" aria-live="polite"></p>\n' +
    `        <input type="hidden" name="workspaceSelectionConfirmed" value="1"${workspaceDisabled} data-enabled-by="workspace-change">\n` +
    '      </div>\n' +
    '    </article>\n' +
    cropBackendRow +
    imageMagickRow +
    '  </div>\n' +
    '</section>\n'
  );
}

/**
 * Echter zweiseitiger Schalter sips|ImageMagick (Issue #140 - Ablösung der
 * Checkbox aus #139). Nur sichtbar, wenn beide Backends installiert sind.
 *
 * Issue #141 (Live-Test-Befund): die Radios standen vorausgewaehlt auf dem
 * aktuellen Stand und wurden deshalb bei JEDER Formular-Abgabe erneut
 * abgeschickt - auch wenn die Lehrkraft den Schalter nie beruehrt hat. Das
 * fuehrte zu "ImageMagick als Standard gesetzt" in den ausgefuehrten
 * Schritten, obwohl nichts geaendert wurde. Fix: Radios sind standardmaessig
 * `disabled` (Browser schicken disabled-Felder nicht mit ab) und werden erst
 * durch eine separate Freigabe-Checkbox entsperrt - exakt das bestehende
 * data-enables/data-enabled-by-Muster dieser Seite, kein neuer Mechanismus.
 */
function renderCropBackendSwitchRow(status) {
  const bothBackendsAvailable = Boolean(
    status.imageMagick && status.imageMagick.sipsActive && status.imageMagick.available
  );
  if (!bothBackendsAvailable) {
    return '';
  }
  const preferImageMagick = status.imageMagick.preferredBackend === 'imagemagick';
  const sipsChecked = preferImageMagick ? '' : ' checked';
  const imageMagickChecked = preferImageMagick ? ' checked' : '';
  const currentLabel = preferImageMagick ? 'ImageMagick' : 'sips';

  return (
    '    <article class="maintenance-row crop-backend-switch">\n' +
    '      <div>\n' +
    '        <label><input type="checkbox" value="crop-backend-change" data-enables="crop-backend-change"> Standard-Werkzeug ändern</label>\n' +
    `        <p data-change-status data-current="Aktuell: ${currentLabel}" data-selected="Wird geändert">Aktuell: ${currentLabel}</p>\n` +
    '        <p class="field-label">Bildausschnitt-Werkzeug</p>\n' +
    '        <div class="toggle-switch" role="radiogroup" aria-label="Bildausschnitt-Werkzeug">\n' +
    `          <label><input type="radio" name="cropBackend" value="sips"${sipsChecked} disabled data-enabled-by="crop-backend-change" data-toggles-explainer> sips</label>\n` +
    `          <label><input type="radio" name="cropBackend" value="imagemagick"${imageMagickChecked} disabled data-enabled-by="crop-backend-change" data-toggles-explainer> ImageMagick</label>\n` +
    '        </div>\n' +
    '      </div>\n' +
    '      <div>\n' +
    '        <p data-crop-backend-explainer="sips"' + (preferImageMagick ? ' hidden' : '') + '>' +
    'Eingebautes macOS-Tool, keine Installation nötig. Bei CMYK-JPEGs ohne Farbprofil oder animierten GIFs ' +
    'kann ImageMagick die bessere Wahl sein.</p>\n' +
    '        <p data-crop-backend-explainer="imagemagick"' + (preferImageMagick ? '' : ' hidden') + '>' +
    'Externes Werkzeug, deckt auch die seltenen sips-Sonderfälle ab (CMYK-JPEGs, animierte GIFs). ' +
    'Schlägt ein Zuschnitt damit fehl, wird automatisch sips versucht.</p>\n' +
    '      </div>\n' +
    '    </article>\n'
  );
}

/**
 * Update-Check (Issue #128, #177; ADR 0008 "Updates und Skill-Konflikte"):
 * Pruefung laeuft automatisch beim Seitenaufruf, kein Knopf noetig. Solange
 * sie laeuft, steht ein kurzer Laufend-Hinweis neben der Ueberschrift; danach
 * ersetzt ihn das Ergebnis (Aktuell/Update verfuegbar). Die eigentliche
 * Pruef-/Install-Logik steckt in lib/update-check.js; hier wird nur gerendert
 * und client-seitig gegen die /check-updates- und /apply-updates-Routen
 * gesprochen.
 */
function renderUpdateSection() {
  return (
    '<section aria-labelledby="updates-heading">\n' +
    '  <h2 id="updates-heading">Updates <small id="update-progress">– prüfe auf Updates…</small></h2>\n' +
    '  <div id="update-status" role="status" aria-live="polite"></div>\n' +
    '  <div id="update-conflicts"></div>\n' +
    '</section>\n'
  );
}

/**
 * Sichtbare Produkt- und Schutzhinweise auf der Konfigurator-Startseite
 * (Issue #189, Parent #146): einheitlicher Produktname Coursepilot, die
 * notwendige Neuinstallation bei einer alten local_aicoursecreator-
 * Installation sowie die Datenschutzgrenze (lokal konfigurierter KI-Client,
 * Plugin ruft selbst keinen KI-Anbieter auf, keine Lernendendaten). Reine
 * Lehrkraftsprache; dieselben Hinweise stehen in README, RELEASE_NOTES und
 * dem Mirror-README des Plugins und werden per Vertragstest geschuetzt
 * (test/coursepilot-notices-contract.test.js).
 */
function renderCoursepilotNotices() {
  return (
    '<section id="coursepilot-notices" aria-labelledby="coursepilot-notices-heading">\n' +
    '  <h2 id="coursepilot-notices-heading">Hinweise zu Installation und Datenschutz</h2>\n' +
    '  <p><strong>Neuinstallation erforderlich:</strong> Das Moodle-Plugin heisst jetzt ' +
    '<code>local_coursepilot</code>. Falls auf diesem Moodle noch die alte Komponente ' +
    '<code>local_aicoursecreator</code> installiert ist, deinstallieren Sie diese zuerst und ' +
    'installieren Sie danach <code>local_coursepilot</code> neu. Eine Daten- oder ' +
    'Einstellungsübernahme aus der alten Komponente gibt es bewusst nicht.</p>\n' +
    '  <p><strong>Datenschutz und KI-Client:</strong> Das Moodle-Plugin ruft selbst keinen ' +
    'KI-Anbieter auf. Coursepilot nutzt einen lokal auf dem Rechner der Lehrkraft ' +
    'konfigurierten KI-Client. Erst wenn die Lehrkraft Kursinhalte an diesen Client übergibt, ' +
    'können sie an dessen Anbieter übertragen werden. Lernendendaten gibt Coursepilot nicht ' +
    'frei: keine Aufgabenabgaben, Forenbeiträge, Quizversuche, Bewertungen oder ' +
    'Teilnehmendenlisten.</p>\n' +
    '</section>\n'
  );
}

/**
 * Fortschrittsbalken der Ersteinrichtung (Issue #207): `progress` ({done,
 * total}) kommt vom Aufrufer (setup-browser-server.js ruft dafuer
 * setup-flow.js#computeSetupProgress) - render-Funktionen rufen selbst keine
 * setup-flow-Funktionen auf (Issue #148). Ohne `progress` wird nichts
 * gerendert, damit reine Rendering-Aufrufe ohne Fortschritt unveraendert
 * bleiben.
 */
function renderSetupProgress(progress) {
  if (!progress) {
    return '';
  }
  const { done, total } = progress;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    '    <div class="setup-progress" role="status" data-setup-progress>\n' +
    `      <p class="setup-progress-text">Schritt ${done} von ${total} erledigt</p>\n` +
    '      <div class="setup-progress-bar" aria-hidden="true">\n' +
    `        <div class="setup-progress-fill" style="width:${percent}%"></div>\n` +
    '      </div>\n' +
    '    </div>\n'
  );
}

/**
 * Rendert die Setup-Startseite. `selection` (Ergebnis von
 * setup-flow.js#buildMaintenanceSelection) wird bewusst als Parameter
 * uebergeben statt hier berechnet - render-Funktionen rufen keine
 * setup-flow-Funktionen auf (Issue #148).
 */
function renderSetupPage(status, selection, options = {}) {
  const { startMode = 'default', progress = null } = options;
  const modeText = startMode === 'after-install'
    ? 'Nach der Installation'
    : (selection.mode === 'first-setup' ? 'Ersteinrichtung' : 'Wartung');
  const submitButton = '<button class="btn-primary" type="submit">Ausgewählte Änderungen speichern</button>';

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
    '    .setup-progress { margin: 0.75rem 0 0; }\n' +
    '    .setup-progress-text { margin: 0; font-weight: 600; }\n' +
    '    .setup-progress-bar { height: 8px; background: #e4e7eb; border-radius: 999px; overflow: hidden; margin-top: 0.4rem; }\n' +
    '    .setup-progress-fill { height: 100%; background: #0a66ff; }\n' +
    '    .inline-list { margin: 0.25rem 0 0; padding-left: 1.25rem; }\n' +
    '    button { font: inherit; padding: 0.55rem 0.8rem; border: 1px solid #d5dce3; border-radius: 4px; cursor: pointer; }\n' +
    '    .btn-primary { background: #0a66ff; color: #fff; border-color: #0a66ff; }\n' +
    '    .btn-secondary { background: #e4e7eb; color: #1f2933; }\n' +
    '    details { margin: 0.5rem 0 1rem; }\n' +
    '    summary { cursor: pointer; font-weight: 600; }\n' +
    '    img.token-help { display: block; width: min(100%, 620px); height: auto; margin-top: 0.75rem; border: 1px solid #d5dce3; }\n' +
    '    .toggle-switch { display: inline-flex; border: 1px solid #d5dce3; border-radius: 999px; overflow: hidden; margin-top: 0.4rem; }\n' +
    '    .toggle-switch label { margin: 0; padding: 0.4rem 1rem; color: #9aa5b1; cursor: not-allowed; }\n' +
    '    .toggle-switch label:has(input:not(:disabled)) { color: #1f2933; cursor: pointer; }\n' +
    '    .toggle-switch label:has(input:checked:not(:disabled)) { background: #0a66ff; color: #fff; font-weight: 600; }\n' +
    '    .toggle-switch input { position: absolute; opacity: 0; pointer-events: none; }\n' +
    '    @media (max-width: 680px) { .maintenance-row { grid-template-columns: 1fr; } }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    SERVER_GONE_BANNER +
    '  <main>\n' +
    '    <h1>Kurspilot konfigurieren</h1>\n' +
    `    <p>Modus: ${escapeHtml(modeText)}</p>\n` +
    renderSetupProgress(progress) +
    '    <section aria-labelledby="status-heading">\n' +
    '      <h2 id="status-heading">Kurspilot-Status</h2>\n' +
    `      <ul>${renderStatusItems(status)}</ul>\n` +
    renderSipsStatusNote(status) +
    '    </section>\n' +
    `    ${renderCoursepilotNotices()}` +
    `    ${renderUpdateSection()}` +
    '    <form method="post" action="/done">\n' +
    `    ${renderCurrentStateAndChanges(status, selection)}` +
    `      ${submitButton}\n` +
    '    </form>\n' +
    '    <form method="post" action="/abort">\n' +
    '      <button class="btn-secondary" type="submit">Abbrechen und Dienst beenden</button>\n' +
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
    '      // Issue #165: Gemeinsame-Ablage-Option nur sichtbar, wenn mind. zwei Clients angehaekt sind (Issue #183: opencode zaehlt mit).\n' +
    '      function updateSharedStorageVisibility() {\n' +
    '        const row = document.getElementById("shared-storage-option");\n' +
    '        if (!row) return;\n' +
    '        row.hidden = document.querySelectorAll("[name=\\"client\\"]:checked").length < 2;\n' +
    '      }\n' +
    '      for (const cb of document.querySelectorAll("[name=\\"client\\"]")) {\n' +
    '        cb.addEventListener("change", updateSharedStorageVisibility);\n' +
    '      }\n' +
    '      updateSharedStorageVisibility();\n' +
    '      for (const radio of document.querySelectorAll("[data-toggles-explainer]")) {\n' +
    '        radio.addEventListener("change", () => {\n' +
    '          for (const explainer of document.querySelectorAll("[data-crop-backend-explainer]")) {\n' +
    '            explainer.hidden = explainer.dataset.cropBackendExplainer !== radio.value;\n' +
    '          }\n' +
    '        });\n' +
    '      }\n' +
    '      document.getElementById("choose-workspace-button")?.addEventListener("click", async event => {\n' +
    '        const button = event.currentTarget;\n' +
    '        if (button.dataset.busy === "1") return;\n' +
    '        button.dataset.busy = "1";\n' +
    '        button.disabled = true;\n' +
    '        const field = document.getElementById("workspace-path");\n' +
    '        const status = document.getElementById("choose-workspace-status");\n' +
    '        if (status) status.textContent = "";\n' +
    '        try {\n' +
    '          const response = await fetch(`/choose-workspace?current=${encodeURIComponent(field.value)}`);\n' +
    '          if (!response.ok) return;\n' +
    '          const result = await response.json();\n' +
    '          if (result.workspacePath) field.value = result.workspacePath;\n' +
    '          else if (result.error && status) status.textContent = `Ordnerdialog konnte nicht geöffnet werden: ${result.error}`;\n' +
    '        } catch {\n' +
    '          // Der native Dialog wurde abgebrochen oder der lokale Dienst beendet.\n' +
    '          if (status) status.textContent = "Ordnerdialog konnte nicht geöffnet werden.";\n' +
    '        } finally {\n' +
    '          button.dataset.busy = "0";\n' +
    '          button.disabled = !document.querySelector(`[data-enables="${button.dataset.enabledBy}"]`)?.checked;\n' +
    '        }\n' +
    '      });\n' +
    '      function renderUpdateLine(info) {\n' +
    '        if (info.offline || info.error) return `<li>${info.label}: ${info.error}</li>`;\n' +
    '        if (!info.updateAvailable) {\n' +
    '          const versionHint = info.versionNew ? ` (${info.versionNew})` : "";\n' +
    '          return `<li>${info.label}: Aktuellste Version vorhanden${versionHint}</li>`;\n' +
    '        }\n' +
    '        const versionHint = info.versionCurrent ? ` (${info.versionCurrent} → ${info.versionNew})` : ` (${info.versionNew})`;\n' +
    '        return `<li>${info.label}: Update verfügbar${versionHint}</li>`;\n' +
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
    '      async function runUpdateCheck(confirmationPrefix) {\n' +
    '        const progressEl = document.getElementById("update-progress");\n' +
    '        const statusEl = document.getElementById("update-status");\n' +
    '        const conflictsEl = document.getElementById("update-conflicts");\n' +
    '        progressEl.hidden = false;\n' +
    '        progressEl.textContent = "– prüfe auf Updates…";\n' +
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
    '          const prefixHtml = confirmationPrefix ? `<p>${confirmationPrefix}</p>` : "";\n' +
    '          statusEl.innerHTML = `${prefixHtml}<ul>${lines.join("")}</ul>`;\n' +
    '          const anyUpdateAvailable = result.app.updateAvailable || (result.imageMagick.supported && result.imageMagick.updateAvailable);\n' +
    '          if (anyUpdateAvailable) {\n' +
    '            const installButton = document.createElement("button");\n' +
    '            installButton.type = "button";\n' +
    '            installButton.className = "btn-primary";\n' +
    '            installButton.textContent = "Update installieren";\n' +
    '            installButton.addEventListener("click", async () => {\n' +
    '              installButton.disabled = true;\n' +
    '              progressEl.hidden = false;\n' +
    '              progressEl.textContent = "– installiere Update…";\n' +
    '              statusEl.innerHTML = "";\n' +
    '              conflictsEl.innerHTML = "";\n' +
    '              try {\n' +
    '                const applyResponse = await fetch("/apply-updates", { method: "POST" });\n' +
    '                const applyResult = await applyResponse.json();\n' +
    '                if (applyResult.offline) {\n' +
    '                  progressEl.hidden = true;\n' +
    '                  statusEl.textContent = applyResult.error;\n' +
    '                  return;\n' +
    '                }\n' +
    '                if (applyResult.skillInstallAborted) {\n' +
    '                  progressEl.hidden = true;\n' +
    '                  statusEl.textContent = "Update teilweise installiert: Skill-Konflikt, siehe unten.";\n' +
    '                  conflictsEl.innerHTML = renderConflictPrompts(applyResult.skillInstallConflictPrompts);\n' +
    '                  for (const copyButton of conflictsEl.querySelectorAll(".copy-prompt-button")) {\n' +
    '                    copyButton.addEventListener("click", () => {\n' +
    '                      navigator.clipboard?.writeText(copyButton.dataset.prompt);\n' +
    '                    });\n' +
    '                  }\n' +
    '                  return;\n' +
    '                }\n' +
    '                await runUpdateCheck("Update installiert – aktuellste Version vorhanden.");\n' +
    '              } finally {\n' +
    '                installButton.disabled = false;\n' +
    '              }\n' +
    '            });\n' +
    '            statusEl.append(installButton);\n' +
    '          }\n' +
    '        } catch {\n' +
    '          statusEl.textContent = "Update-Prüfung war nicht möglich.";\n' +
    '        } finally {\n' +
    '          progressEl.hidden = true;\n' +
    '        }\n' +
    '      }\n' +
    '      runUpdateCheck();\n' +
    '    </script>\n' +
    '  </main>\n' +
    HEALTH_POLL_SCRIPT +
    '</body>\n' +
    '</html>\n'
  );
}

/**
 * Wartungs-Ansicht (Issue #202, Parent #200/Spec 0005): wird gezeigt, sobald die
 * Mindestkonfiguration erfuellt ist (setup-flow.js#isMinimumConfigured). S2 ist
 * bewusst ein Skelett: Header mit Titel/Untertitel und Live-Statuszeile, ein
 * noch leeres Card-Grid (Cards folgen in den naechsten Slices) und ein Footer
 * mit "Dienst beenden" (POST /abort) sowie "Ersteinrichtung wiederholen"
 * (JS-confirm(), dann POST /restart-setup - ohne gespeicherte Werte zu loeschen).
 *
 * Token-Fluss: die Seite liest den CSRF-Token aus der aktuellen URL und haengt
 * ihn an die fetch-Aufrufe. Ein nacktes <form action="/abort"> wuerde den
 * Query-Parameter beim Absenden verlieren; die bestehenden renderSetupPage-
 * Formulare bleiben von dieser Funktion unberuehrt.
 */
function moodleSummaryText(moodle) {
  const url = moodle.url || 'Moodle-URL fehlt';
  const token = moodle.tokenPresent ? 'Token gespeichert' : 'Token fehlt';
  return `${url} · ${token}`;
}

function renderMoodleCard(status) {
  return (
    '<article class="card" data-card-id="moodle">\n' +
    '  <div class="card-header">\n' +
    '    <h2>Moodle-Zugang</h2>\n' +
    '    <button class="card-edit btn-tertiary" type="button" data-card-id="moodle">Ändern</button>\n' +
    '  </div>\n' +
    `  <p class="card-summary" data-card-summary="moodle">${escapeHtml(moodleSummaryText(status.moodle))}</p>\n` +
    '  <div class="card-detail" data-card-detail="moodle" hidden>\n' +
    '    <label>Moodle-URL\n' +
    `      <input type="url" name="moodleUrl" value="${escapeHtml(status.moodle.url || '')}">\n` +
    '    </label>\n' +
    '    <label>Token\n' +
    `      <input type="password" name="moodleToken" autocomplete="off" placeholder="${status.moodle.tokenPresent ? 'gespeichert' : 'Token einfügen'}">\n` +
    '    </label>\n' +
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
    '    <button class="card-edit btn-tertiary" type="button" data-card-id="workspace">Ändern</button>\n' +
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
  const choices = Object.entries(status.detectedClients)
    .filter(([, detected]) => detected)
    .map(([client]) => (
      `    <label class="checkbox-choice"><input type="checkbox" name="client" value="${escapeHtml(client)}" checked> ` +
      `${escapeHtml(clientLabel(client))}</label>\n`
    ))
    .join('');
  const detail = choices
    ? choices +
      '    <button class="btn-primary card-save" type="button" data-card-id="clients">Speichern</button>\n' +
      '    <p class="card-save-status" data-card-save-status="clients" role="status" aria-live="polite"></p>\n'
    : '    <p>Kein Client erkannt</p>\n';

  return (
    '<article class="card" data-card-id="clients">\n' +
    '  <div class="card-header">\n' +
    '    <h2>KI-Clients</h2>\n' +
    (choices ? '    <button class="card-edit btn-tertiary" type="button" data-card-id="clients">Ändern</button>\n' : '') +
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
  return labels.length > 0 ? labels.join(', ') : 'Keine Aktivitäten';
}

function renderActivitiesCard(status) {
  const configured = status.configuredActivityIds;
  const choices = listActivities()
    .filter(activity => activity.apiSupported)
    .map(activity => {
      const isChecked = configured === null ? activity.default : configured.includes(activity.id);
      return (
        `    <label class="checkbox-choice"><input type="checkbox" name="activity" value="${escapeHtml(activity.id)}"` +
        `${isChecked ? ' checked' : ''}> ${escapeHtml(activity.label)}</label>\n`
      );
    })
    .join('');

  return (
    '<article class="card" data-card-id="activities">\n' +
    '  <div class="card-header">\n' +
    '    <h2>MCP-Aktivitäten</h2>\n' +
    '    <button class="card-edit btn-tertiary" type="button" data-card-id="activities">Ändern</button>\n' +
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
 * Card 'Bildbearbeitung' (Issue #204, Spec 0005 S4): exklusive Radios
 * sips|ImageMagick, Instant-Save über POST /apply/crop-backend. Die Radios
 * erscheinen nur, wenn beide Backends verfügbar sind (sipsActive && available) -
 * dieselbe Bedingung wie der Schalter in der Ersteinrichtung
 * (renderCropBackendSwitchRow). Sonst nur eine Lesezeile ohne Auswahl.
 */
function renderCropBackendCard(status) {
  const imageMagick = status.imageMagick;
  const bothAvailable = Boolean(imageMagick && imageMagick.sipsActive && imageMagick.available);
  const preferImageMagick = Boolean(imageMagick && imageMagick.preferredBackend === 'imagemagick');

  const detail = bothAvailable
    ? '    <label class="radio-choice"><input type="radio" name="cropBackend" value="sips"' + (preferImageMagick ? '' : ' checked') + '> sips (eingebautes macOS-Tool)</label>\n' +
      '    <label class="radio-choice"><input type="radio" name="cropBackend" value="imagemagick"' + (preferImageMagick ? ' checked' : '') + '> ImageMagick</label>\n' +
      '    <button class="btn-primary card-save" type="button" data-card-id="crop-backend">Speichern</button>\n' +
      '    <p class="card-save-status" data-card-save-status="crop-backend" role="status" aria-live="polite"></p>\n'
    : '    <p>Der Bildausschnitt läuft über das jeweils verfügbare Werkzeug.</p>\n';

  return (
    '<article class="card" data-card-id="crop-backend">\n' +
    '  <div class="card-header">\n' +
    '    <h2>Bildbearbeitung</h2>\n' +
    (bothAvailable ? '    <button class="card-edit btn-tertiary" type="button" data-card-id="crop-backend">Ändern</button>\n' : '') +
    '  </div>\n' +
    `  <p class="card-summary" data-card-summary="crop-backend">${escapeHtml(cropBackendSummaryText(imageMagick))}</p>\n` +
    '  <div class="card-detail" data-card-detail="crop-backend"' + (bothAvailable ? ' hidden' : '') + '>\n' +
    detail +
    '  </div>\n' +
    '</article>\n'
  );
}

/**
 * Card 'Version' (Issue #204, Spec 0005 S4): async Update-Check über das
 * bestehende GET /check-updates mit Ladestate; bei verfügbarem Update wechselt
 * das Button-Label auf 'Installieren' (→ bestehendes POST /apply-updates). Das
 * Ergebnis wird inline in der Card gerendert. Kein Ändern/Speichern-Muster -
 * die Card hat ihren eigenen Knopf.
 */
function renderVersionCard() {
  return (
    '<article class="card" data-card-id="version">\n' +
    '  <div class="card-header">\n' +
    '    <h2>Version</h2>\n' +
    '  </div>\n' +
    '  <p class="card-summary" data-card-summary="version">–</p>\n' +
    '  <div class="card-detail">\n' +
    '    <p class="version-result" role="status" aria-live="polite"></p>\n' +
    '    <button class="version-check-button btn-secondary" type="button" data-action="check">erneut prüfen</button>\n' +
    '  </div>\n' +
    '</article>\n'
  );
}

function renderMaintenancePage(status) {
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
    // Dark Mode (eigenes Ticket) tauscht spaeter nur diese Werte.
    '    :root {\n' +
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
    '    }\n' +
    '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: var(--kp-surface); color: var(--kp-text); line-height: 1.5; }\n' +
    '    .maintenance-header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--kp-space-sm) var(--kp-space-lg); max-width: 1100px; margin: 0 auto; padding: var(--kp-space-2xl) var(--kp-space-xl) var(--kp-space-sm); }\n' +
    '    .maintenance-header h1 { margin: 0; font-size: 1.9rem; line-height: 1.2; }\n' +
    '    .maintenance-header .subtitle { margin: 0; color: var(--kp-text-muted); }\n' +
    '    .status-line { margin: 0; color: var(--kp-success); font-weight: 600; white-space: nowrap; }\n' +
    '    main { max-width: 1100px; margin: 0 auto; padding: var(--kp-space-lg) var(--kp-space-xl) var(--kp-space-2xl); }\n' +
    '    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--kp-space-lg); align-items: stretch; }\n' +
    '    .card { display: flex; flex-direction: column; background: var(--kp-surface-raised); border: 1px solid var(--kp-border); border-radius: var(--kp-radius-md); box-shadow: var(--kp-elevation-1); padding: var(--kp-space-lg); }\n' +
    '    .card-header { display: flex; align-items: center; justify-content: space-between; gap: var(--kp-space-sm); }\n' +
    '    .card-header h2 { margin: 0; font-size: 1.1rem; }\n' +
    '    .card-summary { margin: var(--kp-space-xs) 0 0; color: var(--kp-text-muted); }\n' +
    '    .card-detail { margin-top: var(--kp-space-md); display: grid; gap: var(--kp-space-sm); }\n' +
    '    .card-detail label { display: grid; gap: var(--kp-space-xs); font-size: 0.9rem; font-weight: 600; }\n' +
    '    .card-detail input { font: inherit; font-weight: 400; box-sizing: border-box; width: 100%; min-height: var(--kp-target-size); padding: var(--kp-space-xs) var(--kp-space-md); border: 1px solid var(--kp-border); border-radius: var(--kp-radius-sm); }\n' +
    '    .card-save-status { margin: 0; color: var(--kp-text-muted); font-size: 0.9rem; }\n' +
    '    .card-path { word-break: break-all; }\n' +
    '    .checkbox-choice, .radio-choice { display: flex; align-items: center; gap: var(--kp-space-sm); font-weight: 400; min-height: var(--kp-target-size); }\n' +
    '    .checkbox-choice input, .radio-choice input { width: auto; min-height: 0; }\n' +
    '    .card-restart { display: grid; gap: var(--kp-space-sm); margin-top: var(--kp-space-sm); }\n' +
    '    .card-restart:empty { margin-top: 0; }\n' +
    '    .restart-notice { margin: 0; color: var(--kp-text-muted); font-size: 0.9rem; }\n' +
    '    .restart-client-status { margin-left: var(--kp-space-sm); color: var(--kp-text-muted); font-size: 0.9rem; }\n' +
    '    .version-result { margin: 0; color: var(--kp-text-muted); font-size: 0.9rem; }\n' +
    '    .maintenance-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--kp-space-md); max-width: 1100px; margin: 0 auto; padding: var(--kp-space-lg) var(--kp-space-xl) calc(var(--kp-space-2xl) + var(--kp-space-sm)); }\n' +
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
    '    .btn-tertiary { background: transparent; border-color: transparent; color: var(--kp-accent); text-decoration: underline; text-underline-offset: 2px; padding: var(--kp-space-xs) var(--kp-space-sm); }\n' +
    '    .btn-tertiary:hover { background: var(--kp-accent-subtle); }\n' +
    '    .btn-tertiary:active { background: var(--kp-accent-subtle-active); color: var(--kp-accent-active); }\n' +
    '    .btn-destructive { background: var(--kp-surface-raised); border-color: var(--kp-danger); color: var(--kp-danger); }\n' +
    '    .btn-destructive:hover { background: var(--kp-danger); border-color: var(--kp-danger); color: var(--kp-on-danger); }\n' +
    '    .btn-destructive:active { background: var(--kp-danger-active); border-color: var(--kp-danger-active); color: var(--kp-on-danger); }\n' +
    '    .version-check-button[data-action="install"] { background: var(--kp-accent); border-color: var(--kp-accent); color: var(--kp-on-accent); box-shadow: var(--kp-elevation-1); }\n' +
    '    .version-check-button[data-action="install"]:hover { background: var(--kp-accent-hover); border-color: var(--kp-accent-hover); }\n' +
    '    .version-check-button[data-action="install"]:active { background: var(--kp-accent-active); border-color: var(--kp-accent-active); box-shadow: none; }\n' +
    '    #abort-status { margin-left: var(--kp-space-md); color: var(--kp-text-muted); }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    SERVER_GONE_BANNER +
    '  <header class="maintenance-header">\n' +
    '    <div>\n' +
    '      <h1>Kurspilot</h1>\n' +
    '      <p class="subtitle">Einstellungen</p>\n' +
    '    </div>\n' +
    '    <p class="status-line">● Alles läuft · Zuletzt geprüft: <span id="last-checked">gerade eben</span></p>\n' +
    '  </header>\n' +
    '  <main>\n' +
    '    <div class="card-grid" id="maintenance-cards">\n' +
    renderMoodleCard(status) +
    renderWorkspaceCard(status) +
    renderClientsCard(status) +
    renderActivitiesCard(status) +
    renderCropBackendCard(status) +
    renderVersionCard() +
    '    </div>\n' +
    '  </main>\n' +
    '  <footer class="maintenance-footer">\n' +
    '    <div>\n' +
    // Issue #211: keine Emoji als strukturelle Icons - der sichtbare Text
    // bleibt das alleinige Beschriftungsmittel der Footer-Aktionen.
    '      <button id="abort-button" class="btn-abort btn-destructive" type="button">Dienst beenden</button>\n' +
    '      <span id="abort-status" role="status" aria-live="polite"></span>\n' +
    '    </div>\n' +
    '    <button id="restart-setup-button" class="btn-restart-setup btn-tertiary" type="button">Ersteinrichtung wiederholen</button>\n' +
    '  </footer>\n' +
    '  <script>\n' +
    '    function currentToken() {\n' +
    '      return new URLSearchParams(window.location.search).get("token") || "";\n' +
    '    }\n' +
    '    document.getElementById("last-checked").textContent = new Date().toLocaleTimeString("de-DE");\n' +
    '    document.getElementById("abort-button").addEventListener("click", async () => {\n' +
    '      const statusLine = document.getElementById("abort-status");\n' +
    '      statusLine.textContent = "Dienst wird beendet…";\n' +
    '      try {\n' +
    '        await fetch(`/abort?token=${encodeURIComponent(currentToken())}`, { method: "POST" });\n' +
    '      } catch {\n' +
    '        // Der Dienst beendet sich selbst; Verbindung bricht erwartungsgemaess ab.\n' +
    '      }\n' +
    '      statusLine.textContent = "Dienst beendet. Sie können diesen Tab schließen.";\n' +
    '    });\n' +
    '    document.getElementById("restart-setup-button").addEventListener("click", async () => {\n' +
    '      if (!window.confirm("Zur ausführlichen Ersteinrichtung wechseln? Gespeicherte Einstellungen bleiben erhalten.")) {\n' +
    '        return;\n' +
    '      }\n' +
    '      const response = await fetch(`/restart-setup?token=${encodeURIComponent(currentToken())}`, { method: "POST" });\n' +
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
    '      return labels.length > 0 ? labels.join(", ") : "Keine Aktivitäten";\n' +
    '    }\n' +
    '    function cardSummaryText(cardId, status) {\n' +
    '      if (cardId === "moodle") return moodleSummaryText(status.moodle);\n' +
    '      if (cardId === "workspace") return workspaceSummaryText(status.workspace);\n' +
    '      if (cardId === "clients") return clientsSummaryText(status);\n' +
    '      if (cardId === "activities") return activitiesSummaryText(status);\n' +
    '      if (cardId === "crop-backend") return cropBackendSummaryText(status.imageMagick);\n' +
    '      return "";\n' +
    '    }\n' +
    '    function closeAllCards() {\n' +
    '      for (const detail of document.querySelectorAll("[data-card-detail]")) {\n' +
    '        detail.hidden = true;\n' +
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
    '        const detail = document.querySelector(`[data-card-detail="${button.dataset.cardId}"]`);\n' +
    '        const wasOpen = !detail.hidden;\n' +
    '        closeAllCards();\n' +
    '        if (!wasOpen) detail.hidden = false;\n' +
    '      });\n' +
    '    }\n' +
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
    '        button.disabled = true;\n' +
    '        statusEl.textContent = "Speichern…";\n' +
    '        try {\n' +
    '          const response = await fetch(`/apply/${cardId}?token=${encodeURIComponent(currentToken())}`, {\n' +
    '            method: "POST",\n' +
    '            headers: { "content-type": "application/x-www-form-urlencoded" },\n' +
    '            body: body.toString(),\n' +
    '          });\n' +
    '          const result = await response.json();\n' +
    '          if (result.ok) {\n' +
    '            statusEl.textContent = "Gespeichert.";\n' +
    '            const summary = document.querySelector(`[data-card-summary="${cardId}"]`);\n' +
    '            if (summary && result.newStatus) summary.textContent = cardSummaryText(cardId, result.newStatus);\n' +
    '            renderRestartBlock(cardId, result.restartRequired);\n' +
    '            detail.hidden = true;\n' +
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
    '      const summary = document.querySelector(\'[data-card-summary="version"]\');\n' +
    '      const result = document.querySelector(".version-result");\n' +
    '      async function check() {\n' +
    '        button.disabled = true;\n' +
    '        button.textContent = "prüfe…";\n' +
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
    '            result.textContent = "Neue Version verfügbar.";\n' +
    '            button.textContent = "Installieren";\n' +
    '            button.dataset.action = "install";\n' +
    '          } else {\n' +
    '            const version = app.versionCurrent || app.versionNew || "";\n' +
    '            summary.textContent = version ? `Aktuelle Version: ${version}` : "Aktuellste Version vorhanden";\n' +
    '            result.textContent = "Aktuellste Version vorhanden.";\n' +
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
    '        }\n' +
    '      }\n' +
    '      async function install() {\n' +
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
    '            await check();\n' +
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
    '        }\n' +
    '      }\n' +
    '      button.addEventListener("click", () => {\n' +
    '        if (button.dataset.action === "install") install();\n' +
    '        else check();\n' +
    '      });\n' +
    '      check();\n' +
    '    })();\n' +
    '  </script>\n' +
    HEALTH_POLL_SCRIPT +
    '</body>\n' +
    '</html>\n'
  );
}

function extractShellCommand(text) {
  const match = String(text).match(/\/bin\/bash -c "\$\(curl -fsSL [^)]+\)"/);
  return match ? match[0] : null;
}

function renderWarning(warning) {
  const command = extractShellCommand(warning);
  if (!command) {
    return `<li>${escapeHtml(warning)}</li>`;
  }
  const [before, after] = warning.split(command);
  return (
    '<li>\n' +
    `  <p>${escapeHtml(before).trim()}</p>\n` +
    '  <div class="command-snippet">\n' +
    `    <code>${escapeHtml(command)}</code>\n` +
    `    <button type="button" data-copy-command="${escapeHtml(command)}">In Zwischenablage kopieren</button>\n` +
    '  </div>\n' +
    (after.trim() ? `  <p>${escapeHtml(after).trim()}</p>\n` : '') +
    '</li>'
  );
}

function setupSummaryParts(report) {
  return {
    steps: report.executedSteps && report.executedSteps.length > 0
      ? report.executedSteps
      : ['Keine Änderung ausgeführt'],
    warnings: [
      ...(report.imageMagickWarning ? [report.imageMagickWarning] : []),
      ...(report.skillInstallWarnings || []),
    ],
  };
}

function renderSetupResult(report, options = {}) {
  const { steps, warnings } = setupSummaryParts(report);
  const warningsSection = warnings.length > 0
    ? '    <section>\n' +
      '      <h2>Warnungen</h2>\n' +
      `      <ul>${warnings.map(renderWarning).join('\n')}</ul>\n` +
      '    </section>\n'
    : '';
  return (
    '    <section>\n' +
    '      <h2>Ausgeführte Schritte</h2>\n' +
    `      <ul>${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('\n')}</ul>\n` +
    '    </section>\n' +
    warningsSection +
    (options.closeHint ? `    <p>${CLOSE_TAB_HINT}</p>\n` : '')
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

function postSaveClientLabel(client) {
  return clientLabel(client);
}

/**
 * Eine Beenden/Spaeter-Sektion pro Client, der beim Speichern lief (Issue
 * #96-Folgefehler: Codex bekommt jetzt dieselbe Opt-in-Logik wie Claude,
 * nur ohne Neustart-Button - "neu starten" war fuer beide ohnehin nur ein
 * bequemerer Ersatz fuer "beenden, dann von Hand neu oeffnen").
 */
function renderClientReloadSection(client) {
  const label = postSaveClientLabel(client);
  return (
    `<article class="reload-row" data-client="${client}">\n` +
    `  <p>${escapeHtml(label)} lief beim Speichern noch. Damit die neue Konfiguration sicher geladen wird, ` +
    `muss ${escapeHtml(label)} einmal neu gestartet werden - jetzt beenden (danach von Hand neu öffnen) oder später von Hand.</p>\n` +
    `  <button class="end-now-button btn-primary" data-client="${client}" type="button">${escapeHtml(label)} jetzt beenden</button>\n` +
    `  <button class="skip-button btn-secondary" data-client="${client}" type="button">Später von Hand</button>\n` +
    `  <p class="reload-status" data-client="${client}" role="status" aria-live="polite"></p>\n` +
    '</article>\n'
  );
}

/**
 * Seite nach dem Speichern (Issue #130, erweitert in #96-Folgefehler): Config
 * wird immer geschrieben, unabhaengig vom Laufzeitstatus der Clients (siehe
 * Race-Condition-Analyse in lib/setup-flow.js). Lief Codex und/oder Claude
 * waehrend des Speicherns, zeigt diese Seite pro betroffenem Client eine
 * eigene Opt-in-Sektion ("jetzt beenden" oder "später von Hand") - der
 * Dienst bleibt offen, bis fuer JEDEN betroffenen Client eine der beiden
 * Optionen bestaetigt wurde (siehe /end-now, /skip Routen).
 */
function renderPostSaveActionsPage(report) {
  const pendingClients = [
    ...(report.codexWasRunningDuringSave ? ['codex'] : []),
    ...(report.claudeWasRunningDuringSave ? ['claude'] : []),
  ];
  const closeNotice = renderSuccessNotice('Fertig', [CLOSE_TAB_HINT], {
    id: 'close-tab-notice',
    hidden: pendingClients.length > 0,
  });
  const actionsSection = pendingClients.length > 0
    ? '<section aria-labelledby="post-save-heading">\n' +
      '  <h2 id="post-save-heading">Neu laden</h2>\n' +
      pendingClients.map(renderClientReloadSection).join('') +
      '  <p id="post-save-final-status" role="status" aria-live="polite"></p>\n' +
      `  ${closeNotice}` +
      '</section>\n'
    : '';
  const finishNotice = pendingClients.length > 0
    ? ''
    : closeNotice;

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
    '    button { font: inherit; padding: 0.55rem 0.8rem; border: 1px solid #d5dce3; border-radius: 4px; cursor: pointer; }\n' +
    '    .btn-primary { background: #0a66ff; color: #fff; border-color: #0a66ff; }\n' +
    '    .btn-secondary { background: #e4e7eb; color: #1f2933; }\n' +
    '    .command-snippet { display: grid; gap: 0.6rem; margin: 0.6rem 0; padding: 0.75rem; border: 1px solid #d5dce3; background: #f7f9fb; }\n' +
    '    .command-snippet code { white-space: pre-wrap; overflow-wrap: anywhere; }\n' +
    `    ${SUCCESS_NOTICE_STYLE}\n` +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <main>\n' +
    '    <h1>Kurspilot konfigurieren</h1>\n' +
    renderSetupResult(report) +
    actionsSection +
    finishNotice +
    '    <script>\n' +
    '      document.querySelectorAll("[data-copy-command]").forEach(button => {\n' +
    '        button.addEventListener("click", async () => {\n' +
    '          await navigator.clipboard?.writeText(button.dataset.copyCommand);\n' +
    '          button.textContent = "Kopiert";\n' +
    '        });\n' +
    '      });\n' +
    '      function reloadRowFor(client) {\n' +
    '        return document.querySelector(`.reload-row[data-client="${client}"]`);\n' +
    '      }\n' +
    '      async function ackClient(client, route, busyText, doneText) {\n' +
    '        const row = reloadRowFor(client);\n' +
    '        for (const button of row.querySelectorAll("button")) button.disabled = true;\n' +
    '        const status = row.querySelector(".reload-status");\n' +
    '        status.textContent = busyText;\n' +
    '        const response = await fetch(route, {\n' +
    '          method: "POST",\n' +
    '          headers: { "content-type": "application/x-www-form-urlencoded" },\n' +
    '          body: `client=${client}`,\n' +
    '        });\n' +
    '        const result = await response.json();\n' +
    '        status.textContent = doneText;\n' +
    '        if (result.done) {\n' +
    '          document.getElementById("post-save-final-status").textContent = "";\n' +
    '          document.getElementById("close-tab-notice").hidden = false;\n' +
    '        }\n' +
    '      }\n' +
    '      document.querySelectorAll(".end-now-button").forEach(button => {\n' +
    '        button.addEventListener("click", () => {\n' +
    '          const client = button.dataset.client;\n' +
    '          const label = client === "codex" ? "Codex" : "Claude";\n' +
    '          ackClient(client, "/end-now", `${label} wird beendet...`, `${label} wurde beendet.`);\n' +
    '        });\n' +
    '      });\n' +
    '      document.querySelectorAll(".skip-button").forEach(button => {\n' +
    '        button.addEventListener("click", () => {\n' +
    '          ackClient(button.dataset.client, "/skip", "Wird vermerkt...", "Fertig.");\n' +
    '        });\n' +
    '      });\n' +
    '    </script>\n' +
    '  </main>\n' +
    '</body>\n' +
    '</html>\n'
  );
}

module.exports = {
  TOKEN_HELP_ASSET_URL,
  CLOSE_TAB_HINT,
  SUCCESS_NOTICE_STYLE,
  escapeHtml,
  renderStatusItems,
  renderSipsStatusNote,
  renderClientChoices,
  renderSharedStorageOption,
  renderActivityChecklist,
  renderCurrentStateAndChanges,
  renderCropBackendSwitchRow,
  renderUpdateSection,
  renderCoursepilotNotices,
  renderSetupPage,
  renderMaintenancePage,
  renderWorkspaceCard,
  renderClientsCard,
  renderActivitiesCard,
  renderCropBackendCard,
  renderVersionCard,
  workspaceSummaryText,
  clientsSummaryText,
  activitiesSummaryText,
  cropBackendSummaryText,
  setupSummaryParts,
  renderSetupResult,
  renderSuccessNotice,
  renderPostSaveActionsPage,
};
