/**
 * kurspilot-frontmatter.js
 *
 * Internes Frontmatter-Modul fuer das begrenzte YAML-Profil aus
 * docs/specs/0010-kurspilot-kontext-okf-und-weitergabe.md ("Frontmatter").
 * Liest/schreibt ausschliesslich dieses begrenzte Feldset, validiert
 * Pflichtfelder und erlaubte Werte, erhaelt unbekannte optionale
 * Metadaten und behandelt nicht parsebare Dateien als sichtbaren Fehler
 * statt als stillen Verlust (siehe docs/specs/0011, Implementation
 * Decisions). Keine allgemeine YAML-Bibliothek (ponytail/YAGNI): das
 * Profil ist klein und fest, ein handgeschriebener Parser reicht.
 */

'use strict';

const fs = require('node:fs');

const ALLOWED_TYPES = ['lerngruppe', 'fach', 'vorhaben', 'plan', 'journal', 'material', 'wegweiser', 'status'];
const ALLOWED_STATUS = ['aktiv', 'archiviert', 'abgeschlossen'];
const ALLOWED_WEITERGABE = ['offen', 'schulintern', 'nicht_weitergeben'];

/** Platzhaltertext fuer noch nicht erfasste Pflichtfelder (z.B. gradeLevel). */
const NOT_YET_PROVIDED = '_(noch nicht erfasst)_';

