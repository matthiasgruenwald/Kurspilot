/**
 * journal.js
 *
 * Journal-Modul: datierte Markdown-Protokolle im lokalen Kontext (siehe
 * CONTEXT.md, "Journal", "Umsetzungsbericht", "Offene Nacharbeit",
 * "Fortsetzen-Routine"). Reine Datei-/Formatierungslogik, kein Moodle-Zugriff.
 *
 * - journalPath: berechnet den Pfad zur datierten Journal-Datei (analog zu
 *   lib/local-context-paths.js).
 * - appendJournalEntry: erstellt/ergaenzt eine Journal-Datei, ohne bestehende
 *   Eintraege zu ueberschreiben.
 * - recordWorkflowNote: schreibt dokumentationswuerdige Entscheidungen waehrend
 *   der Arbeit append-only ins passende Journal.
 * - formatUmsetzungsbericht: formatiert das Ergebnis von applyPlan()
 *   (lib/implementation-plan.js) als Markdown-Bericht.
 * - findOpenNacharbeit: durchsucht Journal-Dateien nach offenen Punkten im
 *   Abschnitt "Offene Nacharbeit" (Vorschlag, kein Auto-Fix).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getLerngruppenPath,
  getFachprofilPath,
  resolveKurspilotContextRoot,
} = require('./local-context-paths');

/** Erlaubte Werte fuer den `scope`-Parameter von journalPath. */
const JOURNAL_SCOPES = Object.freeze(['klasse', 'unterrichtsordner']);

/** Platzhaltertext fuer Abschnitte ohne Eintraege im Umsetzungsbericht. */
const NONE_PLACEHOLDER = '_(keine)_';

/** Notiztypen, die automatisch auf Klassen- oder Unterrichtsordner-Journal abgebildet werden. */
const WORKFLOW_NOTE_TYPES = Object.freeze({
  LERNGRUPPE: 'lerngruppe',
  UNTERRICHT: 'unterricht',
  MATERIAL: 'material',
  TEST: 'test',
  MOODLE_PLANUNG: 'moodle-planung',
  KONTEXT: 'kontext',
});

const CLASS_NOTE_TYPES = new Set([WORKFLOW_NOTE_TYPES.LERNGRUPPE]);
const SUBJECT_NOTE_TYPES = new Set([
  WORKFLOW_NOTE_TYPES.UNTERRICHT,
  WORKFLOW_NOTE_TYPES.MATERIAL,
  WORKFLOW_NOTE_TYPES.TEST,
  WORKFLOW_NOTE_TYPES.MOODLE_PLANUNG,
]);

// ─────────────────────────────────────────────────────────────
// journalPath
// ─────────────────────────────────────────────────────────────

/**
 * Formatiert ein Datum als "YYYY-MM-DD".
 *
 * @param {string|Date} date `Date`-Objekt (UTC) oder bereits formatierter String
 * @returns {string} Datum im Format YYYY-MM-DD
 */
