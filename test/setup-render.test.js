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
  renderSuccessNotice,
  renderMaintenancePage,
  renderMoodleCard,
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

test('escapeHtml maskiert alle HTML-Sonderzeichen', () => {
  assert.strictEqual(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('renderSuccessNotice zeigt gruenen Hinweis mit Haken', () => {
  const html = renderSuccessNotice('Fertig', ['Erste Zeile', 'Zweite Zeile'], { id: 'notice' });
  assert.match(html, /class="success-notice"/);
  assert.match(html, /id="notice"/);
  assert.match(html, /✓ Fertig/);
  assert.match(html, /Erste Zeile<br>Zweite Zeile/);
});

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

test('renderMaintenancePage-Footer bietet "Dienst beenden" (POST /abort)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /Dienst beenden/);
  assert.match(html, /\/abort/);
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
  assert.match(html, /\.radio-choice \{[^}]*min-height: var\(--kp-target-size\)/);
  assert.match(html, /\.checkbox-choice \{[^}]*min-height: var\(--kp-target-size\)/, 'Checkbox-Zeilen bleiben gut bedienbar');
});

test('renderMaintenancePage weist jeder Button-Rolle mindestens ein Bedienelement zu (#211)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /class="btn-primary card-save"/, 'Speichern ist primär');
  assert.match(html, /class="choose-workspace-button btn-secondary"/, 'Ordner wählen ist sekundär');
  assert.match(html, /class="version-check-button btn-tertiary"/, 'erneut prüfen folgt dem Ändern-Muster');
  assert.match(html, /class="card-edit btn-tertiary"/, 'Ändern ist tertiär');
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
  assert.match(html, /class="card-column-actions"/, 'Aktionen folgen ihrer jeweiligen Kartenspalte');
});

test('renderMaintenancePage-Footer bietet "Einstellungen zurücksetzen" als tertiäre Aktion neben "Dienst beenden" (#236)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /Einstellungen zurücksetzen/);
  assert.match(html, /\/reset-settings/);
  assert.match(html, /class="btn-reset-settings btn-tertiary"/, 'Einstellungen zurücksetzen ist tertiär gestaltet');
  assert.match(html, /id="reset-settings-button"[^>]*>Einstellungen zurücksetzen<\/button>/, 'sichtbarer Text direkt am Bedienelement');
});

test('renderMaintenancePage sichert "Einstellungen zurücksetzen" mit JS-confirm() ab und lädt bei Erfolg neu (#236)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(
    html,
    /getElementById\("reset-settings-button"\)\.addEventListener\("click"[\s\S]*?window\.confirm\(/,
    'Klick löst Bestätigungsdialog aus'
  );
  assert.match(
    html,
    /getElementById\("reset-settings-button"\)\.addEventListener\("click"[\s\S]*?\/reset-settings\?token=[\s\S]*?window\.location\.reload\(\)/,
    'Nach Bestätigung wird der Endpunkt aufgerufen und die Ansicht neu geladen'
  );
});

// --- Wartungsansicht: Card-Hierarchie und Fokusfluss (Issue #212, Spec 0006 Scheibe 2) --

test('renderMaintenancePage: geschlossene Karten liegen in unabhängigen Spalten und haben eine einheitliche Höhe', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.card \{[^}]*display: flex[^}]*flex-direction: column/, 'Card ist eine Flex-Spalte');
  assert.match(html, /class="card-column"/, 'Raster gruppiert Karten pro Spalte');
  assert.match(html, /\.card:not\(\.is-open\) \{[^}]*height: var\(--kp-card-closed-height\)/, 'geschlossene Karten haben eine einheitliche Höhe');
  assert.match(html, /\.card-column \{[^}]*display: grid/, 'jede Spalte stapelt ihre eigenen Karten');
  assert.match(html, /@media \(max-width: 959px\) \{ \.card-grid \{ grid-template-columns: 1fr; \} \}/, 'Tablet nutzt eine einzelne statt einer unvollständigen Spaltenzeile');
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

// --- Wartungsansicht: Aufweitung geöffneter Cards (Issue #235, Spec 0007) ----

