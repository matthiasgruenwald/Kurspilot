'use strict';

/**
 * update-check.js
 *
 * "Nach Updates suchen" fuer das Browser-Konfigurationsprogramm
 * (Issue #128, siehe docs/adr/0008-curl-bootstrap-vertrieb.md, Abschnitt
 * "Updates und Skill-Konflikte"). Prueft App-Tarball (Skills + MCP-Server,
 * beide Teil des einen GitHub-Tarballs - siehe lib/app-provision.js) und
 * ImageMagick (lib/imagemagick-setup.js) auf ein neues Release und installiert
 * es auf Anfrage.
 *
 * Bewusst kein eigenes Release-/Versionsschema: "neues Release" fuer den
 * App-Tarball heisst exakt das, was lib/app-provision.js bereits fuer
 * Idempotenz nutzt - ein abweichender sha256-Hash des main-Branch-Tarballs
 * gegenueber dem zuletzt entpackten Marker (.tarball-sha256). Skills und
 * MCP-Server (moodle-mcp.js) sind Teil desselben Tarballs, deshalb genuegt
 * ein Tarball-Check fuer beide - kein zweites Schema erfinden.
 *
 * Fuer ImageMagick gibt es keine Versions-API der Bezugsquelle (siehe
 * lib/imagemagick-setup.js) - "Update verfuegbar" heisst hier "noch nicht
 * installiert", "installieren" delegiert unveraendert an installImageMagick.
 *
 * Offline-Verhalten (Acceptance Criterion): fetch-Fehler (Netzwerk) und ein
 * Timeout fuehren zu einer verstaendlichen deutschen Meldung statt zu einem
 * Crash oder einem haengenden Request.
 */

const os = require('node:os');
const path = require('node:path');

const {
  getKurspilotAppDir,
  provisionApp: defaultProvisionApp,
} = require('./app-provision');
const {
  isImageMagickInstalled,
  installImageMagick: defaultInstallImageMagick,
} = require('./imagemagick-setup');
const { installKurspilotSkillsForProvider: defaultInstallSkillsForProvider } = require('./skill-install');
const { installConfiguratorShortcut: defaultInstallConfiguratorShortcut } = require('./shortcut-install');
const { CLIENTS } = require('./client-registry');

// ponytail: GitHub API (Accept: sha) liefert 40-Byte-Commit-SHA statt 56-MB-Tarball
const COMMIT_CHECK_URL = 'https://api.github.com/repos/matthiasgruenwald/moodle-coursepilot/commits/main';
const GITHUB_ARCHIVE_URL = 'https://github.com/matthiasgruenwald/moodle-coursepilot/archive';
const COMMIT_MARKER_FILENAME = '.update-commit-sha';
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const OFFLINE_MESSAGE = 'Keine Verbindung: Update-Prüfung war nicht möglich. Bitte Internetverbindung prüfen und erneut versuchen.';

/**
 * Holt den aktuellen Commit-SHA des main-Branches (Accept: application/vnd.github.sha).
 * Wirft einen nicht-TypeError bei HTTP-Fehlern, damit isOfflineError() sie korrekt
 * als echte Fehler klassifiziert (nicht als Verbindungsproblem).
 */