function formatDate(date) {
  if (date instanceof Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const trimmed = typeof date === 'string' ? date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Datum "${date}" ist ungueltig: erwartet wird "YYYY-MM-DD" oder ein Date-Objekt.`);
  }
  return trimmed;
}

/**
 * Berechnet den Pfad zur datierten Journal-Datei fuer eine Lerngruppe oder
 * einen Unterrichtsordner (siehe lib/local-context-paths.js fuer die
 * zugrundeliegende Ordnerstruktur).
 *
 * @param {object} context
 * @param {string} context.schuljahr z.B. "2025-26"
 * @param {string} context.klasse Klasse oder Lerngruppe, z.B. "7a"
 * @param {string} [context.unterrichtsordner] erforderlich bei scope "unterrichtsordner"
 * @param {'klasse'|'unterrichtsordner'} scope Ablageort der Journal-Datei
 * @param {string|Date} date Datum des Eintrags
 * @returns {string} relativer Pfad zur Journal-Datei, z.B.
 *   "local-context/2025-26/7a/journal-2026-06-11.md"
 */
function journalPath(context, scope, date) {
  const { schuljahr, klasse, unterrichtsordner } = context;
  const fileName = `journal-${formatDate(date)}.md`;

  if (scope === 'klasse') {
    return path.join(getLerngruppenPath(schuljahr, klasse), fileName);
  }

  if (scope === 'unterrichtsordner') {
    if (!unterrichtsordner) {
      throw new Error('Unterrichtsordner muss fuer scope "unterrichtsordner" angegeben werden.');
    }
    return path.join(getFachprofilPath(schuljahr, klasse, unterrichtsordner), fileName);
  }

  throw new Error(`Unbekannter scope "${scope}": erlaubt sind ${JOURNAL_SCOPES.join(', ')}.`);
}

// ─────────────────────────────────────────────────────────────
// appendJournalEntry
// ─────────────────────────────────────────────────────────────

/**
 * Erstellt eine Journal-Datei (mit Header) falls sie noch nicht existiert,
 * und haengt einen neuen Eintrag an. Bestehende Eintraege werden nie
 * ueberschrieben.
 *
 * @param {string} filePath absoluter oder relativer Pfad zur Journal-Datei
 * @param {string} entryMarkdown Markdown-Text des neuen Eintrags
 */
function appendJournalEntry(filePath, entryMarkdown) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const fileName = path.basename(filePath);

  if (!fs.existsSync(filePath)) {
    const header = `# Journal: ${fileName}\n\n`;
    fs.writeFileSync(filePath, header + entryMarkdown.trimEnd() + '\n', 'utf8');
    return;
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(filePath, existing + separator + entryMarkdown.trimEnd() + '\n', 'utf8');
}

// ─────────────────────────────────────────────────────────────
// Entscheidungsnotizen / Dokumentationsroutine
// ─────────────────────────────────────────────────────────────

function requireNonEmptyText(value, label) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return trimmed;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  const trimmed = String(value).trim();
  return trimmed ? [trimmed] : [];
}

/**
 * Entscheidet den Journal-Scope fuer eine dokumentationswuerdige Workflow-Notiz.
 *
 * @param {object} note
 * @param {string} note.type siehe WORKFLOW_NOTE_TYPES
 * @param {object} [context]
 * @param {string} [context.unterrichtsordner]
 * @returns {'klasse'|'unterrichtsordner'}
 */
function chooseWorkflowNoteScope(note, context = {}) {
  const type = note && note.type;

  if (CLASS_NOTE_TYPES.has(type)) {
    return 'klasse';
  }

  if (SUBJECT_NOTE_TYPES.has(type)) {
    return 'unterrichtsordner';
  }

  if (type === WORKFLOW_NOTE_TYPES.KONTEXT) {
    return context.unterrichtsordner ? 'unterrichtsordner' : 'klasse';
  }

  throw new Error(
    `Unbekannter Notiztyp "${type}": erlaubt sind ${Object.values(WORKFLOW_NOTE_TYPES).join(', ')}.`
  );
}

/**
 * Formatiert eine Entscheidungsnotiz fuer das Journal.
 *
 * @param {object} note
 * @param {string} note.type siehe WORKFLOW_NOTE_TYPES
 * @param {string} note.decision geklaerte Entscheidung
 * @param {string} [note.reason] Begruendung oder Kontext der Entscheidung
 * @param {string|string[]} [note.openQuestions] offene Anschlussfragen
 * @param {string|Date} [note.date]
 * @returns {string} Markdown-Eintrag
 */
function formatDecisionNote(note) {
  const type = requireNonEmptyText(note && note.type, 'Notiztyp');
  const decision = requireNonEmptyText(note && note.decision, 'Entscheidung');
  const reason = note && note.reason ? String(note.reason).trim() : '';
  const openQuestions = normalizeList(note && note.openQuestions);
  const date = formatDate((note && note.date) || new Date());

  const lines = [
    `## ${date} Entscheidungsnotiz`,
    '',
    `- Typ: ${type}`,
    `- Entscheidung: ${decision}`,
  ];

  if (reason) {
    lines.push(`- Begruendung: ${reason}`);
  }

  if (openQuestions.length > 0) {
    lines.push('- Offene Anschlussfragen:');
    for (const question of openQuestions) {
      lines.push(`  - ${question}`);
    }
  }

  return lines.join('\n');
}

