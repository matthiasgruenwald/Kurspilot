/**
 * imagemagick-setup.js
 *
 * Erkennung und Installation von ImageMagick fuer das Kurspilot-
 * Konfigurationsprogramm/Wartungsmenue (Issue #124, siehe
 * docs/adr/0008-curl-bootstrap-vertrieb.md, "Ablageorte"). Prueft bewusst
 * `magick -version` (nicht `convert`): Windows bringt unter System32 ein
 * eigenes `convert.exe` (FAT->NTFS-Konvertierung) mit, das den Namen mit dem
 * aelteren ImageMagick-Kommando teilt. `magick` ist der seit ImageMagick 7
 * kanonische, kollisionsfreie Befehl und der vom Lehrkraft-Smoke-Test
 * ("magick -version") erwartete Pfad.
 *
 * Getrennt von lib/image-crop.js (Laufzeit-Crop ueber `convert`,
 * siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md): dieses Modul
 * betrifft nur die Installationspruefung/-anstossung im Setup-Flow/
 * Wartungsmenue. ImageMagick bleibt optional und wird NICHT im Erst-Setup
 * ausgeloest (siehe lib/setup-flow.js, Bereich "imagemagick-install" ist
 * dort bewusst opt-in, nicht vorausgewaehlt; dieses Modul aendert daran
 * nichts).
 *
 * `installImageMagickWindows` bleibt unveraendert (Windows-only, von
 * lib/setup-flow.js als Default-DI ohne Argumente genutzt).
 * `installImageMagick` ist die neue, arch-erkennende, OS-uebergreifende
 * Erweiterung (Datentabelle wie lib/node-provision.js, lib/app-provision.js):
 * ein neues Ziel ist ein zusaetzlicher Tabelleneintrag, kein Umbau.
 */

'use strict';

const path = require('node:path');
const os = require('node:os');
const { execFileSync: defaultExecFileSync } = require('node:child_process');

const WINGET_PACKAGE_ID = 'ImageMagick.ImageMagick';

/**
 * OS+Arch -> Bezugsquelle als Datentabelle (nicht verzweigte if/else-Logik).
 * - Windows: winget (architekturunabhaengiger Systempaketmanager) als
 *   Bezugsquelle fuer x64; ein zusaetzlicher portabler-Zip-Eintrag fuer
 *   arm64 (Datenquelle: imagemagick.org/archive/binaries/, architektur-
 *   spezifische Q16-Zips).
 * - macOS: keine offizielle, stabile self-contained Build-Quelle direkt von
 *   ImageMagick (nur Drittanbieter/Homebrew) - bekanntes Risiko, siehe ADR
 *   0008 ("Bleibt zu loesen bei Umsetzung"). Bewusst `method: 'unsupported'`
 *   statt einer wackeligen Drittanbieter-URL: degradiert sauber mit
 *   verstaendlicher Fehlermeldung statt zu crashen oder eine instabile
 *   Quelle einzubinden.
 * - Linux: AppImage-Eintrag vorbereitet, aber nicht aktiv getestet (siehe
 *   ADR 0008, Linux-Architekturentscheidung zurueckgestellt).
 */
const IMAGEMAGICK_DOWNLOAD_TABLE = {
  'win32-x64': {
    method: 'winget',
  },
  'win32-arm64': {
    method: 'zip',
    url: 'https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-39-portable-Q16-arm64.zip',
    archiveType: 'zip',
    binaryRelativePath: ['magick.exe'],
  },
  'darwin-arm64': {
    method: 'unsupported',
    reason:
      'Fuer macOS gibt es keine offizielle, stabile ImageMagick-Bezugsquelle fuer einen automatischen ' +
      'Download (nur Drittanbieter oder Homebrew). Bitte ImageMagick manuell installieren, z.B. mit ' +
      'Homebrew ("brew install imagemagick") oder ueber https://imagemagick.org/script/download.php',
  },
  'darwin-x64': {
    method: 'unsupported',
    reason:
      'Fuer macOS gibt es keine offizielle, stabile ImageMagick-Bezugsquelle fuer einen automatischen ' +
      'Download (nur Drittanbieter oder Homebrew). Bitte ImageMagick manuell installieren, z.B. mit ' +
      'Homebrew ("brew install imagemagick") oder ueber https://imagemagick.org/script/download.php',
  },
  'linux-x64': {
    // Vorbereitet, nicht aktiv getestet (siehe ADR 0008).
    method: 'appimage',
    url: 'https://imagemagick.org/archive/binaries/magick',
    archiveType: 'appimage',
    binaryRelativePath: ['magick'],
  },
};

/**
 * Prueft per `magick -version`, ob ImageMagick auf diesem System installiert ist.
 *
 * @param {object} [options]
 * @param {Function} [options.execFileSync] austauschbar fuer Tests
 * @returns {boolean}
 */
