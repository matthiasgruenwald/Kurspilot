'use strict';

/**
 * app-provision.js
 *
 * Laedt den aktuellen main-Branch-Tarball von GitHub
 * (matthiasgruenwald/Kurspilot) und entpackt ihn idempotent nach
 * ~/.kurspilot/app (bzw. %LOCALAPPDATA%\Kurspilot\app) - Issue #123, siehe
 * docs/adr/0008-curl-bootstrap-vertrieb.md ("Ablageorte", "App
 * (Tarball-Inhalt)"). Kein npm-Registry-Kanal: der Tarball ist die einzige
 * Vertriebsquelle.
 *
 * Idempotenz: ein sha256-Hash des zuletzt entpackten Tarball-Inhalts wird in
 * einer Marker-Datei im Zielverzeichnis abgelegt. Ein erneuter Lauf mit
 * unveraendertem Tarball-Inhalt ueberspringt das Entpacken (kein Mtime-Churn
 * auf bestehenden Dateien, kein doppeltes Entpacken).
 *
 * DI-Pattern wie lib/node-provision.js: `fetch`/`extract`/`existsSync`/etc.
 * sind austauschbar, damit dieses Modul ohne echtes Netz/Dateisystem testbar
 * ist.
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const APP_TARBALL_URL = 'https://github.com/matthiasgruenwald/Kurspilot/archive/refs/heads/main.tar.gz';
const TARBALL_HASH_MARKER_FILENAME = '.tarball-sha256';

/**
 * Default-`fetch` fuer den App-Tarball (Issue #142): ohne explizite DI nutzt
 * provisionApp() das Node-globale `fetch` (>=18, siehe scripts/bootstrap-
 * app.js) statt einer undefinierten Funktion. Frueher fehlte dieser Default
 * komplett - ein Aufruf ohne `options.fetch` (z.B. ueber
 * lib/update-check.js's checkAppUpdate/applyAppUpdate aus dem
 * Browser-Konfigurationsprogramm) krachte mit "fetchFn is not a function",
 * was faelschlich als Offline-Fehler gemeldet wurde (die Fehlermeldung
 * enthaelt zufaellig "fetch").
 *
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function defaultFetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen: HTTP ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Default-`extract` fuer den App-Tarball: System-`tar` per execFileSync
 * (macOS/Linux/Windows-bsdtar, siehe scripts/bootstrap-app.js). GitHub-
 * Tarballs haben einen Top-Level-Ordner (`Kurspilot-main/`), daher
 * `--strip-components=1`.
 *
 * @param {Buffer} buffer
 * @param {string} destDir
 */
function defaultExtractTarGz(buffer, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['-xzf', '-', '-C', destDir, '--strip-components=1'], {
    input: buffer,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

/**
 * Ablageort der entpackten App (siehe ADR, "Ablageorte"):
 * macOS/Linux: ~/.kurspilot/app, Windows: %LOCALAPPDATA%\Kurspilot\app.
 * Dieser Pfad ist stabil, weil in Client-Configs eingetragene absolute Pfade
 * (`<node> <app>/scripts/start-mcp.js`) ein Update unbeschadet ueberstehen
 * muessen.
 */
function getKurspilotAppDir({ homeDir, platform, localAppData } = {}) {
  if (platform === 'win32') {
    const resolvedLocalAppData = localAppData || path.join(homeDir, 'AppData', 'Local');
    return path.join(resolvedLocalAppData, 'Kurspilot', 'app');
  }
  return path.join(homeDir, '.kurspilot', 'app');
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Laedt den GitHub-main-Tarball und entpackt ihn nach ~/.kurspilot/app (bzw.
 * Windows-Aequivalent). Idempotent: entpackt nur, wenn sich der
 * sha256-Hash des Tarball-Inhalts gegenueber dem letzten Lauf geaendert hat.
 *
 * @param {object} options
 * @param {string} options.homeDir
 * @param {string} options.platform z.B. 'darwin' | 'win32'
 * @param {string} [options.localAppData] nur Windows (Tests/DI)
 * @param {Function} options.fetch async (url) => Buffer - austauschbar (Tests/DI)
 * @param {Function} options.extract async (buffer, destDir) => void - austauschbar (Tests/DI)
 * @param {Function} [options.existsSync] austauschbar (Tests/DI)
 * @param {Function} [options.readFile] (filePath) => string - austauschbar (Tests/DI)
 * @param {Function} [options.writeFile] (filePath, content) => void - austauschbar (Tests/DI)
 * @param {Function} [options.mkdirSync] (dir, options) => void - austauschbar (Tests/DI)
 * @returns {Promise<{appDir: string, updated: boolean}>}
 */
async function provisionApp(options = {}) {
  const {
    homeDir = os.homedir(),
    platform = process.platform,
    localAppData,
    fetch: fetchFn = defaultFetchBuffer,
    extract: extractFn = defaultExtractTarGz,
    existsSync = fs.existsSync,
    readFile = (filePath) => fs.readFileSync(filePath, 'utf8'),
    writeFile = (filePath, content) => fs.writeFileSync(filePath, content, 'utf8'),
    mkdirSync = fs.mkdirSync,
  } = options;

  const appDir = getKurspilotAppDir({ homeDir, platform, localAppData });
  const hashMarkerPath = path.join(appDir, TARBALL_HASH_MARKER_FILENAME);

  const tarballBuffer = await fetchFn(APP_TARBALL_URL);
  const tarballHash = sha256Hex(tarballBuffer);

  const previousHash = existsSync(hashMarkerPath) ? readFile(hashMarkerPath) : null;
  if (previousHash === tarballHash) {
    return { appDir, updated: false };
  }

  mkdirSync(appDir, { recursive: true });
  await extractFn(tarballBuffer, appDir);
  writeFile(hashMarkerPath, tarballHash);

  return { appDir, updated: true };
}

module.exports = {
  provisionApp,
  getKurspilotAppDir,
  APP_TARBALL_URL,
  defaultFetchBuffer,
};