/**
 * Schreibt eine dokumentationswuerdige Entscheidung append-only ins passende
 * Journal. Der Scope wird aus Notiztyp und Kontext abgeleitet.
 *
 * @param {string|object} contextRoot expliziter Arbeitsbereich oder direkt die Eingabedaten
 * @param {object} input
 * @param {string} input.schuljahr
 * @param {string} input.klasse
 * @param {string} [input.unterrichtsordner]
 * @param {string|Date} [input.date]
 * @param {object} input.note siehe formatDecisionNote
 * @param {object} [options]
 * @returns {{journalPath: string, scope: 'klasse'|'unterrichtsordner', entryMarkdown: string}}
 */
function recordWorkflowNote(contextRoot, input, options) {
  const invocation = typeof contextRoot === 'string'
    ? { contextRoot, input, options: options || {} }
    : { contextRoot: null, input: contextRoot || {}, options: input || {} };
  const root = resolveKurspilotContextRoot({
    contextRoot: invocation.contextRoot,
    readWorkspaceSetting: invocation.options.readWorkspaceSetting,
    workspaceConfigOptions: invocation.options.workspaceConfigOptions,
  });
  const ctx = invocation.input || {};
  const note = ctx.note || {};
  const date = ctx.date || note.date || new Date();
  const scope = chooseWorkflowNoteScope(note, ctx);
  const entryMarkdown = formatDecisionNote({ ...note, date });
  const relJournalPath = journalPath(ctx, scope, date);
  const absJournalPath = path.join(root, relJournalPath);

  appendJournalEntry(absJournalPath, entryMarkdown);

  return {
    journalPath: absJournalPath,
    scope,
    entryMarkdown,
  };
}

// ─────────────────────────────────────────────────────────────
// formatUmsetzungsbericht
// ─────────────────────────────────────────────────────────────

/**
 * Formatiert eine Erfolgszeile fuer eine erstellte Aktivitaet.
 * Zeigt die Moodle-ID (cmid) und - falls vorhanden - einen direkten Link.
 */
function formatCreatedItem(item) {
  const idPart = item.cmid !== undefined ? ` (Moodle-ID ${item.cmid})` : '';
  const linkPart = item.link ? ` - ${item.link}` : '';
  return `- ${item.name}${idPart}${linkPart}`;
}

/**
 * Formatiert eine Fehlerzeile.
 * Erwartet `{ activityName, message }`, akzeptiert aber auch reine Strings.
 */
function formatErrorItem(error) {
  if (typeof error === 'string') {
    return `- ${error}`;
  }
  const namePart = error.activityName ? `${error.activityName}: ` : '';
  return `- ${namePart}${error.message || String(error)}`;
}

/**
 * Formatiert eine Zeile fuer "Offene Nacharbeit".
 * Erwartet einen String oder `{ text }`.
 */
function formatOpenTaskItem(task) {
  if (typeof task === 'string') {
    return `- ${task}`;
  }
  return `- ${task.text || String(task)}`;
}

/**
 * Formatiert das Rueckgabeformat von applyPlan() (lib/implementation-plan.js)
 * als Markdown-Umsetzungsbericht mit den Abschnitten "Erfolge", "Fehler" und
 * "Offene Nacharbeit".
 *
 * `planResult.errors` und `planResult.openTasks` sind optional, da das
 * aktuelle applyPlan() diese Felder noch nicht liefert - der Bericht
 * funktioniert auch dann mit dem Platzhalter "_(keine)_".
 *
 * @param {object} planResult
 * @param {Array<{name: string, cmid?: number|string, link?: string}>} planResult.created
 * @param {Array<{activityName?: string, message?: string}|string>} [planResult.errors]
 * @param {Array<{text?: string}|string>} [planResult.openTasks]
 * @returns {string} Markdown-Bericht
 */
