/**
 * image-crop.js
 *
 * Modul fuer den "Gezielten Bildausschnitt" (siehe Issue #17, CONTEXT.md
 * "Gezielter Bildausschnitt", "Fachabbildung").
 *
 * Schneidet einen rechteckigen Bereich aus einer Quellabbildung aus und
 * speichert ihn als neue Datei.
 *
 * Unter macOS wird standardmaessig das Systemtool `sips` genutzt (kein
 * ImageMagick noetig, siehe Issue #135) - `sips` ist auf jedem macOS
 * vorinstalliert. Unter Windows kommt weiterhin ImageMagick (`magick`,
 * siehe #116) zum Einsatz, siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md
 * fuer die urspruengliche Tooling-Entscheidung (dort ging es um das
 * Crop-Werkzeug selbst, nicht um die hier vorgenommene
 * Installations-Vereinfachung auf macOS).
 *
 * `sips` hat zwei bekannte Einschraenkungen gegenueber ImageMagick:
 * animierte GIFs werden nur als erster Frame verarbeitet, und CMYK-JPEGs
 * ohne eingebettetes Farbprofil koennen auf macOS-Ebene invertierte Farben
 * liefern (bekannter CoreGraphics/ImageIO-Bug). `cropImage()` gibt daher
 * zurueck, welches Backend genutzt wurde, damit Aufrufer (siehe
 * lib/assign-tools.js) bei Bedarf einen Warnhinweis ausgeben koennen.
 *
 * Reine Datei-/Prozesslogik, kein Moodle-Zugriff.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const cp = require('node:child_process');

/**
 * Name des ImageMagick-CLI-Binaries fuer die aktuelle Plattform.
 *
 * ImageMagick 7 liefert unter Windows nur noch `magick.exe`; `convert.exe`
 * existiert dort nicht mehr und der Name `convert` ist zudem durch das
 * eingebaute Windows-Systemtool zur Datentraeger-Konvertierung belegt
 * (siehe Issue #116). macOS/Linux nutzen weiterhin `convert`.
 *
 * @returns {string} 'magick' unter Windows, sonst 'convert'
 */
function getConvertBinary() {
  return os.platform() === 'win32' ? 'magick' : 'convert';
}

/**
 * Prueft, ob das ImageMagick-CLI auf diesem System verfuegbar ist.
 *
 * @returns {boolean} true, wenn `<convertBinary> -version` erfolgreich laeuft
 */
