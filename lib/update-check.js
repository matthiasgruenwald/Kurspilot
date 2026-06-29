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
const crypto = require('node:crypto');

const {
  APP_TARBALL_URL,
  getKurspilotAppDir,
  provisionApp: defaultProvisionApp,
  defaultFetchBuffer,
} = require('./app-provision');
const {
  isImageMagickInstalled,
  installImageMagick: defaultInstallImageMagick,
} = require('./imagemagick-setup');
const { installKurspilotSkillsForProvider: defaultInstallSkillsForProvider } = require('./skill-install');

/**
 * Anbieter-Quellordner innerhalb des entpackten App-Tarballs (siehe
 * lib/setup-flow.js CLIENT_PROVIDER_ROOTS - dieselbe Struktur, aber bezogen
 * auf appDir statt auf das Repo-Checkout, weil die Lehrkraft beim
 * curl-Bootstrap-Vertrieb (ADR 0008) kein Repo-Checkout hat).
 */
const CLIENT_PROVIDER_ROOTS = {
  codex: '.agents/skills',
  claude: '.claude/skills',
};

const TARBALL_HASH_MARKER_FILENAME = '.tarball-sha256';
const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const OFFLINE_MESSAGE = 'Keine Verbindung: Update-Prüfung war nicht möglich. Bitte Internetverbindung prüfen und erneut versuchen.';

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

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
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
 * Prueft den App-Tarball (Skills + MCP-Server) auf ein neues Release.
 *
 * @param {object} [options]
 * @param {Function} options.fetch async (url) => Buffer - austauschbar (Tests/DI)
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
    fetch: fetchFn = defaultFetchBuffer,
    existsSync = require('node:fs').existsSync,
    readFile = filePath => require('node:fs').readFileSync(filePath, 'utf8'),
    homeDir = os.homedir(),
    platform = process.platform,
    localAppData,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  } = options;

  const appDir = getKurspilotAppDir({ homeDir, platform, localAppData });
  const hashMarkerPath = path.join(appDir, TARBALL_HASH_MARKER_FILENAME);

  try {
    const tarballBuffer = await fetchWithTimeout(fetchFn, APP_TARBALL_URL, timeoutMs);
    const tarballHash = sha256Hex(tarballBuffer);
    const previousHash = existsSync(hashMarkerPath) ? readFile(hashMarkerPath) : null;

    return {
      updateAvailable: previousHash !== tarballHash,
      offline: false,
      error: null,
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
 * @param {string[]} [options.clients] welche Anbieter installiert werden sollen (Default: beide)
 * @param {string} [options.homeDir]
 * @returns {Promise<{installed: boolean, offline: boolean, error: string|null, skillInstallAborted: boolean, skillInstallWarnings: string[], skillInstallConflicts: string[], skillInstallConflictPrompts: {skillName: string, prompt: string}[]}>}
 */
async function applyAppUpdate(options = {}) {
  const {
    provisionApp: provisionAppFn = defaultProvisionApp,
    installSkillsForProvider: installSkillsForProviderFn = defaultInstallSkillsForProvider,
    clients = ['codex', 'claude'],
    homeDir = os.homedir(),
    ...provisionOptions
  } = options;

  let provisionResult;
  try {
    provisionResult = await provisionAppFn(provisionOptions);
  } catch (error) {
    if (isOfflineError(error)) {
      return { installed: false, offline: true, error: OFFLINE_MESSAGE };
    }
    return { installed: false, offline: false, error: `Update-Installation fehlgeschlagen: ${error.message}` };
  }

  const appDir = provisionResult.appDir;
  const skillInstallWarnings = [];
  const skillInstallConflicts = [];
  const skillInstallConflictPrompts = [];
  let skillInstallAborted = false;

  for (const client of clients) {
    const providerRoot = path.join(appDir, CLIENT_PROVIDER_ROOTS[client]);
    const targetRoot = path.join(homeDir, client === 'codex' ? '.codex' : '.claude', 'skills');
    const installResult = installSkillsForProviderFn(appDir, providerRoot, targetRoot);
    if (installResult && installResult.aborted) {
      skillInstallAborted = true;
      skillInstallWarnings.push(...(installResult.warnings || []));
      skillInstallConflicts.push(...(installResult.conflicts || []));
      skillInstallConflictPrompts.push(...(installResult.conflictPrompts || []));
    }
  }

  return {
    installed: true,
    offline: false,
    error: null,
    appDir,
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
};