function formatUmsetzungsbericht(planResult) {
  const created = (planResult && planResult.created) || [];
  const errors = (planResult && planResult.errors) || [];
  const openTasks = (planResult && planResult.openTasks) || [];

  const lines = [];

  lines.push('## Erfolge');
  lines.push('');
  if (created.length === 0) {
    lines.push(NONE_PLACEHOLDER);
  } else {
    for (const item of created) {
      lines.push(formatCreatedItem(item));
    }
  }
  lines.push('');

  lines.push('## Fehler');
  lines.push('');
  if (errors.length === 0) {
    lines.push(NONE_PLACEHOLDER);
  } else {
    for (const error of errors) {
      lines.push(formatErrorItem(error));
    }
  }
  lines.push('');

  lines.push('## Offene Nacharbeit');
  lines.push('');
  if (openTasks.length === 0) {
    lines.push(NONE_PLACEHOLDER);
  } else {
    for (const task of openTasks) {
      lines.push(formatOpenTaskItem(task));
    }
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// findOpenNacharbeit (Fortsetzen-Routine)
// ─────────────────────────────────────────────────────────────

/** Erkennt die Ueberschrift eines "Offene Nacharbeit"-Abschnitts (## oder ###). */
const OPEN_NACHARBEIT_HEADING = /^#{2,3}\s+Offene Nacharbeit\s*$/;

/** Erkennt eine beliebige Markdown-Ueberschrift (zum Erkennen des Abschnittsendes). */
const ANY_HEADING = /^#{1,6}\s+/;

/** Erkennt eine Markdown-Listenzeile ("- ..." oder "* ..."). */
const LIST_ITEM = /^[-*]\s+(.*)$/;

/** Versucht, ein Datum im Dateinamen zu finden (journal-YYYY-MM-DD.md). */
function extractDateFromFileName(filePath) {
  const match = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Extrahiert alle Listeneintraege aus "Offene Nacharbeit"-Abschnitten einer
 * einzelnen Journal-Datei. Der Platzhalter "_(keine)_" wird ignoriert.
 *
 * @param {string} content Dateiinhalt
 * @returns {string[]} Liste der Eintragstexte
 */
function extractOpenNacharbeitTexts(content) {
  const lines = content.split('\n');
  const texts = [];
  let inSection = false;

  for (const line of lines) {
    if (OPEN_NACHARBEIT_HEADING.test(line.trim())) {
      inSection = true;
      continue;
    }

    if (inSection && ANY_HEADING.test(line.trim())) {
      inSection = false;
      continue;
    }

    if (!inSection) continue;

    const listMatch = line.trim().match(LIST_ITEM);
    if (listMatch) {
      texts.push(listMatch[1].trim());
      continue;
    }

    if (line.trim() === NONE_PLACEHOLDER) {
      continue;
    }
  }

  return texts;
}

/**
 * Durchsucht eine Liste von Journal-Dateien nach Eintraegen im Abschnitt
 * "Offene Nacharbeit" und liefert eine flache Liste als Vorschlag fuer die
 * Fortsetzen-Routine. Bearbeitet nichts automatisch.
 *
 * @param {string[]} journalFiles absolute oder relative Pfade zu Journal-Dateien
 * @returns {Array<{file: string, date: string|null, text: string}>}
 */
function findOpenNacharbeit(journalFiles) {
  const result = [];

  for (const filePath of journalFiles) {
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const date = extractDateFromFileName(filePath);

    for (const text of extractOpenNacharbeitTexts(content)) {
      result.push({ file: filePath, date, text });
    }
  }

  return result;
}

module.exports = {
  JOURNAL_SCOPES,
  NONE_PLACEHOLDER,
  WORKFLOW_NOTE_TYPES,
  journalPath,
  appendJournalEntry,
  chooseWorkflowNoteScope,
  formatDecisionNote,
  recordWorkflowNote,
  formatUmsetzungsbericht,
  findOpenNacharbeit,
};