function isImageMagickAvailable() {
  try {
    cp.execFileSync(getConvertBinary(), ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Prueft, ob das `sips`-Systemtool auf diesem System verfuegbar ist.
 * `sips` ist nur auf macOS vorinstalliert (Issue #135).
 *
 * @returns {boolean} true, wenn `sips --version` erfolgreich laeuft
 */
function isSipsAvailable() {
  if (os.platform() !== 'darwin') {
    return false;
  }
  try {
    cp.execFileSync('sips', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wandelt eine top-left-basierte Bildausschnitt-Region (wie ImageMagick
 * `-crop WxH+X+Y` sie erwartet) in das von `sips --cropOffset` erwartete
 * Koordinatenpaar [offsetY, offsetX] um (siehe `cropImage()` fuer den
 * `sips`-Aufruf selbst).
 *
 * Empirischer Befund (Issue #135, da `sips --cropOffset` nicht dokumentiert
 * ist): bei jedem von [0, 0] abweichenden Offset interpretiert `sips` die
 * beiden Werte als *absolute* Top-Left-Pixelkoordinaten (Y zuerst, dann X) -
 * NICHT zentrumsbasiert. Der Sonderfall [0, 0] bedeutet jedoch "kein Offset
 * angegeben" und croppt zentriert statt an Position (0,0). Um einen
 * tatsaechlich gewuenschten Ausschnitt an Position (0,0) zu erreichen, wird
 * deshalb [-1, -1] uebergeben - `sips` klemmt negative Offsets auf 0.
 *
 * @param {{x: number, y: number}} region Top-left-Position des Ausschnitts
 * @returns {[number, number]} [offsetY, offsetX] fuer `sips --cropOffset`
 */
function toSipsCropOffset({ x, y }) {
  if (x === 0 && y === 0) {
    return [-1, -1];
  }
  return [y, x];
}

/**
 * Formatiert eine `sips --cropOffset`-Koordinate als CLI-Argument. `sips`
 * weist negative Werte als unbekannte Flags zurueck, wenn sie ohne
 * Leerzeichen-Praefix uebergeben werden - das Leerzeichen verhindert das
 * Flag-Parsing, ohne den numerischen Wert zu veraendern.
 *
 * @param {number} value
 * @returns {string}
 */
function formatSipsOffsetArg(value) {
  return value < 0 ? ` ${value}` : `${value}`;
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
 * `destPath`.
 *
 * Unter macOS (`darwin`) wird `sips` genutzt (`sips -c <height> <width>
 * --cropOffset <offsetY> <offsetX> <sourcePath> --out <destPath>`, siehe
 * `toSipsCropOffset()` fuer die Koordinatenumrechnung). Unter allen anderen
 * Plattformen (Windows, Linux) kommt weiterhin ImageMagick zum Einsatz
 * (`<convertBinary> <sourcePath> -crop <width>x<height>+<x>+<y> +repage
 * <destPath>`, siehe `getConvertBinary()`).
 *
 * Beide Varianten rufen das CLI ueber `execFileSync` mit Argumenten als
 * Array auf (keine Shell-Interpolation). `+repage` setzt bei ImageMagick den
 * Bild-Canvas auf die neue Groesse zurueck, damit das Ergebnis keine
 * versteckten Versatz-/Canvas-Metadaten der Quelle behaelt.
 *
 * @param {string} sourcePath Pfad zur Quellabbildung
 * @param {{x: number, y: number, width: number, height: number}} region Bildausschnitt in Pixeln
 * @param {string} destPath Zielpfad fuer den Ausschnitt
 * @returns {{backend: 'sips'|'imagemagick'}} welches Backend genutzt wurde
 * @throws {Error} wenn `sourcePath` nicht existiert, `region` ungueltig ist,
 *   oder der Crop-Aufruf fehlschlaegt
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

  if (os.platform() === 'darwin') {
    return cropImageWithSips(sourcePath, { x, y, width, height }, destPath);
  }
  return cropImageWithImageMagick(sourcePath, { x, y, width, height }, destPath);
}

/**
 * Crop-Implementierung ueber das macOS-Systemtool `sips`. Siehe `cropImage()`.
 */
function cropImageWithSips(sourcePath, { x, y, width, height }, destPath) {
  const [offsetY, offsetX] = toSipsCropOffset({ x, y });

  try {
    cp.execFileSync(
      'sips',
      [
        '-c', `${height}`, `${width}`,
        '--cropOffset', formatSipsOffsetArg(offsetY), formatSipsOffsetArg(offsetX),
        sourcePath,
        '--out', destPath,
      ],
      { stdio: 'ignore' }
    );
  } catch (err) {
    throw new Error(`sips-Crop fehlgeschlagen: ${err.message}`);
  }

  return { backend: 'sips' };
}

/**
 * Crop-Implementierung ueber ImageMagick (`convert`/`magick`). Siehe `cropImage()`.
 */
function cropImageWithImageMagick(sourcePath, { x, y, width, height }, destPath) {
  const geometry = `${width}x${height}+${x}+${y}`;

  try {
    cp.execFileSync(getConvertBinary(), [sourcePath, '-crop', geometry, '+repage', destPath], {
      stdio: 'ignore',
    });
  } catch (err) {
    throw new Error(
      `ImageMagick-Crop fehlgeschlagen (ist ImageMagick installiert? siehe docs/adr/0005-imagemagick-fuer-bildausschnitt.md): ${err.message}`
    );
  }

  return { backend: 'imagemagick' };
}

module.exports = {
  cropImage,
  isImageMagickAvailable,
  isSipsAvailable,
  toSipsCropOffset,
};