test('renderMaintenancePage: nur Moodle- und Aktivitäten-Card sind als breit öffnende Cards markiert (#235)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /class="card card-wide" data-card-id="moodle"/, 'Moodle-Card trägt die Weit-Klasse');
  assert.match(html, /class="card card-wide" data-card-id="activities"/, 'Aktivitäten-Card trägt die Weit-Klasse');
  for (const cardId of ['workspace', 'clients', 'crop-backend', 'version']) {
    assert.doesNotMatch(html, new RegExp(`card-wide" data-card-id="${cardId}"`), `${cardId}-Card bleibt einspaltig`);
  }
});

test('renderMaintenancePage: breit geöffnete Cards spannen zwei Rasterspalten und fließen einspaltig zurück (#235)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.card-column:has\(\.card\.is-open\.card-wide\) \{ grid-column: span 2; \}/, 'die enthaltende Kartenspalte spannt beim Öffnen zwei Rasterspalten');
  assert.match(html, /@media \(max-width: 959px\) \{ \.card-column:has\(\.card\.is-open\.card-wide\) \{ grid-column: span 1; \}/, 'bei einer Rasterspalte bleibt die Card einspaltig');
});

test('renderMaintenancePage: der Inhalt breit geöffneter Cards bricht in zwei Textspalten um (#235)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /\.card\.is-open\.card-wide \.card-detail \{ display: block; column-count: 2;/, 'offenes Detail wechselt in den Blockfluss mit zwei Textspalten');
  assert.match(html, /\.card\.is-open\.card-wide \.card-detail > \* \{ break-inside: avoid; \}/, 'Checkbox-Zeilen und Anleitung werden nicht zwischen den Spalten geteilt');
  assert.match(html, /\.card\.is-open\.card-wide \.card-detail \{ display: grid; column-count: 1; \}/, 'schmale Fenster stellen das einspaltige Grid-Layout wieder her');
  assert.match(html, /img\.token-help \{[^}]*width: min\(100%, 620px\)/, 'die Anleitung-Grafik schrumpft auf Spaltenbreite mit');
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
  assert.match(html, /\.card-summary:not\(\[data-card-summary="activities"\]\) \{[^}]*-webkit-line-clamp: 4/, 'andere lange Summaries bleiben innerhalb der geschlossenen Card');
});

test('renderActivitiesCard: geoeffnete Card zeigt alle Checkboxen vertikal (#213)', () => {
  const html = renderActivitiesCard(baseStatus({ configuredActivityIds: null }));
  const checkboxes = html.match(/type="checkbox" name="activity"/g);
  assert.strictEqual(checkboxes.length, 10, 'zehn Checkboxen im Detailbereich');
  assert.match(html, /checkbox-choice/, 'Checkboxen nutzen vertikales Layout');
  assert.match(html, /activity-icon/, 'jede Aktivität hat ein Moodle-Icon');
  assert.match(html, /theme\/image\.php\/boost\/mod_page\/0\/monologo/, 'Textseite nutzt das Boost-Icon');
  assert.match(html, /theme\/image\.php\/boost\/mod_qbank\/0\/monologo/, 'Fragensammlung nutzt das Moodle-5-qbank-Icon');
  assert.match(renderMaintenancePage(baseStatus()), /\.activity-icon \{[^}]*filter: invert\(1\)/, 'Boost-Symbole sind im Dark Mode sichtbar');
  assert.match(renderMaintenancePage(baseStatus()), /\.checkbox-choice input \{[^}]*width: 1\.25rem[^}]*height: 1\.25rem/, 'Checkboxen sind gut erkennbar');
  assert.match(renderMaintenancePage(baseStatus()), /\[data-card-detail="activities"\] \{ gap: 0; \}/, 'Aktivitätszeilen haben keinen zusätzlichen vertikalen Grid-Abstand');
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

test('renderVersionCard zeigt Ergebniszeile und Knopf "erneut prüfen" im Card-Header mit data-action (#204)', () => {
  const html = renderVersionCard();
  assert.match(html, /data-card-id="version"/);
  assert.match(html, /<h2>Version<\/h2>/);
  assert.match(html, /version-result/);
  assert.match(html, /data-card-summary="version" role="status" aria-live="polite"/);
  assert.match(html, /version-check-button/);
  assert.match(html, /<div class="card-header">[\s\S]*version-check-button/, 'Prüfknopf steht bei der Card-Aktion');
  assert.match(html, /version-check-button btn-tertiary/, 'Prüfknopf folgt dem Ändern-Muster');
  assert.match(html, /data-action="check"/);
  assert.match(html, /erneut prüfen/);
});

test('renderMaintenancePage: Version-Card-JS spricht /check-updates an, wechselt auf "Installieren" und nutzt /apply-updates (#204)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /fetch\("\/check-updates"\)/);
  assert.match(html, /Update verfügbar/);
  assert.match(html, /button\.textContent = "Installieren"/);
  assert.match(html, /button\.dataset\.action = "install"/);
  assert.match(html, /result\.textContent = ""/, 'Erfolg wird ausschließlich in der oberen Zusammenfassung gezeigt');
  assert.match(html, /\/apply-updates\?token=/);
  assert.match(html, /initVersionCard/);
});

