/**
 * image-crop.js
 *
 * Modul fuer den "Gezielten Bildausschnitt" (siehe Issue #17, CONTEXT.md
 * "Gezielter Bildausschnitt", "Fachabbildung").
 *
 * Schneidet einen rechteckigen Bereich aus einer Quellabbildung aus und
 * speichert ihn als neue Datei. Nutzt das externe CLI-Tool ImageMagick
 * (`convert`), siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md fuer
 * die Tooling-Entscheidung und die Ausnahme von der
 * "keine Laufzeit-Dependencies"-Praemisse.
 *
 * Reine Datei-/Prozesslogik, kein Moodle-Zugriff.
 */

'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

/** Name des ImageMagick-CLI-Binaries. */
const CONVERT_BINARY = 'convert';

/**
 * Prueft, ob das ImageMagick-CLI (`convert`) auf diesem System verfuegbar ist.
 *
 * @returns {boolean} true, wenn `convert -version` erfolgreich laeuft
 */
function isImageMagickAvailable() {
  try {
    execFileSync(CONVERT_BINARY, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validiert, dass `region` vier nicht-negative ganze Zahlen
 * (x, y, width, height) enthaelt und width/height > 0 sind.
 *
 * @param {{x: number, y: number, width: number, height: number}} region
 */
function validateRegion(region) {
  const fields = ['x', 'y', 'width', 'height'];
  for (const field of fields) {
    const value = region ? region[field] : undefined;
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`region.${field} muss eine nicht-negative ganze Zahl sein.`);
    }
  }
  if (region.width === 0 || region.height === 0) {
    throw new Error('region.width und region.height muessen groesser als 0 sein.');
  }
}

/**
 * Schneidet einen Bildausschnitt aus `sourcePath` aus und schreibt ihn nach
 * `destPath`. Ruft dazu ImageMagick (`convert <sourcePath> -crop
 * <width>x<height>+<x>+<y> +repage <destPath>`) ueber `execFileSync` auf
 * (Argumente als Array, keine Shell-Interpolation).
 *
 * `+repage` setzt den Bild-Canvas auf die neue Groesse zurueck, damit das
 * Ergebnis keine versteckten Versatz-/Canvas-Metadaten der Quelle behaelt.
 *
 * @param {string} sourcePath Pfad zur Quellabbildung
 * @param {{x: number, y: number, width: number, height: number}} region Bildausschnitt in Pixeln
 * @param {string} destPath Zielpfad fuer den Ausschnitt
 * @throws {Error} wenn `sourcePath` nicht existiert, `region` ungueltig ist,
 *   ImageMagick nicht installiert ist oder `convert` fehlschlaegt
 */
function cropImage(sourcePath, region, destPath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Quelldatei nicht gefunden: ${sourcePath}`);
  }
  if (!destPath) {
    throw new Error('destPath ist erforderlich.');
  }

  validateRegion(region || {});

  const { x, y, width, height } = region;
  const geometry = `${width}x${height}+${x}+${y}`;

  try {
    execFileSync(CONVERT_BINARY, [sourcePath, '-crop', geometry, '+repage', destPath], {
      stdio: 'ignore',
    });
  } catch (err) {
    throw new Error(
      `ImageMagick-Crop fehlgeschlagen (ist "convert" installiert? siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md): ${err.message}`
    );
  }
}

module.exports = {
  cropImage,
  isImageMagickAvailable,
};
