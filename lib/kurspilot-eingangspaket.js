/**
 * kurspilot-eingangspaket.js
 *
 * Sichere Uebernahme eines empfangenen Weitergabepakets (Material- oder
 * Lerngruppenpaket, siehe lib/kurspilot-materialpaket.js,
 * lib/kurspilot-lerngruppenpaket.js) in die eigene Chronologie (Issue #278,
 * docs/specs/0011, Implementation Decisions: "Die Uebernahme entpackt
 * zunaechst in einen ausdruecklich gewaehlten Eingangsort. Erst eine zweite
 * bestaetigte Operation legt einen neuen, konfliktfreien Ordner in der
 * Chronologie des Empfaengers an; automatische Uebernahme, Ueberschreiben
 * und Mergen sind ausgeschlossen.").
 *
 * Zweistufig wie Materialexport/Lerngruppenexport (options.confirmed):
 *
 *   1. Vorschau (options.confirmed nicht gesetzt): entpackt das Archiv
 *      sicher (lib/kurspilot-zip.js#readZipEntries prueft Beschaedigung,
 *      Pfadtraversierung und Symlink-Ziele vor jeder Dateioperation) in den
 *      von der Lehrkraft gewaehlten Eingangsort und meldet Inhalt/Titel,
 *      ohne die Chronologie zu beruehren.
 *   2. Bestaetigung (options.confirmed: true): kopiert den Paketinhalt
 *      (unveraendert, das Eingangspaket am Eingangsort bleibt bestehen) in
 *      einen neuen, konfliktfreien Ordner unter dem von der Lehrkraft
 *      gewaehlten Zielverzeichnis der eigenen Chronologie. Bei
 *      Namensgleichheit wird ein Zaehler-Suffix angehaengt statt zu
 *      ueberschreiben oder zusammenzufuehren.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { readZipEntries } = require('./kurspilot-zip');
const { resolveLocalContextPath } = require('./local-context-paths');

/** Wurzeldateien eines Weitergabepakets, kein Inhalt der Chronologie. */
const METADATA_ENTRY_NAMES = new Set(['manifest.md', 'AGENTS.md', 'katalog.md']);

/**
 * Versteckte Markerdatei am Eingangsort: haelt fest, aus welchem Archiv
 * (Pfad + Groesse + Aenderungszeit) dort entpackt wurde. Verhindert, dass
 * ein wiederverwendeter Eingangsort mit einem ANDEREN Archiv still den
 * alten Inhalt behaelt (entpackeFallsNoch ueberspringt sonst blind jeden
 * nicht-leeren Eingangsort) - die Lehrkraft wuerde sonst eine Vorschau eines
 * fremden/alten Pakets bestaetigen, ohne es zu merken.
 */
const QUELLE_MARKER_NAME = '.kurspilot-quelle';

function requireNonEmptyText(value, label) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return trimmed;
}

function requireSafeFolderName(value, label) {
  const trimmed = requireNonEmptyText(value, label);
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' || trimmed === '..') {
    throw new Error(`${label} "${value}" ist kein gueltiger einzelner Ordnername.`);
  }
  return trimmed;
}

function quelleKennung(archivePath) {
  const stat = fs.statSync(archivePath);
  return `${path.resolve(archivePath)}\n${stat.size}\n${stat.mtimeMs}\n`;
}

/**
 * Entpackt das Archiv nach `absEingangsort`, sofern dort noch nichts vom
 * SELBEN Archiv liegt. Ist der Eingangsort bereits mit demselben Archiv
 * befuellt (z.B. aus einer vorherigen Vorschau), bleibt er unangetastet -
 * das Eingangspaket ist bis zur Uebernahme unveraendert nachvollziehbar
 * (AC1) statt bei jedem Aufruf neu geschrieben zu werden. Steckt dort
 * bereits Inhalt eines ANDEREN Archivs, wird das als Fehler abgewiesen statt
 * ihn still zu verwenden - sonst koennte eine Vorschau ein anderes Paket
 * zeigen als das, was am Ende uebernommen wird.
 *
 * @param {string} archivePath
 * @param {string} absEingangsort
 */
function entpackeFallsNoch(archivePath, absEingangsort) {
  const markerPath = path.join(absEingangsort, QUELLE_MARKER_NAME);
  const erwarteteKennung = quelleKennung(archivePath);

  if (fs.existsSync(absEingangsort) && fs.readdirSync(absEingangsort).length > 0) {
    const vorhandeneKennung = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, 'utf8') : null;
    if (vorhandeneKennung === erwarteteKennung) {
      return;
    }
    throw new Error(
      `Eingangsort "${absEingangsort}" enthaelt bereits den Inhalt eines anderen Pakets. ` +
        'Bitte einen leeren/neuen Eingangsort waehlen statt ihn wiederzuverwenden.'
    );
  }

  // readZipEntries prueft Beschaedigung, Traversal/absolute Pfade und
  // Symlink-Ziele vollstaendig, bevor hier ueberhaupt eine Datei geschrieben
  // wird (AC3: "vor jeder Dateioperation abgewiesen").
  const entries = readZipEntries(archivePath);

  fs.mkdirSync(absEingangsort, { recursive: true });
  for (const entry of entries) {
    const targetPath = path.join(absEingangsort, entry.name);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, entry.data);
  }
  fs.writeFileSync(markerPath, erwarteteKennung, 'utf8');
}

/**
 * Bestimmt den einen Vorhaben-/Lerngruppenordner eines entpackten Pakets:
 * alles ausser den bekannten Paket-Wurzeldateien (manifest.md, AGENTS.md,
 * katalog.md) und der internen Markerdatei muss genau ein Ordner sein -
 * sowohl Material- als auch Lerngruppenpaket bauen ihr Archiv so auf (siehe
 * kurspilot-materialpaket.js bzw. kurspilot-lerngruppenpaket.js: ein
 * Inhaltsordner neben den Wurzeldateien).
 *
 * @param {string} absEingangsort
 * @returns {string} Name des Inhaltsordners
 */
