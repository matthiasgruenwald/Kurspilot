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

function renderStatusItems(status) {
  const items = [
    clientStatusText('codex', status.detectedClients.codex),
    clientStatusText('claude', status.detectedClients.claude),
    clientStatusText('opencode', status.detectedClients.opencode),
    status.moodle.url ? 'Moodle-URL ist gespeichert' : 'Moodle-URL fehlt',
    status.moodle.tokenPresent ? 'Moodle-Token ist gespeichert' : 'Moodle-Token fehlt',
    status.workspace.configured ? 'Arbeitsbereich ist eingerichtet' : 'Arbeitsbereich fehlt',
    status.kurspilotRepairRequired
      ? 'Kurspilot muss eingerichtet oder repariert werden'
      : 'Kurspilot-Reparatur ist nicht erforderlich',
  ];

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
 * Rendert die Setup-Startseite. `selection` (Ergebnis von
 * setup-flow.js#buildMaintenanceSelection) wird bewusst als Parameter
 * uebergeben statt hier berechnet - render-Funktionen rufen keine
 * setup-flow-Funktionen auf (Issue #148).
 */
function renderSetupPage(status, selection, options = {}) {
  const { startMode = 'default' } = options;
  const modeText = startMode === 'after-install'
    ? 'Nach der Installation'
    : (selection.mode === 'first-setup' ? 'Ersteinrichtung' : 'Wartung');
  const submitButton = '<button type="submit">Ausgewählte Änderungen speichern</button>';

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
    '    .toggle-switch { display: inline-flex; border: 1px solid #d5dce3; border-radius: 999px; overflow: hidden; margin-top: 0.4rem; }\n' +
    '    .toggle-switch label { margin: 0; padding: 0.4rem 1rem; color: #9aa5b1; cursor: not-allowed; }\n' +
    '    .toggle-switch label:has(input:not(:disabled)) { color: #1f2933; cursor: pointer; }\n' +
    '    .toggle-switch label:has(input:checked:not(:disabled)) { background: #0a66ff; color: #fff; font-weight: 600; }\n' +
    '    .toggle-switch input { position: absolute; opacity: 0; pointer-events: none; }\n' +
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
    renderSipsStatusNote(status) +
    '    </section>\n' +
    `    ${renderCoursepilotNotices()}` +
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
    `  <button class="end-now-button" data-client="${client}" type="button">${escapeHtml(label)} jetzt beenden</button>\n` +
    `  <button class="skip-button" data-client="${client}" type="button">Später von Hand</button>\n` +
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
    '    button { font: inherit; padding: 0.55rem 0.8rem; }\n' +
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
  setupSummaryParts,
  renderSetupResult,
  renderSuccessNotice,
  renderPostSaveActionsPage,
};
