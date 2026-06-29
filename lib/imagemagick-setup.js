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
 * `installImageMagickWindows` ist Windows-only - seit Issue #133 portabler
 * Zip-Download statt winget (siehe Kommentar bei WINDOWS_PORTABLE_ZIP_URL
 * unten, UAC-Grund). `installImageMagick` ist die arch-erkennende,
 * OS-uebergreifende Erweiterung (Datentabelle wie lib/node-provision.js,
 * lib/app-provision.js): ein neues Ziel ist ein zusaetzlicher
 * Tabelleneintrag, kein Umbau. Seit Issue #137 ruft lib/setup-flow.js als
 * Default-DI `installImageMagick` auf (nicht mehr direkt
 * `installImageMagickWindows`) - die Bruecke ist geschlossen, Windows laeuft
 * weiterhin ueber denselben Tabelleneintrag ('windows-portable').
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync: defaultExecFileSync } = require('node:child_process');

/**
 * Portable Q16-x64-Distribution von ImageMagick (Issue #133, URL-Korrektur
 * Issue #129).
 *
 * Vorher rief installImageMagickWindows `winget install ImageMagick.ImageMagick`
 * auf - das fordert UAC an, *unabhaengig* von einem `--scope user`-Flag. Grund
 * (per WebSearch recherchiert, da kein Windows-Livetest moeglich ist, siehe
 * unten "Annahme"): das offizielle winget-Manifest
 * (microsoft/winget-pkgs, manifests/i/ImageMagick/ImageMagick) deklariert
 * InstallerType "inno" mit Scope "machine" fuer alle drei Architekturen
 * (x86/x64/arm64) - der Inno-Setup-Installer selbst unterstuetzt keine
 * User-Scope-Installation, winget kann das nicht erzwingen. `--scope user`
 * waere damit wirkungslos oder ein zusaetzlicher Fehlerfall.
 *
 * Loesung: direkt die portable, selbstenthaltene Distribution laden und
 * nach getKurspilotImageMagickDir entpacken - keine Installation, kein
 * Installer, keine UAC-Anfrage moeglich.
 *
 * Issue #129 (Live-Befund Windows): die alte URL unter
 * imagemagick.org/archive/binaries/ liefert komplett 404 (GitHub-Pages-
 * Fehlerseite) - der Vertriebsweg ist auf GitHub Releases umgezogen, und die
 * portablen Pakete liegen dort nur noch als .7z statt .zip vor (siehe
 * https://github.com/ImageMagick/ImageMagick/releases). Deshalb: Download von
 * GitHub Releases, Entpacken per `tar` (in Windows 10/11 als bsdtar
 * vorinstalliert, kann .7z lesen) statt `Expand-Archive` (kann nur .zip).
 * Die Versionsnummer ist Teil des Dateinamens - bei jedem ImageMagick-Release
 * muss diese Konstante erneut aktualisiert werden, eine generische
 * "latest"-URL gibt es dafuer nicht.
 *
 * ANNAHME (nicht live unter Windows verifiziert, macOS-Entwicklungsmaschine):
 * PowerShell-Download via Invoke-WebRequest + tar-Extraktion in
 * %LOCALAPPDATA% benoetigt unter Standard-Policies kein Admin-Recht. Falls
 * doch (z.B. restriktive Unternehmens-GPO), bitte Issue mit Live-Befund neu
 * oeffnen.
 */
const WINDOWS_PORTABLE_ZIP_URL =
  'https://github.com/ImageMagick/ImageMagick/releases/download/7.1.2-26/' +
  'ImageMagick-7.1.2-26-portable-Q16-x64.7z';

/**
 * OS+Arch -> Bezugsquelle als Datentabelle (nicht verzweigte if/else-Logik).
 * - Windows: portabler Zip-Download direkt von imagemagick.org fuer x64 UND
 *   arm64 (Issue #133: winget wuerde fuer x64 UAC anfordern, siehe Kommentar
 *   bei WINDOWS_PORTABLE_ZIP_URL oben - daher kein winget-Eintrag mehr).
 * - macOS: Homebrew ist die offizielle Empfehlung von ImageMagick selbst
 *   (https://imagemagick.org/script/download.php#macosx) - kein
 *   Drittanbieter-Risiko mehr wie urspruenglich in ADR 0008 angenommen.
 *   Issue #137: `method: 'brew'` installiert bei Bedarf zuerst Homebrew
 *   selbst (offizielles Install-Skript, siehe installHomebrew) und danach
 *   `brew install imagemagick`.
 * - Linux: AppImage-Eintrag vorbereitet, aber nicht aktiv getestet (siehe
 *   ADR 0008, Linux-Architekturentscheidung zurueckgestellt).
 */
