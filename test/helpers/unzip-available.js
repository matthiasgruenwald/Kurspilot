'use strict';

const { execFileSync } = require('node:child_process');

/**
 * Prueft, ob das System-`unzip` verfuegbar ist (fuer Tests, die ZIP-Inhalt
 * unabhaengig von lib/kurspilot-zip.js auslesen, siehe docs/specs/0011,
 * Testing Decisions). `unzip` ist eine reine Test-Abhaengigkeit, keine
 * Laufzeit-Dependency des Projekts.
 *
 * @returns {boolean}
 */
function unzipAvailable() {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

module.exports = { unzipAvailable };
