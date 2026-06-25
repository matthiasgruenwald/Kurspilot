/**
 * imagemagick-setup.js
 *
 * Erkennung und Windows-Installation von ImageMagick fuer das Kurspilot-
 * Konfigurationsprogramm. Prueft bewusst `magick -version` (nicht `convert`):
 * Windows bringt unter System32 ein eigenes `convert.exe` (FAT->NTFS-
 * Konvertierung) mit, das den Namen mit dem aelteren ImageMagick-Kommando
 * teilt. `magick` ist der seit ImageMagick 7 kanonische, kollisionsfreie
 * Befehl und der vom Lehrkraft-Smoke-Test ("magick -version") erwartete Pfad.
 *
 * Getrennt von lib/image-crop.js (Laufzeit-Crop ueber `convert`,
 * siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md): dieses Modul
 * betrifft nur die Installationspruefung/-anstossung im Setup-Flow.
 */

'use strict';

const { execFileSync: defaultExecFileSync } = require('node:child_process');

const WINGET_PACKAGE_ID = 'ImageMagick.ImageMagick';

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
 * noch nicht automatisiert (siehe Issue zur macOS-Kopplung).
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

module.exports = {
  isImageMagickInstalled,
  installImageMagickWindows,
  WINGET_PACKAGE_ID,
};
