/**
 * material.js
 *
 * Modul fuer "Material-Ingestion" (siehe Issue #12, CONTEXT.md
 * "Bereitgestelltes Lehrkraftmaterial", "Sprechender Materialdateiname",
 * "Originalmaterial", "Lokaler Materialordner").
 *
 * Aufgaben:
 *   - normalizeFilename(originalName, ctx): erzeugt einen "sprechenden"
 *     Dateinamen nach dem Schema <topic>_<description>[_<index>].<ext>.
 *   - saveMaterial(filePath, ctx): kopiert eine bereitgestellte Datei in den
 *     lokalen Materialordner (`<fachprofil>/materials/<topic>/`).
 *     - Original bleibt erhalten unter `materials/<topic>/original/<originalName>`
 *     - Normalisierte Kopie unter `materials/<topic>/<sprechend>.<ext>`
 *     - Bei Namenskollision wird ein Index-Suffix hochgezaehlt.
 *     - Jeder Aufruf erzeugt einen Journal-Eintrag (lib/journal.js) mit
 *       Original- und neuem Namen.
 *
 * Reine Datei-/Formatierungslogik, kein Moodle-Zugriff.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { getFachprofilPath } = require('./local-context-paths');
const { journalPath, appendJournalEntry } = require('./journal');

// ─────────────────────────────────────────────────────────────
// Konstanten
// ─────────────────────────────────────────────────────────────

/** Unterordner fuer Materialien im Fachprofil. */
const MATERIALS_DIR = 'materials';

/** Unterordner fuer die unveraenderten Originaldateien innerhalb von materials/<topic>/. */
const ORIGINAL_DIR = 'original';

/** Maximum fuer den Kollisions-Index, um Endlosschleifen zu verhindern. */
const MAX_COLLISION_INDEX = 999;