function ermittleInhaltsordner(absEingangsort) {
  const topLevel = fs
    .readdirSync(absEingangsort, { withFileTypes: true })
    .filter((entry) => !METADATA_ENTRY_NAMES.has(entry.name) && entry.name !== QUELLE_MARKER_NAME);

  if (topLevel.length !== 1 || !topLevel[0].isDirectory()) {
    throw new Error(
      'Paketinhalt laesst sich keinem eindeutigen Ordner zuordnen; Uebernahme wird nicht durchgefuehrt.'
    );
  }

  return topLevel[0].name;
}

/**
 * Findet einen in `absZielVerzeichnis` noch nicht vergebenen Ordnernamen.
 * Bei Namensgleichheit wird ein Zaehler-Suffix angehaengt statt zu
 * ueberschreiben oder zusammenzufuehren (AC2).
 *
 * @param {string} absZielVerzeichnis
 * @param {string} baseName
 * @returns {string}
 */
function eindeutigerZielname(absZielVerzeichnis, baseName) {
  let candidate = baseName;
  let suffix = 2;
  while (fs.existsSync(path.join(absZielVerzeichnis, candidate))) {
    candidate = `${baseName}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Vorschau oder (nach Bestaetigung) Uebernahme eines Eingangspakets.
 *
 * @param {object} fields
 * @param {string} fields.archivePath absoluter Pfad zum empfangenen Paket-ZIP
 * @param {string} fields.eingangsort Pfad (relativ zum Arbeitsbereich) des ausdruecklich gewaehlten Eingangsorts
 * @param {string} [fields.zielVerzeichnis] Pfad (relativ zum Arbeitsbereich) des Chronologie-Zielordners; nur bei confirmed noetig
 * @param {string} [fields.ordnerName] gewuenschter Ordnername in der Chronologie (Default: Ordnername aus dem Paket)
 * @param {object} [options]
 * @param {boolean} [options.confirmed] true = tatsaechlich in die Chronologie uebernehmen
 * @param {string} [options.contextRoot]
 * @param {Function} [options.readWorkspaceSetting]
 * @param {object} [options.workspaceConfigOptions]
 * @returns {{ok: true, status: 'preview'|'uebernommen', ...}|{ok: false, message: string}}
 */
function uebernehmeEingangspaket(fields = {}, options = {}) {
  try {
    const archivePath = path.resolve(requireNonEmptyText(fields.archivePath, 'archivePath'));
    if (!fs.existsSync(archivePath)) {
      return { ok: false, message: `Eingangspaket (ZIP) nicht gefunden: ${archivePath}` };
    }

    const eingangsortResolution = resolveLocalContextPath(
      requireNonEmptyText(fields.eingangsort, 'eingangsort'),
      options
    );
    const absEingangsort = eingangsortResolution.absolutePath;

    try {
      entpackeFallsNoch(archivePath, absEingangsort);
    } catch (error) {
      return { ok: false, message: `Eingangspaket konnte nicht sicher entpackt werden: ${error.message}` };
    }

    let inhaltsordner;
    try {
      inhaltsordner = ermittleInhaltsordner(absEingangsort);
    } catch (error) {
      return { ok: false, message: error.message };
    }

    const manifestPath = path.join(absEingangsort, 'manifest.md');
    const manifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
    const baseName = requireSafeFolderName(fields.ordnerName || inhaltsordner, 'ordnerName');

    const previewResult = {
      ok: true,
      status: 'preview',
      archivePath,
      contextRoot: eingangsortResolution.contextRoot,
      eingangsort: absEingangsort,
      inhaltsordner,
      manifest,
      teacherFacingText: [
        `Eingangspaket unveraendert entpackt nach: ${absEingangsort}`,
        `Enthaelt Ordner "${inhaltsordner}" - noch nicht in die eigene Chronologie uebernommen.`,
        manifest
          ? 'manifest.md liegt im Eingangsort (Titel/Herkunft/Absender dort nachlesbar).'
          : 'Kein manifest.md im Paket gefunden.',
      ].join('\n'),
    };

    if (!options.confirmed) {
      return previewResult;
    }

    const zielResolution = resolveLocalContextPath(
      requireNonEmptyText(fields.zielVerzeichnis, 'zielVerzeichnis'),
      options
    );
    const absZielVerzeichnis = zielResolution.absolutePath;
    fs.mkdirSync(absZielVerzeichnis, { recursive: true });

    const zielName = eindeutigerZielname(absZielVerzeichnis, baseName);
    const absZielOrdner = path.join(absZielVerzeichnis, zielName);

    // Kopieren statt Verschieben: das Eingangspaket am Eingangsort bleibt
    // unveraendert bestehen (AC1); bei Namensgleichheit bleiben beide
    // Staende erhalten (AC2), ueberschrieben/gemergt wird nichts.
    fs.cpSync(path.join(absEingangsort, inhaltsordner), absZielOrdner, { recursive: true, errorOnExist: true });

    return {
      ok: true,
      status: 'uebernommen',
      archivePath,
      contextRoot: eingangsortResolution.contextRoot,
      eingangsort: absEingangsort,
      inhaltsordner,
      zielOrdner: absZielOrdner,
      umbenannt: zielName !== baseName,
      teacherFacingText:
        `Eingangspaket uebernommen nach: ${absZielOrdner}` +
        (zielName !== baseName ? ` (umbenannt wegen Namensgleichheit mit "${baseName}")` : ''),
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

module.exports = {
  uebernehmeEingangspaket,
};
