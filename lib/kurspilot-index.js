/**
 * kurspilot-index.js
 *
 * Best-effort Pflege von `<arbeitsbereich>/index.md` (siehe
 * docs/specs/0010, Abschnitt "Thematischer Index"; docs/specs/0011,
 * Implementation Decisions). Kurspilot aktualisiert beim Anlegen/Aendern
 * eines Vorhabens ausschliesslich den ihm gehoerenden Eintrag (identifiziert
 * ueber einen `<!-- kurspilot:eintrag <verweis> -->`-Marker); alle uebrigen
 * Zeilen der Datei (Handpflege, andere Eintraege) bleiben unangetastet. Bei
 * unlesbarem oder widerspruechlichem Index (kaputte/duplizierte Marker)
 * wird die Datei nicht geschrieben, es wird lediglich gewarnt.
 *
 * Kein YAML/Markdown-Parser (ponytail/YAGNI): Der Index ist eine simple,
 * zeilenbasierte Struktur mit zwei festen Ueberschriften und
 * Marker-begrenzten Eintragsbloecken.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { readFrontmatterFile, NOT_YET_PROVIDED } = require('./kurspilot-frontmatter');
const { resolveKurspilotContextRoot } = require('./local-context-paths');

const HEADING_AKTIV = '## Aktive Vorhaben';
const HEADING_ARCHIV = '## Archivierte Vorhaben';
const ENTRY_START_RE = /^<!-- kurspilot:eintrag (\S+) -->\s*$/;
const ENTRY_END_RE = /^<!-- \/kurspilot:eintrag -->\s*$/;

class IndexConflictError extends Error {}

/**
 * Zerlegt den Inhalt von index.md in Zeilen und findet alle
 * Marker-begrenzten Eintragsbloecke sowie die beiden Ueberschriften.
 * Wirft IndexConflictError bei kaputten/doppelten Markern oder doppelten
 * Ueberschriften statt still etwas zu verwerfen.
 *
 * @param {string} content
 * @returns {{lines: string[], entries: Map<string, {startLine: number, endLine: number}>}}
 */
function analyzeIndex(content) {
  const lines = content.split(/\r?\n/);
  const entries = new Map();
  const seenHeadings = new Set();
  let openStart = null;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (trimmed === HEADING_AKTIV || trimmed === HEADING_ARCHIV) {
      if (seenHeadings.has(trimmed)) {
        throw new IndexConflictError(`Ueberschrift "${trimmed}" kommt mehrfach vor.`);
      }
      seenHeadings.add(trimmed);
      continue;
    }

    const startMatch = lines[i].match(ENTRY_START_RE);
    if (startMatch) {
      if (openStart) {
        throw new IndexConflictError(`Eintrag "${openStart.relPath}" wird nicht geschlossen.`);
      }
      openStart = { relPath: startMatch[1], line: i };
      continue;
    }

    if (ENTRY_END_RE.test(lines[i])) {
      if (!openStart) {
        throw new IndexConflictError(`Schliessende Markierung ohne zugehoerigen Start in Zeile ${i + 1}.`);
      }
      if (entries.has(openStart.relPath)) {
        throw new IndexConflictError(`Mehrfacher Eintrag fuer "${openStart.relPath}".`);
      }
      entries.set(openStart.relPath, { startLine: openStart.line, endLine: i });
      openStart = null;
    }
  }

  if (openStart) {
    throw new IndexConflictError(`Eintrag "${openStart.relPath}" wird nicht geschlossen.`);
  }

  return { lines, entries };
}

function removeEntryBlock(lines, entry) {
  let end = entry.endLine;
  if (lines[end + 1] !== undefined && lines[end + 1].trim() === '') {
    end += 1;
  }
  lines.splice(entry.startLine, end - entry.startLine + 1);
}

function findHeadingLine(lines, headingText) {
  return lines.findIndex((line) => line.trim() === headingText);
}

/**
 * Fuegt `headingText` an, falls sie fehlt. Landet vor `beforeHeadingText`,
 * wenn diese bereits existiert, sonst am Dateiende (haelt "Aktive Vorhaben"
 * so zuverlaessig vor "Archivierte Vorhaben", auch bei handgepflegten
 * Dateien).
 */
function insertHeadingIfMissing(lines, headingText, beforeHeadingText) {
  if (findHeadingLine(lines, headingText) !== -1) {
    return;
  }

  let insertAt = lines.length;
  if (beforeHeadingText) {
    const beforeIdx = findHeadingLine(lines, beforeHeadingText);
    if (beforeIdx !== -1) {
      insertAt = beforeIdx;
    }
  }

  const needsLeadingBlank = insertAt > 0 && lines[insertAt - 1].trim() !== '';
  const block = needsLeadingBlank ? ['', headingText, ''] : [headingText, ''];
  lines.splice(insertAt, 0, ...block);
}

