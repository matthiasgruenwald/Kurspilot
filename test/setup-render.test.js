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