const IMAGEMAGICK_DOWNLOAD_TABLE = {
  'win32-x64': {
    method: 'windows-portable',
  },
  'win32-arm64': {
    method: 'zip',
    url: 'https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-39-portable-Q16-arm64.zip',
    archiveType: 'zip',
    binaryRelativePath: ['magick.exe'],
  },
  'darwin-arm64': {
    method: 'brew',
  },
  'darwin-x64': {
    method: 'brew',
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
 * Offizielles Homebrew-Installationsskript (https://brew.sh, "Install
 * Homebrew" - per `curl | bash` ausgefuehrt). Issue #137: macOS hat ohne
 * Homebrew keinen `brew`-Befehl, dieses Skript installiert ihn non-interaktiv
 * unter /opt/homebrew (Apple Silicon) bzw. /usr/local (Intel).
 */
const HOMEBREW_INSTALL_SCRIPT_URL =
  'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh';

/**
 * Bekannte Homebrew-Installationsorte (Issue #140): GUI-gestartete Prozesse
 * (z.B. das Konfigurationsprogramm ueber den Finder/eine Verknuepfung
 * gestartet) erben oft ein minimales PATH ohne /opt/homebrew/bin bzw.
 * /usr/local/bin - `brew --version` schlaegt dann faelschlich fehl, obwohl
 * Homebrew installiert ist. Das fuehrte zu einem unnoetigen (und an
 * fehlenden Schreibrechten scheiternden) Reinstallationsversuch.
 */
const HOMEBREW_BIN_CANDIDATES = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'];

/**
 * Loest den ausfuehrbaren brew-Befehl auf: zuerst per PATH (`brew --version`),
 * sonst ueber HOMEBREW_BIN_CANDIDATES (Issue #140).
 *
 * @param {object} [options]
 * @param {Function} [options.execFileSync] austauschbar fuer Tests
 * @param {Function} [options.existsSync] austauschbar fuer Tests
 * @returns {string|null} 'brew', ein absoluter Pfad, oder null wenn nicht gefunden
 */
function resolveBrewBinary(options = {}) {
  const run = options.execFileSync || defaultExecFileSync;
  const existsSync = options.existsSync || fs.existsSync;
  try {
    run('brew', ['--version'], { stdio: 'ignore' });
    return 'brew';
  } catch {
    return HOMEBREW_BIN_CANDIDATES.find(candidate => existsSync(candidate)) || null;
  }
}

/**
 * Prueft, ob Homebrew auf diesem System installiert ist (PATH oder bekannter
 * absoluter Pfad, siehe resolveBrewBinary).
 *
 * @param {object} [options]
 * @param {Function} [options.execFileSync] austauschbar fuer Tests
 * @param {Function} [options.existsSync] austauschbar fuer Tests
 * @returns {boolean}
 */
function isHomebrewInstalled(options = {}) {
  return resolveBrewBinary(options) !== null;
}

/**
 * Installiert Homebrew per offiziellem Install-Skript (`curl ... | bash`,
 * non-interaktiv via NONINTERACTIVE=1, siehe https://brew.sh). Wirft bei
 * Fehlern statt installImageMagickMacOS() leise scheitern zu lassen - der
 * Aufrufer faengt das ab und formt die Lehrkraft-Fehlermeldung.
 *
 * @param {object} [options]
 * @param {Function} [options.execFileSync] austauschbar fuer Tests
 */
function installHomebrew(options = {}) {
  const run = options.execFileSync || defaultExecFileSync;
  const installCommand =
    `NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL ${HOMEBREW_INSTALL_SCRIPT_URL})"`;
  run('/bin/bash', ['-c', installCommand], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, NONINTERACTIVE: '1' },
  });
}

/**
 * Installiert ImageMagick auf macOS per Homebrew (Issue #137): installiert
 * bei Bedarf zuerst Homebrew selbst (installHomebrew), danach
 * `brew install imagemagick`. Kein stiller Fallback bei Fehlern - jeder
 * Fehlschlag (Homebrew-Installation oder "brew install") gibt eine
 * verstaendliche Fehlermeldung zurueck statt zu crashen.
 *
 * @param {object} [options]
 * @param {Function} [options.execFileSync] austauschbar fuer Tests
 * @returns {{installed: boolean, error: string|null}}
 */
function installImageMagickMacOS(options = {}) {
  const run = options.execFileSync || defaultExecFileSync;
  let brewBinary = resolveBrewBinary(options);

  if (!brewBinary) {
    try {
      installHomebrew(options);
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : '';
      return {
        installed: false,
        error: `Homebrew-Installation fehlgeschlagen: ${stderr || err.message}`,
      };
    }
    brewBinary = resolveBrewBinary(options) || 'brew';
  }

  try {
    run(brewBinary, ['install', 'imagemagick'], { stdio: ['ignore', 'ignore', 'pipe'] });
    return { installed: true, error: null };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    return {
      installed: false,
      error: `"brew install imagemagick" fehlgeschlagen: ${stderr || err.message}`,
    };
  }
}

/**
 * Ablageort des Kurspilot-eigenen ImageMagick (siehe ADR 0008, "Ablageorte"):
 * macOS/Linux: ~/.kurspilot/imagemagick, Windows: %LOCALAPPDATA%\Kurspilot\imagemagick.
 */
function getKurspilotImageMagickDir({ homeDir, platform, localAppData } = {}) {
  if (platform === 'win32') {
    const resolvedLocalAppData = localAppData || path.join(homeDir, 'AppData', 'Local');
    return path.join(resolvedLocalAppData, 'Kurspilot', 'imagemagick');
  }
  return path.join(homeDir, '.kurspilot', 'imagemagick');
}

/**
 * Installiert ImageMagick auf Windows per portablem Zip-Download (Issue
 * #133): laedt WINDOWS_PORTABLE_ZIP_URL per PowerShell (Invoke-WebRequest)
 * und entpackt sie (Expand-Archive) nach getKurspilotImageMagickDir - kein
 * winget, kein Installer, daher keine UAC-Anfrage (siehe Modul-Doku oben fuer
 * die Begruendung gegen winget/--scope user). Bleibt bewusst synchron
 * (lib/setup-flow.js ruft diese Funktion ohne await als Default-DI auf).
 *
 * Auf anderen Plattformen noch nicht automatisiert - siehe installImageMagick
 * fuer den arch-erkennenden, OS-uebergreifenden Pfad (macOS/Linux).
 *
 * @param {object} [options]
 * @param {string} [options.platform] austauschbar fuer Tests
 * @param {string} [options.homeDir]
 * @param {string} [options.localAppData] austauschbar (Tests/DI)
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

  const homeDir = options.homeDir || os.homedir();
  const destDir = getKurspilotImageMagickDir({
    homeDir,
    platform,
    localAppData: options.localAppData,
  });

  const run = options.execFileSync || defaultExecFileSync;
  const psCommand = [
    '$ErrorActionPreference = "Stop";',
    `New-Item -ItemType Directory -Force -Path ${psQuote(destDir)} | Out-Null;`,
    `$archivePath = Join-Path ${psQuote(destDir)} 'imagemagick.7z';`,
    `Invoke-WebRequest -Uri ${psQuote(WINDOWS_PORTABLE_ZIP_URL)} -OutFile $archivePath;`,
    `tar -xf $archivePath -C ${psQuote(destDir)};`,
    'Remove-Item $archivePath;',
  ].join(' ');

  try {
    run('powershell.exe', ['-NoProfile', '-Command', psCommand], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return { installed: true, error: null };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    return {
      installed: false,
      error: `ImageMagick-Installation fehlgeschlagen: ${stderr || err.message}`,
    };
  }
}

/**
 * Quotet einen String fuer die Verwendung als PowerShell-Single-Quote-Literal
 * (einzige Sonderregel: ' wird zu '' verdoppelt).
 */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function platformArchKey(platform, arch) {
  return `${platform}-${arch}`;
}

/**
 * Installiert ImageMagick architektur-passend, OS-uebergreifend (Issue #124).
 * Reihenfolge:
 *   1. bereits installiert (`magick -version`)? -> nichts tun, installed: true.
 *   2. sonst: OS+Arch in IMAGEMAGICK_DOWNLOAD_TABLE nachschlagen.
 *      - method 'windows-portable' (Windows x64): wie installImageMagickWindows.
 *      - method 'zip'/'appimage' (Windows arm64, Linux x64 vorbereitet):
 *        Datentabelle-URL laden und nach getKurspilotImageMagickDir entpacken.
 *      - method 'brew' (macOS, Issue #137): installImageMagickMacOS - bei
 *        Bedarf zuerst Homebrew selbst installieren, danach
 *        "brew install imagemagick".
 *      - method 'unsupported' (z.B. unbekannte Plattform): kein Crash,
 *        sondern verstaendliche Fehlermeldung (installed: false).
 *      - kein Tabellenintrag: ebenfalls installed: false mit Fehlermeldung
 *        statt Exception.
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

  if (target.method === 'windows-portable') {
    return installImageMagickWindows({ ...options, platform });
  }

  if (target.method === 'brew') {
    return installImageMagickMacOS(options);
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
  isHomebrewInstalled,
  resolveBrewBinary,
  installHomebrew,
  installImageMagickWindows,
  installImageMagickMacOS,
  installImageMagick,
  getKurspilotImageMagickDir,
  IMAGEMAGICK_DOWNLOAD_TABLE,
  WINDOWS_PORTABLE_ZIP_URL,
  HOMEBREW_INSTALL_SCRIPT_URL,
};