function insertEntryAfterHeading(lines, headingText, entryBlockText) {
  const idx = findHeadingLine(lines, headingText);
  lines.splice(idx + 1, 0, '', ...entryBlockText.split('\n'), '');
}

function extractKurzbeschreibung(body) {
  const match = (body || '').match(/##\s*Kurzbeschreibung\s*\r?\n+([\s\S]*?)(?:\r?\n##\s|\s*$)/);
  const text = match ? match[1].trim() : '';
  return text ? text.replace(/\s*\r?\n\s*/g, ' ') : NOT_YET_PROVIDED;
}

function formatPortableRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function buildEntryBlock(relPath, fields) {
  const tagsLine = Array.isArray(fields.tags) && fields.tags.length ? fields.tags.join(', ') : NOT_YET_PROVIDED;
  const lines = [
    `<!-- kurspilot:eintrag ${relPath} -->`,
    `### ${fields.title}`,
    `- Verweis: \`${relPath}/CONTEXT.md\``,
    `- Fach: ${fields.about}`,
    `- Jahrgangsstufe: ${fields.gradeLevel}`,
    `- Tags: ${tagsLine}`,
    `- Kurzbeschreibung: ${fields.kurzbeschreibung}`,
    `- Status: ${fields.status}`,
  ];
  if (fields.license) {
    lines.push(`- Lizenz: ${fields.license}`);
  }
  lines.push('<!-- /kurspilot:eintrag -->');
  return lines.join('\n');
}

/**
 * Legt den Indexeintrag fuer ein Vorhaben an oder aktualisiert ihn
 * (best-effort, siehe Moduldoku oben). Liest Titel/Fach/Jahrgangsstufe/
 * Tags/Status/Kurzbeschreibung aus der bereits geschriebenen CONTEXT.md
 * des Vorhabens (typischerweise das Ergebnis von createVorhabenContext).
 *
 * @param {string} vorhabenContextFilePath absoluter Pfad zur CONTEXT.md des Vorhabens
 * @param {object} [options]
 * @param {string} [options.contextRoot] expliziter Arbeitsbereich (z.B. fuer Tests)
 * @returns {{ok: true, indexPath: string, relPath: string, action: 'angelegt'|'aktualisiert'}
 *   |{ok: false, message: string, warning?: true}}
 */
function updateIndexEntry(vorhabenContextFilePath, options = {}) {
  let contextRoot;
  try {
    contextRoot = options.contextRoot
      ? path.resolve(options.contextRoot)
      : resolveKurspilotContextRoot(options);
  } catch (error) {
    return { ok: false, message: error.message };
  }

  const resolvedFile = path.resolve(vorhabenContextFilePath);
  let main;
  try {
    main = readFrontmatterFile(resolvedFile);
  } catch (error) {
    return { ok: false, message: error.message };
  }

  const relPath = formatPortableRelativePath(path.relative(contextRoot, path.dirname(resolvedFile)));
  const indexPath = path.join(contextRoot, 'index.md');
  const existingContent = fs.existsSync(indexPath)
    ? fs.readFileSync(indexPath, 'utf8')
    : '# Thematischer Index\n';

  let analysis;
  try {
    analysis = analyzeIndex(existingContent);
  } catch (error) {
    return {
      ok: false,
      warning: true,
      message: `index.md ist nicht lesbar oder widerspruechlich: ${error.message} Der Index wurde nicht veraendert.`,
    };
  }

  const { lines } = analysis;
  const existingEntry = analysis.entries.get(relPath);
  const action = existingEntry ? 'aktualisiert' : 'angelegt';
  if (existingEntry) {
    removeEntryBlock(lines, existingEntry);
  }

  insertHeadingIfMissing(lines, HEADING_AKTIV, HEADING_ARCHIV);
  insertHeadingIfMissing(lines, HEADING_ARCHIV, null);

  const targetHeading = main.data.status === 'aktiv' ? HEADING_AKTIV : HEADING_ARCHIV;
  const entryBlock = buildEntryBlock(relPath, {
    title: main.data.title,
    about: main.data.about,
    gradeLevel: main.data.gradeLevel,
    tags: main.data.tags,
    status: main.data.status,
    kurzbeschreibung: extractKurzbeschreibung(main.body),
    license: main.data.license,
  });
  insertEntryAfterHeading(lines, targetHeading, entryBlock);

  const newContent = `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
  fs.writeFileSync(indexPath, newContent, 'utf8');

  return { ok: true, indexPath, relPath, action };
}

module.exports = {
  updateIndexEntry,
};
