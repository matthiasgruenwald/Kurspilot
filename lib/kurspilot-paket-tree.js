/**
 * kurspilot-paket-tree.js
 *
 * Gemeinsame Verzeichnis-Traversierung fuer Weitergabepakete
 * (Materialpaket, Issue #276; Lerngruppenpaket, Issue #277). Trennt einen
 * Ordnerunterbaum in "eingeschlossen" und "ausgeschlossen" (mit Grund) und
 * schuetzt dabei vor Symlinks, die aus dem Unterbaum herausverweisen
 * (Traversal-/Verweisschutz). Welche Dateien ausgeschlossen werden,
 * entscheidet ausschliesslich der uebergebene `evaluateExclusionReason`
 * (siehe docs/specs/0011, "gekapselte Archiv-Implementierung"; Material-
 * und Lerngruppenpaket haben unterschiedliche Ausschlussregeln).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Durchsucht `rootDir` rekursiv und trennt Dateien in "eingeschlossen" und
 * "ausgeschlossen" (mit Grund) anhand von `evaluateExclusionReason`.
 *
 * @param {string} rootDir absoluter Pfad zum Wurzelordner des Pakets
 * @param {(absFilePath: string) => string|null} evaluateExclusionReason
 *   liefert einen Ausschlussgrund oder null (Datei bleibt im Paket)
 * @returns {{included: string[], excluded: {path: string, reason: string}[]}}
 */
function walkPaketTree(rootDir, evaluateExclusionReason) {
  const included = [];
  const excluded = [];
  const rootReal = fs.realpathSync(rootDir);

  function visit(absDir, relDir) {
    const entries = fs
      .readdirSync(absDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isSymbolicLink()) {
        let real;
        try {
          real = fs.realpathSync(absPath);
        } catch {
          excluded.push({ path: relPath, reason: 'Verweis (Symlink) laesst sich nicht aufloesen' });
          continue;
        }
        const relToRoot = path.relative(rootReal, real);
        if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
          excluded.push({ path: relPath, reason: 'Verweis (Symlink) zeigt ausserhalb des Pakets' });
          continue;
        }
        if (fs.statSync(absPath).isDirectory()) {
          visit(absPath, relPath);
          continue;
        }
      } else if (entry.isDirectory()) {
        visit(absPath, relPath);
        continue;
      } else if (!entry.isFile()) {
        // z.B. Sockets/Devices: keine sinnvolle Materialdatei.
        excluded.push({ path: relPath, reason: 'kein regulaeres Datei-/Ordnerobjekt' });
        continue;
      }

      const reason = evaluateExclusionReason(absPath);
      if (reason) {
        excluded.push({ path: relPath, reason });
      } else {
        included.push(relPath);
      }
    }
  }

  visit(rootDir, '');
  return { included, excluded };
}

module.exports = {
  walkPaketTree,
};