function isImageMagickInstalled(options = {}) {
  const run = options.execFileSync || defaultExecFileSync;
  try {
    run('magick', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Installiert ImageMagick auf Windows per winget (nutzerweit, kein Admin
 * noetig fuer die winget-Installation selbst). Auf anderen Plattformen
 * noch nicht automatisiert. Unveraendertes Verhalten (von lib/setup-flow.js
 * als Default-DI ohne Argumente genutzt) - siehe installImageMagick fuer den
 * neuen, arch-erkennenden, OS-uebergreifenden Pfad.
 *
 * @param {object} [options]
 * @param {string} [options.platform] austauschbar fuer Tests
 * @param {Function} [options.execFileSync] austauschbar fuer Tests
 * @returns {{installed: boolean, error: string|null}}
 */
function installImageMagickWindows(options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32') {
    return {
      installed: false,
      error: 'ImageMagick-Installation ist aktuell nur unter Windows automatisiert.',
    };
  }

  const run = options.execFileSync || defaultExecFileSync;
  try {
    run('winget', [
      'install',
      '--id', WINGET_PACKAGE_ID,
      '-e',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--silent',
    ], { stdio: 'ignore' });
    return { installed: true, error: null };
  } catch (err) {
    return {
      installed: false,
      error: `ImageMagick-Installation ueber winget fehlgeschlagen: ${err.message}`,
    };
  }
}

/**
 * Ablageort des Kurspilot-eigenen ImageMagick (siehe ADR 0008, "Ablageorte"):
 * macOS/Linux: ~/.kurspilot/imagemagick, Windows: %LOCALAPPDATA%\Kurspilot\imagemagick.
 * Nur fuer den Zip/AppImage-Pfad relevant - winget installiert systemweit/
 * nutzerweit ueber den Windows-Paketmanager, nicht in dieses Verzeichnis.
 */
function getKurspilotImageMagickDir({ homeDir, platform, localAppData } = {}) {
  if (platform === 'win32') {
    const resolvedLocalAppData = localAppData || path.join(homeDir, 'AppData', 'Local');
    return path.join(resolvedLocalAppData, 'Kurspilot', 'imagemagick');
  }
  return path.join(homeDir, '.kurspilot', 'imagemagick');
}

function platformArchKey(platform, arch) {
  return `${platform}-${arch}`;
}

/**
 * Installiert ImageMagick architektur-passend, OS-uebergreifend (Issue #124).
 * Reihenfolge:
 *   1. bereits installiert (`magick -version`)? -> nichts tun, installed: true.
 *   2. sonst: OS+Arch in IMAGEMAGICK_DOWNLOAD_TABLE nachschlagen.
 *      - method 'winget' (Windows x64): wie installImageMagickWindows.
 *      - method 'zip'/'appimage' (Windows arm64, Linux x64 vorbereitet):
 *        Datentabelle-URL laden und nach getKurspilotImageMagickDir entpacken.
 *      - method 'unsupported' (macOS, bekanntes Risiko laut ADR 0008):
 *        kein Crash, sondern verstaendliche Fehlermeldung (installed: false).
 *      - kein Tabellenintrag (z.B. unbekannte Plattform): ebenfalls
 *        installed: false mit Fehlermeldung statt Exception.
 *
 * @param {object} [options]
 * @param {string} [options.platform] austauschbar fuer Tests
 * @param {string} [options.arch] austauschbar fuer Tests
 * @param {string} [options.homeDir]
 * @param {string} [options.localAppData] nur Windows (Tests/DI)
 * @param {Function} [options.execFileSync] austauschbar fuer Tests
 * @param {Function} [options.fetch] async (url) => Buffer - austauschbar (Tests/DI)
 * @param {Function} [options.extract] async (buffer, destDir, archiveType) => void
 * @returns {{installed: boolean, error: string|null}|Promise<{installed: boolean, error: string|null}>}
 */
function installImageMagick(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const homeDir = options.homeDir || os.homedir();

  if (isImageMagickInstalled(options)) {
    return { installed: true, error: null };
  }

  const targetKey = platformArchKey(platform, arch);
  const target = IMAGEMAGICK_DOWNLOAD_TABLE[targetKey];

  if (!target) {
    return {
      installed: false,
      error: `ImageMagick-Installation wird fuer ${targetKey} nicht unterstuetzt.`,
    };
  }

  if (target.method === 'winget') {
    return installImageMagickWindows({ ...options, platform });
  }

  if (target.method === 'unsupported') {
    return { installed: false, error: target.reason };
  }

  // method 'zip' / 'appimage': Datentabelle-URL laden, entpacken (async).
  return installImageMagickFromArchive(options, target, { homeDir, platform });
}

async function installImageMagickFromArchive(options, target, { homeDir, platform }) {
  const fetchFn = options.fetch;
  const extractFn = options.extract;
  const localAppData = options.localAppData;

  if (typeof fetchFn !== 'function' || typeof extractFn !== 'function') {
    return {
      installed: false,
      error: 'ImageMagick-Installation benoetigt fetch/extract (nicht uebergeben).',
    };
  }

  const destDir = getKurspilotImageMagickDir({ homeDir, platform, localAppData });

  try {
    const archiveBuffer = await fetchFn(target.url);
    await extractFn(archiveBuffer, destDir, target.archiveType);
    return { installed: true, error: null };
  } catch (err) {
    return {
      installed: false,
      error: `ImageMagick-Installation fehlgeschlagen: ${err.message}`,
    };
  }
}

module.exports = {
  isImageMagickInstalled,
  installImageMagickWindows,
  installImageMagick,
  getKurspilotImageMagickDir,
  IMAGEMAGICK_DOWNLOAD_TABLE,
  WINGET_PACKAGE_ID,
};