async function defaultFetchCommitSha(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github.sha' } });
  if (!response.ok) {
    throw new Error(`Versionsprüfung fehlgeschlagen: HTTP ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function isOfflineError(error) {
  if (!error) {
    return false;
  }
  if (error.name === 'TypeError' && /fetch/i.test(error.message || '')) {
    return true;
  }
  if (error.name === 'AbortError' || error.code === 'KURSPILOT_TIMEOUT') {
    return true;
  }
  const networkCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT'];
  return networkCodes.some(code => (error.code === code) || (error.message || '').includes(code));
}



/**
 * Ruft fetchFn(url) mit Timeout auf, statt bei einer nie aufloesenden
 * Verbindung haengen zu bleiben (Acceptance Criterion: kein Haenger).
 */
function fetchWithTimeout(fetchFn, url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      const timeoutError = new Error('Zeitüberschreitung beim Abruf');
      timeoutError.code = 'KURSPILOT_TIMEOUT';
      reject(timeoutError);
    }, timeoutMs);

    Promise.resolve(fetchFn(url)).then(
      value => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Prueft auf ein neues Release via GitHub-Commit-SHA-API (40 Byte statt 56-MB-Tarball).
 *
 * Frueherer Ansatz lud den gesamten Tarball herunter (56 MB) und verglich dessen SHA256
 * mit einem lokalen Marker. Das fuehrte zu einem Timeout (10 s < ~80 s Downloadzeit)
 * der faelschlich als Verbindungsproblem eingestuft wurde (Issue #186).
 *
 * @param {object} [options]
 * @param {Function} [options.fetch] async (url) => Buffer - austauschbar (Tests/DI)
 * @param {Function} [options.existsSync] austauschbar (Tests/DI)
 * @param {Function} [options.readFile] (filePath) => string - austauschbar (Tests/DI)
 * @param {string} [options.homeDir]
 * @param {string} [options.platform]
 * @param {string} [options.localAppData]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{updateAvailable: boolean, offline: boolean, error: string|null}>}
 */
async function checkAppUpdate(options = {}) {
  const {
    fetch: fetchFn = defaultFetchCommitSha,
    existsSync = require('node:fs').existsSync,
    readFile = filePath => require('node:fs').readFileSync(filePath, 'utf8'),
    homeDir = os.homedir(),
    platform = process.platform,
    localAppData,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  } = options;

  const appDir = getKurspilotAppDir({ homeDir, platform, localAppData });
  const markerPath = path.join(appDir, COMMIT_MARKER_FILENAME);

  try {
    const shaBuffer = await fetchWithTimeout(fetchFn, COMMIT_CHECK_URL, timeoutMs);
    const remoteCommitSha = shaBuffer.toString('utf8').trim();
    const storedCommitSha = existsSync(markerPath) ? readFile(markerPath).trim() : null;

    return {
      updateAvailable: storedCommitSha !== remoteCommitSha,
      offline: false,
      error: null,
      versionCurrent: storedCommitSha ? storedCommitSha.slice(0, 8) : null,
      versionNew: remoteCommitSha.slice(0, 8),
    };
  } catch (error) {
    if (isOfflineError(error)) {
      return { updateAvailable: false, offline: true, error: OFFLINE_MESSAGE };
    }
    return { updateAvailable: false, offline: false, error: `Update-Prüfung fehlgeschlagen: ${error.message}` };
  }
}

/**
 * Prueft ImageMagick auf ein "Update" (= noch nicht installiert, siehe
 * Datei-Kommentar). Rein lokal, kein Netzzugriff noetig fuer die Pruefung
 * selbst.
 *
 * @param {object} [options]
 * @param {Function} [options.isImageMagickAvailable] austauschbar (Tests/DI)
 * @param {string} [options.platform]
 * @returns {{updateAvailable: boolean, offline: boolean, supported: boolean, error: string|null}}
 */
function checkImageMagickUpdate(options = {}) {
  const {
    isImageMagickAvailable: isImageMagickAvailableFn = isImageMagickInstalled,
    platform = process.platform,
  } = options;

  const supported = platform === 'win32';
  const available = supported && isImageMagickAvailableFn();

  return {
    updateAvailable: supported && !available,
    offline: false,
    supported,
    error: null,
  };
}

/**
 * Installiert das App-Update (Skills + MCP-Server) ueber das bestehende
 * lib/app-provision.js - keine eigene Download-/Entpack-Logik. Nach dem
 * Tarball-Update werden die Kurspilot-Skills fuer beide erkannten Anbieter
 * (Codex/Claude) aus dem frisch entpackten appDir neu installiert - ueber
 * das bestehende lib/skill-install.js mit seiner sha256-Manifest-basierten
 * Konflikterkennung (keine eigene 3-Wege-Merge-Logik, siehe Datei-Kommentar
 * und ADR 0008).
 *
 * @param {object} [options]
 * @param {Function} [options.provisionApp] austauschbar (Tests/DI)
 * @param {Function} options.fetch durchgereicht an provisionApp
 * @param {Function} options.extract durchgereicht an provisionApp
 * @param {Function} [options.installSkillsForProvider] austauschbar (Tests/DI)
 * @param {Function} [options.installConfiguratorShortcut] austauschbar (Tests/DI)
 * @param {string[]} [options.clients] welche Anbieter installiert werden sollen (Default: beide)
 * @param {string} [options.homeDir]
 * @returns {Promise<{installed: boolean, offline: boolean, error: string|null, skillInstallAborted: boolean, skillInstallWarnings: string[], skillInstallConflicts: string[], skillInstallConflictPrompts: {skillName: string, prompt: string}[]}>}
 */
async function applyAppUpdate(options = {}) {
  const {
    provisionApp: provisionAppFn = defaultProvisionApp,
    fetchCheck: fetchCheckFn = defaultFetchCommitSha,
    writeFile: writeFileFn = (filePath, data) => require('node:fs').writeFileSync(filePath, data, 'utf8'),
    installSkillsForProvider: installSkillsForProviderFn = defaultInstallSkillsForProvider,
    installConfiguratorShortcut: installConfiguratorShortcutFn = defaultInstallConfiguratorShortcut,
    clients = ['codex', 'claude', 'opencode'],
    homeDir = os.homedir(),
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    ...provisionOptions
  } = options;

  let provisionResult;
  let remoteCommitSha;
  try {
    const shaBuffer = await fetchWithTimeout(fetchCheckFn, COMMIT_CHECK_URL, timeoutMs);
    remoteCommitSha = shaBuffer.toString('utf8').trim();
    provisionResult = await provisionAppFn({
      ...provisionOptions,
      tarballUrl: `${GITHUB_ARCHIVE_URL}/${remoteCommitSha}.tar.gz`,
    });
  } catch (error) {
    if (isOfflineError(error)) {
      return { installed: false, offline: true, error: OFFLINE_MESSAGE };
    }
    return { installed: false, offline: false, error: `Update-Installation fehlgeschlagen: ${error.message}` };
  }

  const appDir = provisionResult.appDir;

  // Commit-SHA-Marker schreiben, damit checkAppUpdate nach dem Install kein Update mehr meldet
  try {
    writeFileFn(path.join(appDir, COMMIT_MARKER_FILENAME), remoteCommitSha);
  } catch (_) {
    // ponytail: nicht kritisch – naechster Check zeigt erneut "Update verfuegbar"
  }

  const skillInstallWarnings = [];
  const skillInstallConflicts = [];
  const skillInstallConflictPrompts = [];
  let skillInstallAborted = false;

  for (const client of clients) {
    const clientDef = CLIENTS[client];
    if (!clientDef) continue;
    const providerRoot = path.join(appDir, clientDef.providerRoot);
    const targetRoot = clientDef.skillTargetRoot(homeDir);
    const installResult = installSkillsForProviderFn(appDir, providerRoot, targetRoot);
    if (installResult && installResult.aborted) {
      skillInstallAborted = true;
      skillInstallWarnings.push(...(installResult.warnings || []));
      skillInstallConflicts.push(...(installResult.conflicts || []));
      skillInstallConflictPrompts.push(...(installResult.conflictPrompts || []));
    }
  }

  let configuratorShortcutPath = null;
  let configuratorShortcutWarning = null;
  try {
    configuratorShortcutPath = installConfiguratorShortcutFn({
      homeDir,
      nodePath: process.execPath,
      appPath: appDir,
      writeFile: (filePath, content) => require('node:fs').writeFileSync(filePath, content),
    }).shortcutPath;
  } catch (error) {
    configuratorShortcutWarning = error.message;
  }

  return {
    installed: true,
    offline: false,
    error: null,
    appDir,
    configuratorShortcutPath,
    configuratorShortcutWarning,
    skillInstallAborted,
    skillInstallWarnings,
    skillInstallConflicts,
    skillInstallConflictPrompts,
  };
}

/**
 * Installiert das ImageMagick-Update ueber das bestehende
 * lib/imagemagick-setup.js - keine eigene Installationslogik.
 *
 * @param {object} [options]
 * @param {Function} [options.installImageMagick] austauschbar (Tests/DI)
 * @returns {Promise<{installed: boolean, error: string|null}>}
 */
async function applyImageMagickUpdate(options = {}) {
  const { installImageMagick: installImageMagickFn = defaultInstallImageMagick, ...installOptions } = options;

  try {
    const result = await installImageMagickFn(installOptions);
    return { installed: Boolean(result.installed), error: result.error || null };
  } catch (error) {
    if (isOfflineError(error)) {
      return { installed: false, error: OFFLINE_MESSAGE };
    }
    return { installed: false, error: `ImageMagick-Installation fehlgeschlagen: ${error.message}` };
  }
}

module.exports = {
  checkAppUpdate,
  checkImageMagickUpdate,
  applyAppUpdate,
  applyImageMagickUpdate,
  isOfflineError,
  OFFLINE_MESSAGE,
  DEFAULT_FETCH_TIMEOUT_MS,
  COMMIT_CHECK_URL,
  COMMIT_MARKER_FILENAME,
};