const REQUIRED_TOP_LEVEL_FIELDS = ['type', 'title', 'tags', 'status', 'created', 'updated', 'about', 'gradeLevel'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function requireNonEmptyString(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} darf nicht leer sein.`);
  }
}

/**
 * Validiert ein Frontmatter-Datenobjekt gegen Spezifikation 0010.
 * Wirft eine einzelne Error mit allen gefundenen Problemen, damit der
 * Fehler sichtbar und vollstaendig ist statt beim ersten Problem
 * abzubrechen.
 *
 * @param {object} data
 */
function validateFrontmatterData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    throw new Error('Frontmatter-Daten fehlen.');
  }

  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in data)) {
      errors.push(`Pflichtfeld "${field}" fehlt.`);
    }
  }

  if ('type' in data && !ALLOWED_TYPES.includes(data.type)) {
    errors.push(`type "${data.type}" ist nicht erlaubt (erlaubt: ${ALLOWED_TYPES.join(', ')}).`);
  }

  if ('status' in data && !ALLOWED_STATUS.includes(data.status)) {
    errors.push(`status "${data.status}" ist nicht erlaubt (erlaubt: ${ALLOWED_STATUS.join(', ')}).`);
  }

  if ('tags' in data && !Array.isArray(data.tags)) {
    errors.push('tags muss eine Liste sein.');
  }

  for (const field of ['created', 'updated']) {
    if (field in data && !DATE_PATTERN.test(data[field])) {
      errors.push(`${field} muss im Format YYYY-MM-DD vorliegen.`);
    }
  }

  requireNonEmptyString(data.title, 'title', errors);
  requireNonEmptyString(data.about, 'about', errors);
  requireNonEmptyString(data.gradeLevel, 'gradeLevel', errors);

  if (!data.kurspilot || typeof data.kurspilot !== 'object') {
    errors.push('kurspilot-Block fehlt.');
  } else {
    if (typeof data.kurspilot.personenbezug !== 'boolean') {
      errors.push('kurspilot.personenbezug muss true oder false sein.');
    }
    if (!ALLOWED_WEITERGABE.includes(data.kurspilot.weitergabe)) {
      errors.push(
        `kurspilot.weitergabe "${data.kurspilot.weitergabe}" ist nicht erlaubt (erlaubt: ${ALLOWED_WEITERGABE.join(', ')}).`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }
}

function formatScalar(value) {
  const text = String(value);
  if (/[:#]/.test(text) || text !== text.trim()) {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  return text;
}

/**
 * Serialisiert ein validiertes Frontmatter-Datenobjekt als
 * "---"-begrenzten YAML-Block (ohne Body). Wirft bei ungueltigen Daten.
 *
 * @param {object} data
 * @returns {string}
 */
function buildFrontmatterBlock(data) {
  validateFrontmatterData(data);

  const lines = ['---'];
  const knownKeys = new Set([...REQUIRED_TOP_LEVEL_FIELDS, 'kurspilot']);

  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (field === 'tags') {
      lines.push(`tags: [${data.tags.map(formatScalar).join(', ')}]`);
    } else {
      lines.push(`${field}: ${formatScalar(data[field])}`);
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (knownKeys.has(key) || value === undefined) {
      continue;
    }
    lines.push(`${key}: ${formatScalar(value)}`);
  }

  lines.push('kurspilot:');
  lines.push(`  personenbezug: ${data.kurspilot.personenbezug}`);
  lines.push(`  weitergabe: ${data.kurspilot.weitergabe}`);
  lines.push('---');

  return lines.join('\n');
}

function unquote(rawValue) {
  const trimmed = rawValue.trim();
  const match = trimmed.match(/^"(.*)"$/);
  return match ? match[1].replace(/\\"/g, '"') : trimmed;
}

function parseTagsValue(rawValue) {
  const match = rawValue.trim().match(/^\[(.*)\]$/);
  if (!match) {
    throw new Error(`tags muss eine "[...]"-Liste sein, gefunden: "${rawValue}".`);
  }
  const inner = match[1].trim();
  if (!inner) {
    return [];
  }
  return inner.split(',').map((entry) => unquote(entry.trim()));
}

/**
 * Parst ein Markdown-Dokument mit fuehrendem Frontmatter-Block.
 * Nicht parsebares Frontmatter ist ein sichtbarer Fehler (Error), nie ein
 * stiller Verlust der Datei.
 *
 * @param {string} content vollstaendiger Dateiinhalt
 * @returns {{data: object, body: string}}
 */
function parseFrontmatter(content) {
  const lines = (content || '').split(/\r?\n/);

  if (lines[0] !== '---') {
    throw new Error('Kein gueltiges Frontmatter gefunden: Datei beginnt nicht mit "---".');
  }

  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex === -1) {
    throw new Error('Frontmatter ist nicht abgeschlossen: kein schliessendes "---" gefunden.');
  }

  const data = {};
  let currentNestedKey = null;

  for (let i = 1; i < closingIndex; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      continue;
    }

    const nestedMatch = line.match(/^ {2}(\w+):\s*(.*)$/);
    if (nestedMatch) {
      if (!currentNestedKey) {
        throw new Error(`Ungueltige Frontmatter-Zeile (kein uebergeordneter Block): "${line}"`);
      }
      const [, key, rawValue] = nestedMatch;
      data[currentNestedKey][key] = rawValue === 'true' ? true : rawValue === 'false' ? false : unquote(rawValue);
      continue;
    }

    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!topMatch) {
      throw new Error(`Ungueltige Frontmatter-Zeile: "${line}"`);
    }

    const [, key, rawValue] = topMatch;
    if (!rawValue) {
      data[key] = {};
      currentNestedKey = key;
      continue;
    }

    currentNestedKey = null;
    data[key] = key === 'tags' ? parseTagsValue(rawValue) : unquote(rawValue);
  }

  const body = lines.slice(closingIndex + 1).join('\n').replace(/^\n+/, '');

  return { data, body };
}

/**
 * Liest und validiert die Frontmatter-Kontextdatei unter `filePath`.
 * Fehlende, unlesbare oder ungueltige Frontmatter fuehren zu einer
 * sichtbaren Error statt einer stillen Datenveraenderung (die Datei wird
 * in keinem Fehlerfall angefasst).
 *
 * @param {string} filePath
 * @returns {{data: object, body: string, filePath: string}}
 */
function readFrontmatterFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Kontextdatei nicht gefunden: ${filePath}`);
    }
    throw new Error(`Kontextdatei konnte nicht gelesen werden: ${filePath} (${error.message})`);
  }

  let parsed;
  try {
    parsed = parseFrontmatter(content);
  } catch (error) {
    throw new Error(`Frontmatter in "${filePath}" ist nicht lesbar: ${error.message}`);
  }

  try {
    validateFrontmatterData(parsed.data);
  } catch (error) {
    throw new Error(`Frontmatter in "${filePath}" ist ungueltig: ${error.message}`);
  }

  return { data: parsed.data, body: parsed.body, filePath };
}

/**
 * Kombiniert Frontmatter-Block und Body zu vollstaendigem Dateiinhalt.
 *
 * @param {object} data siehe buildFrontmatterBlock
 * @param {string} body restlicher Dateiinhalt
 * @returns {string}
 */
function prependFrontmatter(data, body) {
  return `${buildFrontmatterBlock(data)}\n\n${body}`;
}

module.exports = {
  ALLOWED_TYPES,
  ALLOWED_STATUS,
  ALLOWED_WEITERGABE,
  NOT_YET_PROVIDED,
  todayIso,
  validateFrontmatterData,
  buildFrontmatterBlock,
  parseFrontmatter,
  readFrontmatterFile,
  prependFrontmatter,
};