test('renderMaintenancePage: geschlossene Desktop-Karten sind kompakt, auf kleinen Bildschirmen aber hoch genug', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /--kp-card-closed-height: 9rem/, 'Desktop-Karten sind flacher');
  assert.match(html, /@media \(max-width: 959px\) \{ :root \{ --kp-card-closed-height: 12rem; \} \}/, 'kleine Bildschirme behalten Platz für Umbrüche');
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

// --- Card 'Moodle-Zugang': Token-Anleitung (#232) ----------------------------

test('renderMoodleCard: Token-Anleitung aufgeklappt wenn kein Token gespeichert (#232)', () => {
  const html = renderMoodleCard(baseStatus({ moodle: { url: 'https://moodle.example.test', tokenPresent: false } }));
  assert.match(html, /<details open>/, 'details ist open ohne Token');
  assert.match(html, /<summary>Token-Anleitung<\/summary>/);
  assert.match(html, /src="\/assets\/setup\/token-help\.svg"/);
  assert.match(html, /Token erstellen oder erneuern/);
});

test('renderMoodleCard: Token-Anleitung eingeklappt wenn Token gespeichert (#232)', () => {
  const html = renderMoodleCard(baseStatus({ moodle: { url: 'https://moodle.example.test', tokenPresent: true } }));
  assert.match(html, /<details>/, 'details ohne open-Attribut');
  assert.doesNotMatch(html, /<details open>/, 'kein open bei vorhandenem Token');
  assert.match(html, /<summary>Token-Anleitung<\/summary>/);
  assert.match(html, /src="\/assets\/setup\/token-help\.svg"/);
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

test('renderClientsCard zeigt sharedSkillStorage-Option bei zwei erkannten Clients (#233)', () => {
  const html = renderClientsCard(
    baseStatus({ detectedClients: { codex: true, claude: true, opencode: false } })
  );
  assert.match(html, /name="sharedSkillStorage"/);
  assert.match(html, /Gemeinsame Skill-Ablage/);
  assert.doesNotMatch(html, /data-shared-skill-storage[^>]*hidden/);
});

test('renderClientsCard blendet sharedSkillStorage bei nur einem erkannten Client aus (#233)', () => {
  const html = renderClientsCard(baseStatus());
  assert.match(html, /name="sharedSkillStorage"/);
  assert.match(html, /data-shared-skill-storage[^>]*hidden/);
});

test('renderMaintenancePage enthaelt JS zum Ein-/Ausblenden der sharedSkillStorage-Option (#233)', () => {
  const html = renderMaintenancePage(
    baseStatus({ detectedClients: { codex: true, claude: true, opencode: true } })
  );
  assert.match(html, /data-shared-skill-storage/);
  assert.match(html, /sharedSkillStorage.*hidden|hidden.*sharedSkillStorage/s);
});

// --- Card 'Bildbearbeitung': asynchrone Installation mit Polling (#234) ------

test('renderCropBackendCard zeigt Speicherplatz-Postenliste, wenn macOS ohne ImageMagick (#234)', () => {
  const html = renderCropBackendCard(
    baseStatus({ imageMagick: { sipsActive: true, available: false, preferredBackend: null, supported: true } })
  );
  assert.match(html, /Benötigter Speicherplatz/);
  assert.match(html, /Homebrew.*500 MB/);
  assert.match(html, /ImageMagick \+ Abhängigkeiten.*60 MB/);
  assert.match(html, /Summe: ca\. 560 MB/);
  assert.match(html, /Installieren/);
  assert.doesNotMatch(html, /name="cropBackend"/);
});

test('renderCropBackendCard zeigt ohne sips (Windows) keine Speicherplatz-Postenliste (#234)', () => {
  const html = renderCropBackendCard(
    baseStatus({ imageMagick: { sipsActive: false, available: false, preferredBackend: null, supported: true } })
  );
  assert.doesNotMatch(html, /Benötigter Speicherplatz/);
  assert.match(html, /Installieren/);
});

test('renderCropBackendCard uebernimmt installState als data-Attribut (#234)', () => {
  const html = renderCropBackendCard(
    baseStatus({ imageMagick: { sipsActive: true, available: false, preferredBackend: null, supported: true } }),
    { installState: { status: 'running', error: null } }
  );
  assert.match(html, /data-install-state="running"/);
});

test('renderCropBackendCard ohne installState hat kein data-install-state-Attribut (#234)', () => {
  const html = renderCropBackendCard(
    baseStatus({ imageMagick: { sipsActive: true, available: false, preferredBackend: null, supported: true } })
  );
  assert.doesNotMatch(html, /data-install-state/);
});

test('renderMaintenancePage enthaelt Polling-JS fuer die ImageMagick-Installation (#234)', () => {
  const html = renderMaintenancePage(baseStatus());
  assert.match(html, /pollCropInstallStatus/);
  assert.match(html, /\/install-status\?token=/);
  assert.match(html, /resumeCropInstallPolling/);
});

test('renderMaintenancePage setzt data-install-state bei laufender Installation (#234)', () => {
  const html = renderMaintenancePage(
    baseStatus({ imageMagick: { sipsActive: true, available: false, preferredBackend: null, supported: true } }),
    { installState: { status: 'running', error: null } }
  );
  assert.match(html, /data-install-state="running"/);
});

test('renderMaintenancePage zeigt Fortschrittsband mit Balken, Zähler und Weiter-Button, wenn done < total (#230)', () => {
  const html = renderMaintenancePage(baseStatus(), {
    progress: { done: 3, total: 6 },
    nextCondition: { cardId: 'workspace', label: 'Arbeitsordner' },
  });
  assert.match(html, /data-maintenance-progress/, 'Band-Container vorhanden');
  assert.match(html, /Schritt 3 von 6 erledigt/, 'Zähler in Nutzersprache');
  assert.match(html, /maintenance-progress-bar/, 'Balken vorhanden');
  assert.match(html, /maintenance-progress-fill" style="width:50%"/, 'Füllstand passt zum Zähler');
  assert.match(html, /Weiter zu: Arbeitsordner/, 'Button benennt die nächste offene Bedingung');
  assert.match(html, /data-next-card="workspace"/, 'Button trägt die Ziel-Card');
  assert.match(html, /class="btn-primary maintenance-progress-next"/, 'Primärbutton');
});

test('renderMaintenancePage: Fortschrittsband steht im Hauptbereich vor dem Card-Grid (#230)', () => {
  const html = renderMaintenancePage(baseStatus(), {
    progress: { done: 1, total: 6 },
    nextCondition: { cardId: 'moodle', label: 'Moodle-URL' },
  });
  assert.ok(html.indexOf('data-maintenance-progress') > -1);
  assert.ok(
    html.indexOf('data-maintenance-progress') < html.indexOf('id="maintenance-cards"'),
    'Band oberhalb der Cards'
  );
});

test('renderMaintenancePage enthält kein Fortschrittsband bei done === total (#230)', () => {
  const html = renderMaintenancePage(baseStatus(), {
    progress: { done: 6, total: 6 },
    nextCondition: null,
  });
  assert.doesNotMatch(html, /data-maintenance-progress/);
  assert.doesNotMatch(html, /Weiter zu:/);
});

test('renderMaintenancePage ohne Fortschritts-Optionen bleibt band-frei (bestehende Aufrufe unverändert) (#230)', () => {
  assert.doesNotMatch(renderMaintenancePage(baseStatus()), /data-maintenance-progress/);
});

test('renderMaintenancePage: Weiter-Button öffnet die Ziel-Card und schließt vorher offene Cards (#230)', () => {
  const html = renderMaintenancePage(baseStatus(), {
    progress: { done: 2, total: 6 },
    nextCondition: { cardId: 'clients', label: 'KI-Clients' },
  });
  assert.match(html, /querySelector\(".maintenance-progress-next"\)/, 'Handler bindet an den Weiter-Button');
  assert.match(html, /closeAllCards\(\);\n\s*setCardOpen\(nextButton\.dataset\.nextCard, true, false\);/, 'erst schließen, dann Ziel-Card öffnen');
  // setCardOpen fokussiert beim Öffnen das erste bedienbare Feld (bestehend, #212).
  assert.match(html, /const firstField = detail\.querySelector\("input, button, select, textarea"\);\n\s*if \(firstField\) firstField\.focus\(\);/);
});

test('renderMaintenancePage zeigt Erfolgsbanner bei done === total mit wasIncomplete (#231)', () => {
  const html = renderMaintenancePage(baseStatus(), {
    progress: { done: 6, total: 6 },
    nextCondition: null,
    wasIncomplete: true,
  });
  assert.match(html, /data-maintenance-success/, 'Banner-Container vorhanden');
  assert.match(html, /Kurspilot ist eingerichtet — Sie sind startklar/, 'Erfolgstext in Nutzersprache');
  assert.doesNotMatch(html, /data-maintenance-progress/, 'Banner ersetzt das Fortschrittsband');
});

test('renderMaintenancePage: Erfolgsbanner steht im Hauptbereich vor dem Card-Grid (#231)', () => {
  const html = renderMaintenancePage(baseStatus(), {
    progress: { done: 6, total: 6 },
    nextCondition: null,
    wasIncomplete: true,
  });
  assert.ok(html.indexOf('data-maintenance-success') > -1);
  assert.ok(
    html.indexOf('data-maintenance-success') < html.indexOf('id="maintenance-cards"'),
    'Banner oberhalb der Cards'
  );
});

test('renderMaintenancePage: ohne wasIncomplete bleibt die Ansicht bei 6/6 banner-frei (#231)', () => {
  assert.doesNotMatch(
    renderMaintenancePage(baseStatus(), { progress: { done: 6, total: 6 }, nextCondition: null, wasIncomplete: false }),
    /data-maintenance-success/,
    'Flag explizit false'
  );
  assert.doesNotMatch(
    renderMaintenancePage(baseStatus(), { progress: { done: 6, total: 6 }, nextCondition: null }),
    /data-maintenance-success/,
    'Flag fehlt ganz (frische Session)'
  );
});

test('renderMaintenancePage: Erfolgsbanner erscheint erst am Maximum, darunter bleibt das Fortschrittsband (#231)', () => {
  const html = renderMaintenancePage(baseStatus(), {
    progress: { done: 5, total: 6 },
    nextCondition: { cardId: 'moodle', label: 'Moodle-Token' },
    wasIncomplete: true,
  });
  assert.match(html, /data-maintenance-progress/, 'Band unterhalb des Maximums');
  assert.doesNotMatch(html, /data-maintenance-success/, 'kein Banner vor 6/6');
});

test('renderMaintenancePage: Erfolgsbanner nutzt das Erfolgs-Token und folgt damit dem Dark Mode (#231)', () => {
  const html = renderMaintenancePage(baseStatus(), {
    progress: { done: 6, total: 6 },
    nextCondition: null,
    wasIncomplete: true,
  });
  assert.match(html, /\.maintenance-success-banner \{[^}]*var\(--kp-success\)/, 'Farbe aus semantischem Token');
});
