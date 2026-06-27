'use strict';

/**
 * Smoke-Test fuer die deutsche, fachjargon-freie Narration des
 * curl/PowerShell-Bootstraps (Issue #126, siehe
 * docs/adr/0008-curl-bootstrap-vertrieb.md "Transparenz als Anforderung").
 *
 * Bewusst NUR Substring-/Keyword-Checks (keine exakten Wortlaut-Vergleiche) -
 * der Wortlaut der Ansagen darf sich aendern, ohne dass dieser Test bricht.
 * Geprueft wird, DASS bestimmte Kernbegriffe an den richtigen Stellen
 * vorkommen, nicht WIE genau der Satz formuliert ist.
 *
 * Die funktionale Bootstrap-Logik selbst (Node-Beschaffung, App-Tarball,
 * Idempotenz) ist bereits in test/setup-bootstrap-scripts.test.js und
 * test/bootstrap-app.test.js abgedeckt (#125) - hier geht es ausschliesslich
 * um die Vorab-Ansagen/Endsignal/SmartScreen-Hinweis/Absender-Nennung.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const SETUP_SH = fs.readFileSync(path.join(REPO_ROOT, 'setup.sh'), 'utf8');
const SETUP_PS1 = fs.readFileSync(path.join(REPO_ROOT, 'setup.ps1'), 'utf8');
const BOOTSTRAP_APP = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'bootstrap-app.js'), 'utf8');
const SETUP_KURSPILOT = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'setup-kurspilot.js'), 'utf8');

const FESTER_ABSENDER = 'github.com/matthiasgruenwald/Kurspilot';

test('setup.sh: sagt Node.js-Pruefung vorab an', () => {
  assert.match(SETUP_SH, /Pr(ü|ue)fe.*Node\.js/i);
});

test('setup.sh: sagt automatischen Node.js-Download verstaendlich an', () => {
  assert.match(SETUP_SH, /Node\.js.*(fehlt|installiere)/i);
});

test('setup.sh: nennt den festen Absender bei der Node.js-Download-Ansage', () => {
  // Node kommt von nodejs.org, nicht von Kurspilot - hier ist der feste
  // Absender bei der App-Download-Ansage relevant (naechster Test), Node
  // selbst hat eine andere Quelle. Test bewusst auf App-Download verschoben.
  assert.match(SETUP_SH, new RegExp(FESTER_ABSENDER.replace(/[./]/g, '\\$&')));
});

test('setup.sh: sagt Kurspilot-Erstinstallation an', () => {
  assert.match(SETUP_SH, /Richte.*ein|wird.*geladen|eingerichtet/i);
});

test('setup.ps1: sagt Node.js-Pruefung vorab an', () => {
  assert.match(SETUP_PS1, /Pr(ü|ue)fe.*Node\.js/i);
});

test('setup.ps1: sagt automatischen Node.js-Download verstaendlich an', () => {
  assert.match(SETUP_PS1, /Node\.js.*(fehlt|installiere)/i);
});

test('setup.ps1: enthaelt vorab angekuendigten SmartScreen-Hinweis vor dem Download', () => {
  assert.match(SETUP_PS1, /SmartScreen/);
  assert.match(SETUP_PS1, /Mehr Informationen/i);
  assert.match(SETUP_PS1, /Trotzdem ausf(ü|ue)hren/i);

  // SmartScreen-Hinweis muss VOR dem ersten Download (Node) stehen, nicht
  // erst danach - sonst kommt die Warnung ueberraschend.
  const smartScreenIndex = SETUP_PS1.search(/SmartScreen/);
  const firstDownloadIndex = SETUP_PS1.search(/Invoke-WebRequest/);
  assert.ok(smartScreenIndex >= 0 && firstDownloadIndex >= 0);
  assert.ok(smartScreenIndex < firstDownloadIndex, 'SmartScreen-Hinweis muss vor dem ersten Download stehen');
});

test('setup.ps1: nennt den festen Absender bei Download-Ansagen', () => {
  assert.match(SETUP_PS1, new RegExp(FESTER_ABSENDER.replace(/[./]/g, '\\$&')));
});

test('bootstrap-app.js: sagt Einrichtung des Tools verstaendlich an', () => {
  assert.match(BOOTSTRAP_APP, /Richte.*ein|Tool/i);
});

test('setup-kurspilot.js: enthaelt klares Endsignal mit Verweis auf Konfigurations-Seite und Claude/Codex-Eintrag', () => {
  assert.match(SETUP_KURSPILOT, /Fertig/);
  assert.match(SETUP_KURSPILOT, /Claude|Codex/);
  assert.match(SETUP_KURSPILOT, /neuen?\s+Eintrag|neue.*Eintrag/i);
});
