'use strict';

/**
 * Direkte Tests der Render-Funktionen aus lib/setup-render.js (Issue #148):
 * reine Funktionen, Status-/Konfigurationsdaten rein, HTML-String raus -
 * kein HTTP-Server, kein Filesystem-Stub noetig. Ergaenzt (nicht ersetzt)
 * test/setup-browser-server.test.js, das dieselbe Ausgabe ueber echte
 * HTTP-Requests prueft.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeHtml,
  renderStatusItems,
  renderSipsStatusNote,
  renderClientChoices,
  renderSharedStorageOption,
  renderActivityChecklist,
  renderCurrentStateAndChanges,
  renderCropBackendSwitchRow,
  renderUpdateSection,
  renderSetupPage,
  setupSummaryParts,
  renderSetupResult,
  renderSuccessNotice,
  renderPostSaveActionsPage,
  renderCoursepilotNotices,
  renderMaintenancePage,
  renderWorkspaceCard,
  renderClientsCard,
  renderCropBackendCard,
  renderVersionCard,
  renderActivitiesCard,
  workspaceSummaryText,
  clientsSummaryText,
  activitiesSummaryText,
  cropBackendSummaryText,
} = require('../lib/setup-render');
const { computeSetupProgress } = require('../lib/setup-flow');

function baseStatus(overrides = {}) {
  return {
    detectedClients: { codex: true, claude: false, opencode: false },
    configuredActivityIds: null,
    claudeRunning: false,
    workspace: { configured: true, path: '/Users/test/Kurspilot', status: 'configured' },
    moodle: { url: 'https://moodle.example.test', tokenPresent: true },
    imageMagick: { available: false, supported: false, sipsActive: false, preferredBackend: null },
    kurspilotRepairRequired: false,
    ...overrides,
  };
}

function baseSelection(overrides = {}) {
  return {
    mode: 'maintenance',
    areas: [
      { id: 'kurspilot-setup-or-repair', label: 'Kurspilot einrichten/reparieren' },
      { id: 'moodle-token-renewal', label: 'Moodle-Token erneuern' },
      { id: 'moodle-url-change', label: 'Moodle-URL ändern' },
      { id: 'workspace-change', label: 'Arbeitsbereich ändern' },
    ],
    preselectedAreaIds: [],
    multipleSelectionAllowed: true,
    ...overrides,
  };
}

test('escapeHtml maskiert alle HTML-Sonderzeichen', () => {
  assert.strictEqual(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('renderStatusItems zeigt Client-, Moodle- und Arbeitsbereichsstatus als Liste', () => {
  const html = renderStatusItems(baseStatus());
  assert.match(html, /Codex wurde erkannt/);
  assert.match(html, /Claude wurde nicht erkannt/);
  assert.match(html, /Moodle-URL ist gespeichert/);
  assert.match(html, /Moodle-Token ist gespeichert/);
  assert.match(html, /Arbeitsbereich ist eingerichtet/);
  assert.match(html, /Kurspilot-Reparatur ist nicht erforderlich/);
});

test('renderStatusItems nennt opencode korrekt (Issue #183)', () => {
  const detected = renderStatusItems(
    baseStatus({ detectedClients: { codex: true, claude: false, opencode: true } })
  );
  assert.match(detected, /opencode wurde erkannt/);

  const missing = renderStatusItems(
    baseStatus({ detectedClients: { codex: true, claude: false, opencode: false } })
  );
  assert.match(missing, /opencode wurde nicht erkannt/);
});

test('renderStatusItems reframed fehlende Minimum-Punkte als Loss-Aversion (Issue #207)', () => {
  const html = renderStatusItems(baseStatus({
    detectedClients: { codex: false, claude: false, opencode: false },
    moodle: { url: null, tokenPresent: false },
    workspace: { configured: false, path: null, status: 'missing' },
    kurspilotRepairRequired: true,
  }));
  assert.match(html, /Ohne Moodle-URL: keine Verbindung zum Kurs-System/);
  assert.match(html, /Ohne Moodle-Token: keine Kurse abrufbar/);
  assert.match(html, /Ohne Arbeitsordner: kein lokaler Kurspilot-Kontext/);
  assert.match(html, /Ohne KI-Client: Kurspilot ist nicht ansprechbar/);
  assert.match(html, /MCP nicht verdrahtet: KI-Client sieht Kurspilot nicht/);
});

test('renderStatusItems zeigt Loss-Aversion nur bei fehlenden Minimum-Punkten (Issue #207)', () => {
  const html = renderStatusItems(baseStatus());
  assert.doesNotMatch(html, /Ohne Moodle-URL/);
  assert.doesNotMatch(html, /Ohne Moodle-Token/);
  assert.doesNotMatch(html, /Ohne Arbeitsordner/);
  assert.doesNotMatch(html, /Ohne KI-Client/);
  assert.doesNotMatch(html, /MCP nicht verdrahtet/);
  assert.match(html, /Moodle-URL ist gespeichert/);
  assert.match(html, /Kurspilot-Reparatur ist nicht erforderlich/);
});

test('renderStatusItems behaelt fuer ImageMagick eine neutrale Formulierung (Issue #207)', () => {
  const html = renderStatusItems(baseStatus({
    imageMagick: { available: false, supported: true, sipsActive: false, preferredBackend: null },
  }));
  assert.match(html, /ImageMagick ist nicht installiert/);
  assert.doesNotMatch(html, /Ohne ImageMagick/);
});

test('renderSipsStatusNote ist leer ohne aktives sips, gefuellt mit', () => {
  assert.strictEqual(renderSipsStatusNote(baseStatus()), '');
  const html = renderSipsStatusNote(baseStatus({ imageMagick: { sipsActive: true } }));
  assert.match(html, /eingebaute macOS-Tool \(sips\)/);
});

test('renderClientChoices listet nur erkannte Clients', () => {
  const html = renderClientChoices(baseStatus());
  assert.match(html, /value="codex"/);
  assert.doesNotMatch(html, /value="claude"/);
});

test('renderClientChoices zeigt opencode vorausgewaehlt, wenn erkannt - gleichberechtigt mit Codex/Claude (Issue #183)', () => {
  const html = renderClientChoices(
    baseStatus({ detectedClients: { codex: true, claude: false, opencode: true } })
  );
  assert.match(html, /value="opencode" checked/);

  const notDetected = renderClientChoices(
    baseStatus({ detectedClients: { codex: true, claude: false, opencode: false } })
  );
  assert.doesNotMatch(notDetected, /value="opencode"/);
});

test('renderSharedStorageOption erscheint ab zwei erkannten Clients - opencode zaehlt mit (Issue #183)', () => {
  const opencodePlusCodex = renderSharedStorageOption(
    baseStatus({ detectedClients: { codex: true, claude: false, opencode: true } }),
    false
  );
  assert.match(opencodePlusCodex, /Gemeinsame Skill-Ablage/);
  assert.doesNotMatch(opencodePlusCodex, /id="shared-storage-option" hidden/);

  const opencodePlusClaude = renderSharedStorageOption(
    baseStatus({ detectedClients: { codex: false, claude: true, opencode: true } }),
    false
  );
  assert.doesNotMatch(opencodePlusClaude, /id="shared-storage-option" hidden/);

  const codexPlusClaude = renderSharedStorageOption(
    baseStatus({ detectedClients: { codex: true, claude: true, opencode: false } }),
    false
  );
  assert.doesNotMatch(codexPlusClaude, /id="shared-storage-option" hidden/);

  const onlyOpencode = renderSharedStorageOption(
    baseStatus({ detectedClients: { codex: false, claude: false, opencode: true } }),
    false
  );
  assert.match(onlyOpencode, /id="shared-storage-option" hidden/);
});

test('renderActivityChecklist zeigt Default-Buendel, wenn keine Auswahl gespeichert ist', () => {
  const html = renderActivityChecklist(null);
  assert.match(html, /name="activity" value="page"[^>]* checked/);
  assert.match(html, /name="activity" value="forum"[^>]* disabled/);
});

test('renderActivityChecklist zeigt gespeicherte Auswahl statt Default-Buendel', () => {
  const html = renderActivityChecklist(['quiz']);
  assert.match(html, /name="activity" value="quiz"[^>]* checked/);
  assert.doesNotMatch(html, /name="activity" value="page"[^>]* checked/);
});

test('renderCurrentStateAndChanges rendert alle Wartungsbereiche als Formularzeilen', () => {
  const html = renderCurrentStateAndChanges(baseStatus(), baseSelection());
  assert.match(html, /Aktueller Stand und Änderungen/);
  assert.match(html, /name="maintenance" value="kurspilot-setup-or-repair"/);
  assert.match(html, /name="maintenance" value="moodle-token-renewal"/);
  assert.match(html, /name="maintenance" value="workspace-change"/);
});

test('renderCropBackendSwitchRow ist leer, wenn nicht beide Backends verfuegbar sind', () => {
  assert.strictEqual(renderCropBackendSwitchRow(baseStatus()), '');
  const html = renderCropBackendSwitchRow(
    baseStatus({ imageMagick: { available: true, sipsActive: true, preferredBackend: null } })
  );
  assert.match(html, /name="cropBackend" value="sips"/);
});

test('renderUpdateSection zeigt Laufend-Hinweis statt Knopf (Check laeuft automatisch)', () => {
  const html = renderUpdateSection();
  assert.match(html, /id="update-progress"/);
  assert.doesNotMatch(html, /check-updates-button/);
});

test('renderSetupPage rendert vollstaendige Seite aus Status und Selection', () => {
  const html = renderSetupPage(baseStatus(), baseSelection(), { startMode: 'default' });
  assert.match(html, /Kurspilot konfigurieren/);
  assert.match(html, /Modus: Wartung/);
  assert.match(html, /Kurspilot-Status/);
});

test('renderSetupPage zeigt Fortschrittsbalken aus computeSetupProgress (Issue #207)', () => {
  const status = baseStatus({ moodle: { url: null, tokenPresent: false } });
  const progress = computeSetupProgress(status);
  assert.deepStrictEqual(progress, { done: 3, total: 5 });
  const html = renderSetupPage(status, baseSelection(), { startMode: 'default', progress });
  assert.match(html, /Schritt 3 von 5 erledigt/);
  assert.match(html, /class="setup-progress"/);
  assert.match(html, /setup-progress-fill/);
  assert.match(html, /width:\s*60%/);
});

test('renderSetupPage zeigt vollen Fortschritt, wenn die Mindestkonfiguration steht (Issue #207)', () => {
  const status = baseStatus();
  const html = renderSetupPage(status, baseSelection(), {
    startMode: 'default',
    progress: computeSetupProgress(status),
  });
  assert.match(html, /Schritt 5 von 5 erledigt/);
  assert.match(html, /width:\s*100%/);
});

test('setupSummaryParts liefert Schritte und Warnungen als Daten', () => {
  const parts = setupSummaryParts({ executedSteps: ['A'], imageMagickWarning: 'B' });
  assert.deepStrictEqual(parts, { steps: ['A'], warnings: ['B'] });
  assert.deepStrictEqual(setupSummaryParts({}), { steps: ['Keine Änderung ausgeführt'], warnings: [] });
});

test('renderSetupResult zeigt ausgefuehrte Schritte und Warnungen', () => {
  const html = renderSetupResult({ executedSteps: ['Moodle-Token erneuert'], skillInstallWarnings: ['Achtung'] });
  assert.match(html, /Moodle-Token erneuert/);
  assert.match(html, /<h2>Warnungen<\/h2>/);
  assert.match(html, /Achtung/);
});

test('renderSuccessNotice zeigt gruenen Hinweis mit Haken', () => {
  const html = renderSuccessNotice('Fertig', ['Erste Zeile', 'Zweite Zeile'], { id: 'notice' });
  assert.match(html, /class="success-notice"/);
  assert.match(html, /id="notice"/);
  assert.match(html, /✓ Fertig/);
  assert.match(html, /Erste Zeile<br>Zweite Zeile/);
});

test('renderCoursepilotNotices zeigt Neuinstallations-Hinweis fuer die alte Komponente (Issue #189)', () => {
  const html = renderCoursepilotNotices();
  assert.match(html, /local_aicoursecreator/);
  assert.match(html, /local_coursepilot/);
  assert.match(html, /deinstallier/i);
});

test('renderCoursepilotNotices erklaert lokal konfigurierten KI-Client und ausgeschlossene Lernendendaten (Issue #189)', () => {
  const html = renderCoursepilotNotices();
  assert.match(html, /KI-Client|KI-Anbieter/i);
  assert.match(html, /lokal/i);
  assert.match(html, /Aufgabenabgaben/);
  assert.match(html, /Forenbeitr/);
  assert.match(html, /Quizversuch/);
  assert.match(html, /Bewertung/);
  assert.match(html, /Teilnehmendenlisten/);
});

test('renderSetupPage bindet die Coursepilot-Hinweise sichtbar ein (Issue #189)', () => {
  const html = renderSetupPage(baseStatus(), baseSelection(), { startMode: 'default' });
  assert.match(html, /id="coursepilot-notices"/);
  assert.match(html, /local_aicoursecreator/);
  assert.match(html, /KI-Client|KI-Anbieter/i);
});

test('renderPostSaveActionsPage zeigt Beenden-Optionen nur fuer waehrend des Speicherns laufende Clients', () => {
  const htmlNoneRunning = renderPostSaveActionsPage({ executedSteps: ['x'] });
  assert.match(htmlNoneRunning, /✓ Fertig/);
  assert.match(htmlNoneRunning, /Sie können diesen Tab jetzt schließen/);
  assert.doesNotMatch(htmlNoneRunning, /Fertig und Tab schließen/);
  assert.doesNotMatch(htmlNoneRunning, /<button class="end-now-button"/);

  const htmlCodexRunning = renderPostSaveActionsPage({ executedSteps: ['x'], codexWasRunningDuringSave: true });
  assert.match(htmlCodexRunning, /Codex jetzt beenden/);
  assert.match(htmlCodexRunning, /id="close-tab-notice"[^>]*hidden/);
});

// --- Wartungs-Ansicht Skelett (Issue #202, Spec 0005) -----------------------

test('renderMaintenancePage rendert Titel "Kurspilot", Untertitel und "Alles läuft"-Statuszeile', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /<title>Kurspilot<\/title>/);
  assert.match(html, /<h1>Kurspilot<\/h1>/);
  assert.match(html, /Einstellungen/);
  assert.match(html, /Alles läuft/);
  assert.match(html, /Zuletzt geprüft/);
});

test('renderMaintenancePage enthaelt ein (noch leeres) Card-Grid', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /class="card-grid"/);
  assert.match(html, /id="maintenance-cards"/);
});

test('renderMaintenancePage-Footer bietet "Dienst beenden" (POST /abort) und "Ersteinrichtung wiederholen"', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /Dienst beenden/);
  assert.match(html, /Ersteinrichtung wiederholen/);
  assert.match(html, /\/abort/);
  assert.match(html, /\/restart-setup/);
});

test('renderMaintenancePage sichert "Ersteinrichtung wiederholen" mit JS-confirm() ab', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /window\.confirm\(/);
  assert.match(html, /restart-setup-button/);
});

test('renderMaintenancePage ist von der Ersteinrichtungs-Seite unterscheidbar', () => {
  const html = renderMaintenancePage(baseStatus());
  // Issue #209: Der Neustart-Hinweis (Health-Poll) nennt "Kurspilot
  // konfigurieren" bewusst auch auf der Wartungs-Seite. Unterscheidungsmerkmal
  // ist daher die Ersteinrichtungs-Ueberschrift, nicht die blosse Phrase.
  assert.doesNotMatch(html, /<h1>Kurspilot konfigurieren<\/h1>/);
  assert.doesNotMatch(html, /Modus:/);
});

test('renderMaintenancePage nutzt echte Umlaute statt ae/oe/ue', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /läuft/);
  assert.match(html, /geprüft/);
  assert.match(html, /schließen/);
  assert.doesNotMatch(html, /laeuft|pruefen|schliessen/);
});

// --- Wartungsansicht: visuelle Grundlage (Issue #211, Spec 0006 Scheibe 1) --

test('renderMaintenancePage definiert semantische Light-Mode-Tokens und nutzt sie für Oberfläche, Text, Rahmen, Akzent, Erfolg, Gefahr, Fokus, Abstände, Radien und Erhebung (#211)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /:root \{/, 'Tokens liegen zentral im :root-Block');
  const tokenDefinitions = [
    '--kp-surface:',
    '--kp-surface-raised:',
    '--kp-text:',
    '--kp-text-muted:',
    '--kp-border:',
    '--kp-accent:',
    '--kp-success:',
    '--kp-danger:',
    '--kp-focus:',
    '--kp-space-',
    '--kp-radius-',
    '--kp-elevation-1:',
    '--kp-elevation-2:',
    '--kp-target-size: 44px',
  ];
  for (const token of tokenDefinitions) {
    assert.match(html, new RegExp(token.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Token ${token} ist definiert`);
  }
  assert.match(html, /background: var\(--kp-surface\)/, 'Seite nutzt das Oberflächen-Token');
  assert.match(html, /color: var\(--kp-text\)/, 'Text nutzt das Text-Token');
  assert.match(html, /var\(--kp-border\)/, 'Rahmen nutzen das Rahmen-Token');
  assert.match(html, /var\(--kp-accent\)/, 'Akzentflächen nutzen das Akzent-Token');
  assert.match(html, /color: var\(--kp-success\)/, 'Erfolgsstatus nutzt das Erfolgs-Token');
  assert.match(html, /var\(--kp-danger\)/, 'destruktive Rolle nutzt das Gefahr-Token');
  assert.match(html, /outline: \d+px solid var\(--kp-focus\)/, 'Fokus-Ring nutzt das Fokus-Token');
  assert.match(html, /gap: var\(--kp-space-lg\)/, 'Abstände nutzen die Abstands-Tokens');
  assert.match(html, /border-radius: var\(--kp-radius-md\)/, 'Radien nutzen die Radius-Tokens');
  assert.match(html, /box-shadow: var\(--kp-elevation-1\)/, 'Erhebung nutzt das Schatten-Token');
});

test('renderMaintenancePage: alle vier Button-Rollen haben Hover-, Press-, focus-visible- und Disabled-Zustände (#211)', () => {
  const html = renderMaintenancePage(baseStatus());
  for (const role of ['btn-primary', 'btn-secondary', 'btn-tertiary', 'btn-destructive']) {
    assert.match(html, new RegExp(`\\.${role} \\{`), `Rolle ${role} ist gestaltet`);
    assert.match(html, new RegExp(`\\.${role}:hover \\{`), `Rolle ${role} hat einen Hover-Zustand`);
    assert.match(html, new RegExp(`\\.${role}:active \\{`), `Rolle ${role} hat einen Press-Zustand`);
    assert.match(html, new RegExp(`\\.${role}:disabled`), `Rolle ${role} hat einen Disabled-Zustand`);
  }
  assert.match(html, /button:focus-visible/, 'Buttons haben einen focus-visible-Zustand');
  assert.match(html, /input:focus-visible/, 'Eingaben haben einen focus-visible-Zustand');
});

test('renderMaintenancePage: interaktive Flächen sind mindestens 44px hoch (#211)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /--kp-target-size: 44px/);
  assert.match(html, /\.btn-primary, \.btn-secondary, \.btn-tertiary, \.btn-destructive \{[^}]*min-height: var\(--kp-target-size\)/);
  assert.match(html, /\.card-detail input \{[^}]*min-height: var\(--kp-target-size\)/);
  assert.match(html, /\.checkbox-choice, \.radio-choice \{[^}]*min-height: var\(--kp-target-size\)/);
});

test('renderMaintenancePage weist jeder Button-Rolle mindestens ein Bedienelement zu (#211)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /class="btn-primary card-save"/, 'Speichern ist primär');
  assert.match(html, /class="choose-workspace-button btn-secondary"/, 'Ordner wählen ist sekundär');
  assert.match(html, /class="version-check-button btn-secondary"/, 'erneut prüfen ist sekundär');
  assert.match(html, /class="card-edit btn-tertiary"/, 'Ändern ist tertiär');
  assert.match(html, /class="btn-restart-setup btn-tertiary"/, 'Ersteinrichtung wiederholen ist tertiär');
  assert.match(html, /class="btn-abort btn-destructive"/, 'Dienst beenden ist destruktiv');
});

test('renderMaintenancePage: tertiäre Aktionen sind abgegrenzte Buttons statt unterstrichener Links', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.btn-tertiary \{[^}]*background: var\(--kp-surface-raised\)[^}]*border-color: var\(--kp-border\)/);
  assert.match(html, /\.btn-tertiary \{[^}]*text-decoration: none/);
});

test('renderMaintenancePage: Installieren in der Version-Card erhält über data-action die primäre Rolle (#211)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.version-check-button\[data-action="install"\] \{[^}]*background: var\(--kp-accent\)/);
});

test('renderMaintenancePage: Footer-Aktionen nutzen keinen Emoji als strukturelles Icon, sichtbarer Text bleibt erhalten (#211)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.doesNotMatch(html, /⏻/, 'kein Power-Emoji im Footer');
  assert.doesNotMatch(html, /↩/, 'kein Pfeil-Emoji im Footer');
  assert.match(html, /id="abort-button"[^>]*>Dienst beenden<\/button>/, 'Dienst beenden trägt sichtbaren Text direkt am Button');
  assert.match(html, /id="restart-setup-button"[^>]*>Ersteinrichtung wiederholen<\/button>/, 'Ersteinrichtung wiederholen trägt sichtbaren Text direkt am Button');
});

// --- Wartungsansicht: Card-Hierarchie und Fokusfluss (Issue #212, Spec 0006 Scheibe 2) --

test('renderMaintenancePage: Header, Status, Raster und Cards bilden eine konsistente Hierarchie – Cards derselben Zeile sind optisch gleich hoch (#212)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.card \{[^}]*display: flex[^}]*flex-direction: column/, 'Card ist eine Flex-Spalte');
  assert.match(html, /\.card-grid \{[^}]*align-items: stretch/, 'Raster streckt Cards auf Zeilenhöhe');
  assert.match(html, /\.card-summary \{[^}]*flex: 1/, 'Zusammenfassung streckt kurze Cards auf gleiche Höhe');
});

test('renderMaintenancePage: genau die geöffnete Card erhält einen sichtbaren offenen Zustand mit Akzent-Rahmen und Erhöhung (#212)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.card\.is-open \{[^}]*border-color: var\(--kp-accent\)/, 'offene Card nutzt Akzent-Rahmen');
  assert.match(html, /\.card\.is-open \{[^}]*box-shadow: var\(--kp-elevation-2\)/, 'offene Card erhält die erhöhte Schattenstufe');
});

test('renderMaintenancePage: Card-Auslöser starten geschlossen und kommunizieren ihren Zustand über aria-expanded (#212)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /class="card-edit btn-tertiary" type="button" data-card-id="moodle" aria-expanded="false"/, 'Moodle-Auslöser startet geschlossen');
  assert.match(html, /class="card-edit btn-tertiary" type="button" data-card-id="workspace" aria-expanded="false"/, 'Arbeitsordner-Auslöser startet geschlossen');
  assert.match(html, /class="card-edit btn-tertiary" type="button" data-card-id="activities" aria-expanded="false"/, 'Aktivitäten-Auslöser startet geschlossen');
  assert.match(html, /setAttribute\("aria-expanded"/, 'aria-expanded wird bei Öffnen und Schließen synchronisiert');
});

test('renderMaintenancePage: beim Öffnen schließen alle anderen Cards weiterhin zuverlässig, genau eine Card ist offen (#212)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /closeAllCards\(\);[\s\S]*?setCardOpen\(/, 'vor dem Öffnen werden alle anderen Cards geschlossen');
  assert.match(html, /classList\.toggle\("is-open"/, 'der offene Zustand wird als Zustandsklasse geführt');
});

test('renderMaintenancePage: Fokus bewegt sich beim Öffnen zum ersten bedienbaren Feld und beim Schließen zurück zum Auslöser (#212)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /detail\.querySelector\("input, button, select, textarea"\)/, 'beim Öffnen wird das erste bedienbare Feld gesucht');
  assert.match(html, /firstField\.focus\(\)/, 'Fokus geht beim Öffnen in das erste Feld');
  assert.match(html, /trigger\.focus\(\)/, 'Fokus kehrt beim Schließen zum Auslöser zurück');
});

test('renderMaintenancePage: Bewegungen sind kurz, betreffen keine Layout-Eigenschaften und respektieren reduzierte Bewegung (#212)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.card \{[^}]*transition:[^}]*(border-color|box-shadow)/, 'Card-Übergang betrifft nur Rahmen und Schatten');
  assert.doesNotMatch(html, /transition:[^;}]*\b(height|margin|padding|top|left|right|bottom|width)\b/, 'keine Layout-Eigenschaft im Übergang – keine Layoutverschiebung');
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/, 'reduzierte Bewegung wird respektiert');
  assert.match(html, /prefers-reduced-motion: reduce\)[^{]*\{[^}]*transition: none/, 'bei reduzierter Bewegung fallen Übergänge weg');
});

// --- Wartungsansicht: Dark Mode auf semantischen Tokens (Issue #214) ---------

test('renderMaintenancePage: OS-Präferenz schaltet semantische Tokens über prefers-color-scheme in den Dark Mode (#214)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /@media \(prefers-color-scheme: dark\) \{/, 'Dark Mode folgt der OS-Präferenz ohne neue Einstellung');
  const mediaStart = html.indexOf('@media (prefers-color-scheme: dark)');
  const darkBlock = html.slice(mediaStart, html.indexOf('</style>', mediaStart));
  assert.match(darkBlock, /:root \{/, 'Dark-Overrides liegen wieder im zentralen :root-Block');
  const darkTokens = [
    '--kp-surface:',
    '--kp-surface-raised:',
    '--kp-surface-sunken:',
    '--kp-surface-sunken-hover:',
    '--kp-surface-sunken-active:',
    '--kp-text:',
    '--kp-text-muted:',
    '--kp-border:',
    '--kp-accent:',
    '--kp-accent-hover:',
    '--kp-accent-active:',
    '--kp-accent-subtle:',
    '--kp-accent-subtle-active:',
    '--kp-on-accent:',
    '--kp-success:',
    '--kp-danger:',
    '--kp-danger-hover:',
    '--kp-danger-active:',
    '--kp-on-danger:',
    '--kp-focus:',
    '--kp-elevation-1:',
    '--kp-elevation-2:',
  ];
  for (const token of darkTokens) {
    assert.match(darkBlock, new RegExp(token.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Dark-Mode-Wert für ${token} ist definiert`);
  }
});

test('renderMaintenancePage: Dark-Mode-Werte unterscheiden sich vom Light Mode (#214)', () => {
  const html = renderMaintenancePage(baseStatus());
  const rootStart = html.indexOf(':root {');
  const lightBlock = html.slice(rootStart, html.indexOf('}', rootStart));
  const mediaStart = html.indexOf('@media (prefers-color-scheme: dark)');
  const darkRootStart = html.indexOf(':root {', mediaStart);
  const darkBlock = html.slice(darkRootStart, html.indexOf('}', darkRootStart));
  const sharedTokens = [
    '--kp-surface',
    '--kp-surface-raised',
    '--kp-surface-sunken',
    '--kp-text',
    '--kp-text-muted',
    '--kp-border',
    '--kp-accent',
    '--kp-success',
    '--kp-danger',
    '--kp-focus',
  ];
  for (const token of sharedTokens) {
    const light = (lightBlock.match(new RegExp(`${token}: ([^;]+);`)) || [])[1];
    const dark = (darkBlock.match(new RegExp(`${token}: ([^;]+);`)) || [])[1];
    assert.ok(light, `Light-Wert für ${token} gefunden`);
    assert.ok(dark, `Dark-Wert für ${token} gefunden`);
    assert.notStrictEqual(dark.trim(), light.trim(), `${token} wird im Dark Mode tatsächlich getauscht`);
  }
});

test('renderMaintenancePage: Farbschema bleibt eine OS-Entscheidung, native Formularelemente und Eingaben folgen mit (#214)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /:root \{[^}]*color-scheme: light/, 'Light Mode meldet color-scheme: light');
  const mediaStart = html.indexOf('@media (prefers-color-scheme: dark)');
  const darkBlock = html.slice(mediaStart, html.indexOf('</style>', mediaStart));
  assert.match(darkBlock, /color-scheme: dark/, 'Dark Mode meldet color-scheme: dark für native Formularelemente');
  assert.match(html, /\.card-detail input \{[^}]*background: var\(--kp-surface-raised\)[^}]*color: var\(--kp-text\)/, 'Eingaben nutzen Oberflächen- und Text-Tokens statt Browser-Defaults');
  assert.doesNotMatch(html, /localStorage\.(get|set|remove)Item\(\s*["'][^"']*(theme|dark|scheme)[^"']*["']/i, 'kein gespeicherter Themenwert – nur die OS-Präferenz zählt');
});

// --- MCP-Aktivitäten: vollständige, kompakte Zusammenfassung (Issue #213) ----

test('activitiesSummaryText zeigt Anzahl und alle Namen mit Mittelpunkt getrennt (#213)', () => {
  const text = activitiesSummaryText(baseStatus({ configuredActivityIds: null }));
  assert.match(text, /^6 Aktivitäten: /, 'Anzahl und Doppelpunkt vor den Namen');
  assert.match(text, /Textseite · Textfeld · URL · Aufgabe · Test · Fragensammlung/, 'alle sechs Default-Namen in Reihenfolge');
  assert.doesNotMatch(text, /✓|✔|☑/, 'keine Haken');
  assert.doesNotMatch(text, /\.\.\.|…/, 'keine Auslassungspunkte');
});

test('activitiesSummaryText zeigt Teilmenge korrekt (#213)', () => {
  const text = activitiesSummaryText(baseStatus({ configuredActivityIds: ['page', 'quiz'] }));
  assert.strictEqual(text, '2 Aktivitäten: Textseite · Test');
});

test('activitiesSummaryText zeigt Hinweis bei keiner Aktivität (#213)', () => {
  const text = activitiesSummaryText(baseStatus({ configuredActivityIds: [] }));
  assert.strictEqual(text, 'Keine Aktivitäten');
});

test('renderActivitiesCard: geschlossene Summary enthaelt keine Checkboxen oder Haken (#213)', () => {
  const html = renderActivitiesCard(baseStatus({ configuredActivityIds: null }));
  const summaryMatch = html.match(/data-card-summary="activities">([^<]*)</);
  assert.ok(summaryMatch, 'Summary-Element vorhanden');
  const summaryText = summaryMatch[1];
  assert.doesNotMatch(summaryText, /checkbox|type="checkbox"/i, 'keine Checkbox in der Summary');
  assert.doesNotMatch(summaryText, /✓|✔|☑/, 'keine Haken in der Summary');
  assert.match(summaryText, /6 Aktivitäten: /, 'Anzahl und Namen in der Summary');
});

test('renderMaintenancePage: card-summary bricht um ohne horizontalen Scroll (#213)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.card-summary \{[^}]*overflow-wrap: break-word/, 'Summary bricht lange Woerter um');
});

test('renderActivitiesCard: geoeffnete Card zeigt alle Checkboxen vertikal (#213)', () => {
  const html = renderActivitiesCard(baseStatus({ configuredActivityIds: null }));
  const checkboxes = html.match(/type="checkbox" name="activity"/g);
  assert.strictEqual(checkboxes.length, 6, 'sechs Checkboxen im Detailbereich');
  assert.match(html, /checkbox-choice/, 'Checkboxen nutzen vertikales Layout');
});

// --- Cards S4: Arbeitsordner, Bildbearbeitung, Version (Issue #204) ---------

test('workspaceSummaryText zeigt Pfad wenn eingerichtet, sonst Hinweis', () => {
  assert.strictEqual(
    workspaceSummaryText({ configured: true, path: '/Users/test/Kurspilot' }),
    '/Users/test/Kurspilot'
  );
  assert.strictEqual(workspaceSummaryText({ configured: false, path: null }), 'Nicht eingerichtet');
});

test('renderWorkspaceCard zeigt Pfad-Feld mit word-break:break-all und Ordner-Dialog-Button (#204)', () => {
  const html = renderWorkspaceCard(baseStatus());
  assert.match(html, /data-card-id="workspace"/);
  assert.match(html, /Arbeitsordner/);
  assert.match(html, /name="workspacePath" value="\/Users\/test\/Kurspilot"/);
  assert.match(html, /Ordner wählen…/);
  assert.match(html, /choose-workspace-button/);
  assert.match(html, /card-save" type="button" data-card-id="workspace"/);
});

test('renderMaintenancePage bindet word-break:break-all fuer das Pfad-Feld ein (#204)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.card-path \{ word-break: break-all; \}/);
  assert.match(html, /choose-workspace\?current=/);
});

test('cropBackendSummaryText nennt aktives Backend', () => {
  assert.strictEqual(cropBackendSummaryText({ sipsActive: true, preferredBackend: null, available: true }), 'sips');
  assert.strictEqual(cropBackendSummaryText({ sipsActive: true, preferredBackend: 'imagemagick', available: true }), 'ImageMagick');
  assert.strictEqual(cropBackendSummaryText({ sipsActive: false, available: true, preferredBackend: null }), 'ImageMagick');
  assert.strictEqual(cropBackendSummaryText(null), '–');
});

test('renderCropBackendCard zeigt exklusive sips\/ImageMagick-Radios, wenn beide verfuegbar sind (#204)', () => {
  const html = renderCropBackendCard(
    baseStatus({ imageMagick: { sipsActive: true, available: true, preferredBackend: null, supported: true } })
  );
  assert.match(html, /data-card-id="crop-backend"/);
  assert.match(html, /Bildbearbeitung/);
  assert.match(html, /type="radio" name="cropBackend" value="sips" checked/);
  assert.match(html, /type="radio" name="cropBackend" value="imagemagick"(?!.*checked)/);
  assert.match(html, /card-save" type="button" data-card-id="crop-backend"/);
});

test('renderCropBackendCard uebernimmt gespeicherte ImageMagick-Praeferenz als Vorauswahl (#204)', () => {
  const html = renderCropBackendCard(
    baseStatus({ imageMagick: { sipsActive: true, available: true, preferredBackend: 'imagemagick', supported: true } })
  );
  assert.match(html, /type="radio" name="cropBackend" value="imagemagick" checked/);
  assert.match(html, /type="radio" name="cropBackend" value="sips"(?!.*checked)/);
});

test('renderCropBackendCard zeigt ohne beide Backends nur eine Lesezeile, keine Radios (#204)', () => {
  const html = renderCropBackendCard(
    baseStatus({ imageMagick: { sipsActive: true, available: false, preferredBackend: null, supported: true } })
  );
  assert.doesNotMatch(html, /name="cropBackend"/);
  assert.match(html, /sips/);
});

test('renderVersionCard zeigt Ergebniszeile und Knopf "erneut prüfen" mit data-action (#204)', () => {
  const html = renderVersionCard();
  assert.match(html, /data-card-id="version"/);
  assert.match(html, /<h2>Version<\/h2>/);
  assert.match(html, /version-result/);
  assert.match(html, /version-check-button/);
  assert.match(html, /data-action="check"/);
  assert.match(html, /erneut prüfen/);
});

test('renderMaintenancePage: Version-Card-JS spricht /check-updates an, wechselt auf "Installieren" und nutzt /apply-updates (#204)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /fetch\("\/check-updates"\)/);
  assert.match(html, /Update verfügbar/);
  assert.match(html, /button\.textContent = "Installieren"/);
  assert.match(html, /button\.dataset\.action = "install"/);
  assert.match(html, /\/apply-updates\?token=/);
  assert.match(html, /initVersionCard/);
});

test('renderMaintenancePage ersetzt die drei S4-Platzhalter durch echte Cards (#204)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /data-card-id="workspace"/);
  assert.match(html, /data-card-id="crop-backend"/);
  assert.match(html, /data-card-id="version"/);
  assert.match(html, /<h2>Arbeitsordner<\/h2>/);
  assert.match(html, /<h2>Bildbearbeitung<\/h2>/);
  assert.doesNotMatch(html, /<h2>Arbeitsbereich<\/h2>/);
  assert.doesNotMatch(html, /<h2>Bildausschnitt<\/h2>/);
  assert.match(html, /<h2>KI-Clients<\/h2>/);
  assert.match(html, /<h2>MCP-Aktivitäten<\/h2>/, 'Aktivitaeten-Card ist seit S6 eine echte Card');
});

// --- Card 'KI-Clients' + Neustart-Logik (Issue #205, Spec 0005 S5) ----------

test('clientsSummaryText nennt erkannte Clients, sonst Hinweis', () => {
  assert.strictEqual(
    clientsSummaryText(baseStatus({ detectedClients: { codex: true, claude: true, opencode: false } })),
    'Codex, Claude'
  );
  assert.strictEqual(
    clientsSummaryText(baseStatus({ detectedClients: { codex: false, claude: false, opencode: true } })),
    'opencode'
  );
  assert.strictEqual(
    clientsSummaryText(baseStatus({ detectedClients: { codex: false, claude: false, opencode: false } })),
    'Kein Client erkannt'
  );
});

test('renderClientsCard zeigt Checkboxen nur fuer erkannte Clients plus Speichern und Neustart-Slot (#205)', () => {
  const html = renderClientsCard(
    baseStatus({ detectedClients: { codex: true, claude: true, opencode: true } })
  );
  assert.match(html, /data-card-id="clients"/);
  assert.match(html, /<h2>KI-Clients<\/h2>/);
  assert.match(html, /type="checkbox" name="client" value="codex" checked/);
  assert.match(html, /type="checkbox" name="client" value="claude" checked/);
  assert.match(html, /type="checkbox" name="client" value="opencode" checked/);
  assert.match(html, /card-save" type="button" data-card-id="clients"/);
  assert.match(html, /data-card-restart="clients"/);
});

test('renderClientsCard listet nicht erkannte Clients nicht auf (#205)', () => {
  const html = renderClientsCard(baseStatus());
  assert.match(html, /value="codex" checked/);
  assert.doesNotMatch(html, /value="claude"/);
  assert.doesNotMatch(html, /value="opencode"/);
});

test('renderMaintenancePage: Clients-Card-JS rendert Neustart-Button und opencode-Hinweiszeile (#205)', () => {
  const html = renderMaintenancePage(
    baseStatus({ detectedClients: { codex: true, claude: true, opencode: true } })
  );
  assert.match(html, /\/restart-client\?token=/);
  assert.match(html, /restart-client-button/);
  assert.match(html, /Beim nächsten opencode-Chat aktiv — kein Neustart nötig/);
  assert.match(html, /renderRestartBlock/);
});

test('renderMaintenancePage: Instant-Save nutzt append fuer Mehrfach-Checkboxen (#205)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /body\.append\(input\.name, input\.value\)/);
  assert.doesNotMatch(html, /body\.set\(input\.name, input\.value\)/);
});

test('renderMaintenancePage enthaelt Health-Polling mit Neustart-Hinweis (#209)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /id="server-gone-banner"/);
  assert.match(html, /Kurspilot konfigurieren.*neu starten/);
  assert.match(html, /fetch\("\/health"\)/);
});

test('renderSetupPage enthaelt Health-Polling mit Neustart-Hinweis (#209)', () => {
  const html = renderSetupPage(baseStatus(), baseSelection());
  assert.match(html, /id="server-gone-banner"/);
  assert.match(html, /Kurspilot konfigurieren.*neu starten/);
  assert.match(html, /fetch\("\/health"\)/);
});