/** Transliteration deutscher Umlaute und Sonderzeichen. */
const UMLAUT_MAP = Object.freeze({
  'ä': 'ae', 'Ä': 'ae',
  'ö': 'oe', 'Ö': 'oe',
  'ü': 'ue', 'Ü': 'ue',
  'ß': 'ss',
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Transliteriert Umlaute, lowercased, ersetzt nicht-ASCII-/Sonderzeichen
 * durch Unterstrich, kollabiert Mehrfach-Trennzeichen und entfernt
 * fuehrende/abschliessende Trennzeichen. Bindestriche bleiben erhalten.
 *
 * @param {string} input Rohtext (z.B. topic oder description)
 * @returns {string} sicherer ASCII-Slug
 */
function slugify(input) {
  if (typeof input !== 'string') return '';

  // 1) Umlaute transliterieren
  let s = input.replace(/[äöüÄÖÜß]/g, (ch) => UMLAUT_MAP[ch] || ch);

  // 2) Lowercase
  s = s.toLowerCase();

  // 3) Alle nicht erlaubten Zeichen (alles ausser a-z, 0-9, "-") -> "_"
  //    Damit verschwinden Slashes, Klammern, Punkte (in den Eingaben), Spaces, etc.
  s = s.replace(/[^a-z0-9-]+/g, '_');

  // 4) Mehrfache Unterstriche kollabieren
  s = s.replace(/_+/g, '_');

  // 5) Mehrfache Bindestriche kollabieren
  s = s.replace(/-+/g, '-');

  // 6) Bindestriche neben Unterstrichen zusammenfassen (z.B. "_-_" -> "_")
  s = s.replace(/_-+|-+_/g, '_');

  // 7) Fuehrende/abschliessende Trennzeichen entfernen
  s = s.replace(/^[_-]+|[_-]+$/g, '');

  return s;
}

/**
 * Liefert die Extension eines Dateinamens (lowercased, ohne fuehrenden Punkt).
 *
 * @param {string} originalName Originaldateiname
 * @returns {string} Extension ohne Punkt oder leerer String
 */
function extractExtension(originalName) {
  if (typeof originalName !== 'string') return '';
  const ext = path.extname(originalName);
  if (!ext) return '';
  return ext.slice(1).toLowerCase();
}

/**
 * Pflichtfeld-Pruefung fuer topic/description.
 */
function requireNonEmpty(value, label) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────
// normalizeFilename
// ─────────────────────────────────────────────────────────────

/**
 * Erzeugt einen "sprechenden" Dateinamen nach Konvention
 *   <topic>_<description>[_<index>].<ext>
 *
 * - Umlaute werden transliteriert (ae/oe/ue/ss).
 * - Alles wird lowercased.
 * - Spaces und Sonderzeichen werden durch Unterstrich ersetzt.
 * - Bindestriche bleiben erhalten.
 * - Extension stammt aus originalName, lowercased.
 * - Index 1 oder ohne Index erzeugt KEIN Suffix; ab index >= 2 wird "_<index>"
 *   vor der Extension eingefuegt.
 *
 * @param {string} originalName urspruenglicher Dateiname (nur fuer Extension genutzt)
 * @param {object} context
 * @param {string} context.topic Pflicht: Thema/Unterthema (Slug-faehig)
 * @param {string} context.description Pflicht: kurze Beschreibung (Slug-faehig)
 * @param {number} [context.index] optional: Kollisions-Index, >= 2 erzeugt Suffix
 * @returns {string} normalisierter Dateiname
 */
function normalizeFilename(originalName, context) {
  const ctx = context || {};
  requireNonEmpty(ctx.topic, 'topic');
  requireNonEmpty(ctx.description, 'description');

  const topicSlug = slugify(ctx.topic);
  const descSlug = slugify(ctx.description);

  if (!topicSlug) {
    throw new Error(`topic "${ctx.topic}" enthaelt nach Normalisierung keine zulaessigen Zeichen.`);
  }
  if (!descSlug) {
    throw new Error(`description "${ctx.description}" enthaelt nach Normalisierung keine zulaessigen Zeichen.`);
  }

  const ext = extractExtension(originalName);
  const index = Number.isInteger(ctx.index) && ctx.index >= 2 ? ctx.index : null;

  const base = index !== null
    ? `${topicSlug}_${descSlug}_${index}`
    : `${topicSlug}_${descSlug}`;

  return ext ? `${base}.${ext}` : base;
}

// ─────────────────────────────────────────────────────────────
// Pfad-Helper
// ─────────────────────────────────────────────────────────────

/**
 * Berechnet den Pfad zum Materialordner eines Themas innerhalb eines
 * Fachprofils: `local-context/<schuljahr>/<klasse>/<fach>/materials/<topic>`.
 *
 * Der `topic`-Wert wird hier NICHT durch das strenge Segmentmuster von
 * local-context-paths.js gefiltert, sondern lediglich slugifiziert, damit
 * Lehrkraefte ihre Themenbezeichnung freier waehlen koennen.
 *
 * @param {string} schuljahr
 * @param {string} klasseOderLerngruppe
 * @param {string} unterrichtsordner
 * @param {string} topic
 * @returns {string} relativer Pfad zum Materialordner
 */
function getMaterialsPath(schuljahr, klasseOderLerngruppe, unterrichtsordner, topic) {
  const topicSlug = slugify(topic || '');
  if (!topicSlug) {
    throw new Error('topic darf nach Normalisierung nicht leer sein.');
  }

  return path.join(
    getFachprofilPath(schuljahr, klasseOderLerngruppe, unterrichtsordner),
    MATERIALS_DIR,
    topicSlug
  );
}

// ─────────────────────────────────────────────────────────────
// saveMaterial
// ─────────────────────────────────────────────────────────────

/**
 * Sucht den naechsten freien normalisierten Dateinamen im Zielordner.
 *
 * @param {string} targetDir absoluter Zielordner
 * @param {string} originalName Originaldateiname (fuer Extension)
 * @param {{topic: string, description: string}} ctx
 * @returns {{absPath: string, fileName: string, index: number}}
 */
function findFreeNormalizedPath(targetDir, originalName, ctx) {
  for (let i = 1; i <= MAX_COLLISION_INDEX; i++) {
    const fileName = normalizeFilename(originalName, {
      topic: ctx.topic,
      description: ctx.description,
      index: i,
    });
    const absPath = path.join(targetDir, fileName);
    if (!fs.existsSync(absPath)) {
      return { absPath, fileName, index: i };
    }
  }
  throw new Error(
    `Konnte keinen freien Dateinamen fuer ${ctx.topic}/${ctx.description} finden ` +
    `(Index ${MAX_COLLISION_INDEX} ueberschritten).`
  );
}

/**
 * Speichert eine bereitgestellte Materialdatei.
 *
 * Verzeichnisstruktur (relativ zu `contextRoot`):
 *   local-context/<schuljahr>/<klasse>/<fach>/materials/<topic>/
 *     original/<originalName>     <-- unveraenderte Kopie
 *     <sprechend>.<ext>            <-- normalisierte Kopie
 *
 * Bei Namenskollision der normalisierten Datei wird der naechste freie
 * Index-Suffix gewaehlt (`_2`, `_3`, ...). Originalkopien behalten ihren
 * urspruenglichen Dateinamen; existiert dort bereits eine Datei, wird sie
 * nicht ueberschrieben (es wird ebenfalls ein numerisches Suffix verwendet).
 *
 * Jeder erfolgreiche Aufruf schreibt einen Journal-Eintrag (siehe lib/journal.js)
 * mit Original- und neuem Namen sowie dem Thema.
 *
 * @param {string} filePath Pfad der bereitgestellten Quelldatei
 * @param {object} context
 * @param {string} context.schuljahr z.B. "2025-26"
 * @param {string} context.klasse z.B. "7a"
 * @param {string} context.unterrichtsordner z.B. "naturwissenschaften"
 * @param {string} context.topic Thema/Unterthema (Ordnername)
 * @param {string} context.description kurze Beschreibung (fuer den Dateinamen)
 * @param {string} context.contextRoot Basisverzeichnis (in dem `local-context/` liegt)
 * @param {string|Date} [context.date] optional: Datum fuer den Journal-Eintrag (default: heute UTC)
 * @returns {{originalPath: string, normalizedPath: string, journalPath: string}}
 */
function saveMaterial(filePath, context) {
  const ctx = context || {};

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Quelldatei nicht gefunden: ${filePath}`);
  }

  const {
    schuljahr,
    klasse,
    unterrichtsordner,
    topic,
    description,
    contextRoot,
    date,
  } = ctx;

  if (!contextRoot) {
    throw new Error('contextRoot ist erforderlich.');
  }

  requireNonEmpty(topic, 'topic');
  requireNonEmpty(description, 'description');

  const originalName = path.basename(filePath);

  // Zielordner aufbauen
  const relMaterialsDir = getMaterialsPath(schuljahr, klasse, unterrichtsordner, topic);
  const absMaterialsDir = path.join(contextRoot, relMaterialsDir);
  const absOriginalDir = path.join(absMaterialsDir, ORIGINAL_DIR);

  fs.mkdirSync(absOriginalDir, { recursive: true });

  // Original kopieren (Originaldateiname beibehalten, bei Kollision Suffix anhaengen)
  const originalTargetPath = findFreeOriginalPath(absOriginalDir, originalName);
  fs.copyFileSync(filePath, originalTargetPath);

  // Normalisierte Kopie schreiben (mit freier Index-Suche)
  const { absPath: normalizedPath, fileName: normalizedName } = findFreeNormalizedPath(
    absMaterialsDir,
    originalName,
    { topic, description }
  );
  fs.copyFileSync(filePath, normalizedPath);

  // Journal-Eintrag schreiben (scope: unterrichtsordner, weil materials/ dort liegt)
  const relJournalPath = journalPath(
    { schuljahr, klasse, unterrichtsordner },
    'unterrichtsordner',
    date || new Date()
  );
  const absJournalPath = path.join(contextRoot, relJournalPath);

  const entry = formatMaterialJournalEntry({
    originalName,
    normalizedName,
    topic,
    description,
    date: date || new Date(),
  });
  appendJournalEntry(absJournalPath, entry);

  return {
    originalPath: originalTargetPath,
    normalizedPath,
    journalPath: absJournalPath,
  };
}

/**
 * Sucht im Original-Unterordner einen freien Dateinamen. Bei Kollision wird
 * "_2", "_3", ... vor die Extension gesetzt. Der Originalname bleibt aber
 * unveraendert, wenn moeglich.
 */
function findFreeOriginalPath(originalDir, originalName) {
  const direct = path.join(originalDir, originalName);
  if (!fs.existsSync(direct)) return direct;

  const ext = path.extname(originalName);
  const stem = path.basename(originalName, ext);

  for (let i = 2; i <= MAX_COLLISION_INDEX; i++) {
    const candidate = path.join(originalDir, `${stem}_${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Konnte keinen freien Originaldateinamen fuer ${originalName} finden ` +
    `(Index ${MAX_COLLISION_INDEX} ueberschritten).`
  );
}

/**
 * Formatiert einen Journal-Eintrag fuer eine Materialspeicherung. Folgt dem
 * Stil bestehender Journal-Eintraege (Markdown mit Ueberschrift + Listenpunkten).
 */
function formatMaterialJournalEntry({ originalName, normalizedName, topic, description, date }) {
  const dateStr = formatJournalDate(date);
  const lines = [
    `## ${dateStr} Material gespeichert`,
    '',
    `- Thema: ${topic}`,
    `- Beschreibung: ${description}`,
    `- Originaldateiname: \`${originalName}\``,
    `- Sprechender Dateiname: \`${normalizedName}\``,
  ];
  return lines.join('\n');
}

/**
 * Tag eines Date-Objekts/Strings als "YYYY-MM-DD" (UTC).
 */
function formatJournalDate(date) {
  if (date instanceof Date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return typeof date === 'string' ? date : String(date);
}

module.exports = {
  MATERIALS_DIR,
  ORIGINAL_DIR,
  normalizeFilename,
  saveMaterial,
  getMaterialsPath,
};
