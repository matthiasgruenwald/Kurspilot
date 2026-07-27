'use strict';

/**
 * Fragensammlungs-MCP-Tools (Issue #92, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer benannte Kurs-/Projekt-Fragensammlungen, Fragenkategorien und
 * Multiple-Choice-Fragen. Reine Verschiebung aus moodle-mcp.js (keine
 * Verhaltensaenderung). Wird von moodle-mcp-question-bank.js (eigener
 * stdio-Prozess) UND moodle-mcp.js (bestehender Rest-MCP, vorerst weiter mit
 * ausgeliefert) genutzt, um Code-Duplikation zu vermeiden.
 */

const { optionsToFormParams, validateMcQuestionInput } = require('./mc-question');
const { dispatchTool } = require('./tool-registry');

const QUESTION_BANK_MCP_METADATA = Object.freeze({
  id: 'fragensammlung',
  label: 'Fragensammlung',
  dependsOn: [],
  independentlyLoadable: true,
});

const QUESTION_BANK_TOOLS = [
  {
    name: "moodle_ensure_question_bank",
    description: "Legt eine benannte Kurs-/Projekt-Fragensammlung im Kurs an oder waehlt eine gleichnamige bestehende aus (idempotent). Der Name soll fuer Lehrkraefte lesbar sein und sich an Kurs, Thema oder fachlichem Inhalt orientieren.",
    inputSchema: {
      type: "object",
      properties: {
        courseid: { type: "number", description: "Kurs-ID" },
        name:     { type: "string", description: "Name der Fragensammlung, z.B. 'Biologie 9a - Immunsystem'" },
      },
      required: ["courseid", "name"],
    },
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_ensure_question_bank", {
        courseid: args.courseid,
        name:     args.name,
      });
    },
  },
  {
    name: "moodle_create_question_category",
    description: "Legt eine Fragenbank-Kategorie in der ausgewaehlten benannten Kurs-/Projekt-Fragensammlung an (oder gibt eine bereits vorhandene gleichnamige Kategorie zurueck - idempotent, keine Dubletten). Namenskonvention: '<Nummer des Inhaltsabschnitts> <Titel>', z.B. '7.2 Stoffe und ihre Eigenschaften' - passend zum gleichnamigen Kursabschnitt.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:       { type: "number", description: "Kurs-ID" },
        questionbankid: { type: "number", description: "ID der benannten Fragensammlung (CMID) aus moodle_ensure_question_bank" },
        name:           { type: "string", description: "Name der Kategorie, z.B. '7.2 Stoffe und ihre Eigenschaften'" },
        parent:         { type: "number", description: "ID der uebergeordneten Kategorie (0 = direkt unter der Top-Kategorie der ausgewaehlten Fragensammlung, Standard)", default: 0 },
      },
      required: ["courseid", "questionbankid", "name"],
    },
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_create_question_category", {
        courseid:       args.courseid,
        questionbankid: args.questionbankid,
        name:           args.name,
        parent:         args.parent ?? 0,
      });
    },
  },
  {
    name: "moodle_get_question_categories",
    description: "Listet alle Fragenbank-Kategorien der ausgewaehlten benannten Kurs-/Projekt-Fragensammlung (inkl. der Top-Kategorie) mit id, Name und uebergeordneter Kategorie-ID.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:       { type: "number", description: "Kurs-ID" },
        questionbankid: { type: "number", description: "ID der benannten Fragensammlung (CMID) aus moodle_ensure_question_bank" },
      },
      required: ["courseid", "questionbankid"],
    },
    readOnly: true,
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_get_question_categories", {
        courseid:       args.courseid,
        questionbankid: args.questionbankid,
      });
    },
  },
  {
    name: "moodle_update_question_category",
    description: "Benennt eine Fragenbank-Kategorie um und/oder verschiebt sie in eine andere benannte Kurs-/Projekt-Fragensammlung bzw. unter eine andere Zielkategorie. Nicht-destruktiv: Fragen und Unterkategorien bleiben erhalten, es gibt kein Delete-Verhalten.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:       { type: "number", description: "Kurs-ID des Zielkurses" },
        categoryid:     { type: "number", description: "ID der zu verschiebenden oder umzubenennenden Kategorie" },
        questionbankid: { type: "number", description: "ID der Ziel-Fragensammlung (CMID) aus moodle_ensure_question_bank" },
        name:           { type: "string", description: "Neuer Kategoriename (leer oder weglassen = bisherigen Namen beibehalten)", default: "" },
        parent:         { type: "number", description: "ID der Ziel-Oberkategorie innerhalb der Ziel-Fragensammlung (0 = Top-Kategorie der Ziel-Fragensammlung)", default: 0 },
      },
      required: ["courseid", "categoryid", "questionbankid"],
    },
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_update_question_category", {
        courseid:       args.courseid,
        categoryid:     args.categoryid,
        questionbankid: args.questionbankid,
        name:           args.name || "",
        parent:         args.parent ?? 0,
      });
    },
  },
  {
    name: "moodle_create_mc_question",
    description: "Legt eine Multiple-Choice-Frage in einer Fragenbank-Kategorie an. V1: genau eine richtige Antwort (correctindex zeigt darauf), variable Anzahl Antwort-Optionen (mind. 2), Antworten werden gemischt, richtig/falsch-Bewertung ohne Teilpunkte. Liefert questionid + questionbankentryid + version=1 zurueck.",
    inputSchema: {
      type: "object",
      properties: {
        categoryid:      { type: "number", description: "ID der Fragenbank-Kategorie (aus moodle_get_question_categories oder moodle_create_question_category)" },
        name:            { type: "string", description: "Eindeutiger Name der Frage innerhalb der Kategorie" },
        questiontext:    { type: "string", description: "Fragetext (HTML)" },
        options:         { type: "array", items: { type: "string" }, description: "Antwort-Optionen als HTML-Strings (mind. 2)" },
        correctindex:    { type: "number", description: "0-basierter Index der richtigen Antwort in options[]" },
        defaultmark:     { type: "number", description: "Standard-Punktzahl der Frage", default: 1.0 },
        generalfeedback: { type: "string", description: "Allgemeines Feedback (HTML, optional)", default: "" },
      },
      required: ["categoryid", "name", "questiontext", "options", "correctindex"],
    },
    async handler(args, callMoodle) {
      validateMcQuestionInput(args);
      return await callMoodle("local_coursepilot_create_mc_question", {
        categoryid:      args.categoryid,
        name:            args.name,
        questiontext:    args.questiontext,
        correctindex:    args.correctindex,
        defaultmark:     args.defaultmark ?? 1.0,
        generalfeedback: args.generalfeedback || "",
        ...optionsToFormParams(args.options),
      });
    },
  },
  {
    name: "moodle_update_mc_question",
    description: "Aktualisiert eine MC-Frage als NEUE Moodle-Version derselben Frage (ADR-0001): gleiche questionbankentryid, neue question-Zeile, neue question_versions-Zeile (max+1). Die alte Version bleibt fuer bestehende Quiz-Attempts gueltig. Vor dem Aufruf moodle_get_question nutzen, um die richtige questionid zu finden.",
    inputSchema: {
      type: "object",
      properties: {
        questionid:      { type: "number", description: "questionid der aktuellen (latest) Version der Frage (aus moodle_get_question)" },
        name:            { type: "string", description: "Name der Frage (i.d.R. unveraendert)" },
        questiontext:    { type: "string", description: "Neuer Fragetext (HTML)" },
        options:         { type: "array", items: { type: "string" }, description: "Antwort-Optionen als HTML-Strings (mind. 2)" },
        correctindex:    { type: "number", description: "0-basierter Index der richtigen Antwort in options[]" },
        defaultmark:     { type: "number", description: "Standard-Punktzahl der Frage", default: 1.0 },
        generalfeedback: { type: "string", description: "Allgemeines Feedback (HTML, optional)", default: "" },
      },
      required: ["questionid", "name", "questiontext", "options", "correctindex"],
    },
    async handler(args, callMoodle) {
      validateMcQuestionInput(args);
      return await callMoodle("local_coursepilot_update_mc_question", {
        questionid:      args.questionid,
        name:            args.name,
        questiontext:    args.questiontext,
        correctindex:    args.correctindex,
        defaultmark:     args.defaultmark ?? 1.0,
        generalfeedback: args.generalfeedback || "",
        ...optionsToFormParams(args.options),
      });
    },
  },
  {
    name: "moodle_get_question",
    description: "Liefert die latest version einer Frage in einer Kategorie - eindeutig identifiziert per Name ODER per questionid. Vor einem Edit (moodle_update_mc_question) aufrufen, um die aktuelle questionid und questionbankentryid zu kennen.",
    inputSchema: {
      type: "object",
      properties: {
        categoryid: { type: "number", description: "ID der Fragenbank-Kategorie" },
        name:       { type: "string", description: "Name der Frage (alternativ zu questionid)", default: "" },
        questionid: { type: "number", description: "questionid einer beliebigen Version der Frage (alternativ zu name)", default: 0 },
      },
      required: ["categoryid"],
    },
    readOnly: true,
    async handler(args, callMoodle) {
      if (!args.name && !args.questionid) {
        throw new Error("moodle_get_question: name oder questionid muss angegeben werden.");
      }
      return await callMoodle("local_coursepilot_get_question", {
        categoryid: args.categoryid,
        name:       args.name || "",
        questionid: args.questionid ?? 0,
      });
    },
  },
];

const QUESTION_BANK_TOOL_NAMES = new Set(QUESTION_BANK_TOOLS.map(tool => tool.name));

const QUESTION_BANK_READ_ONLY_TOOL_NAMES = new Set(
  QUESTION_BANK_TOOLS.filter(tool => tool.readOnly).map(tool => tool.name)
);

async function executeQuestionBankTool(callMoodle, name, args) {
  return await dispatchTool(
    QUESTION_BANK_TOOLS,
    name,
    args,
    callMoodle,
    `Unbekanntes Fragensammlungs-Tool: ${name}`
  );
}

function isQuestionBankTool(name) {
  return QUESTION_BANK_TOOL_NAMES.has(name);
}

function isQuestionBankReadOnlyTool(name) {
  return QUESTION_BANK_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  QUESTION_BANK_MCP_METADATA,
  QUESTION_BANK_TOOLS,
  QUESTION_BANK_TOOL_NAMES,
  QUESTION_BANK_READ_ONLY_TOOL_NAMES,
  executeQuestionBankTool,
  isQuestionBankTool,
  isQuestionBankReadOnlyTool,
};
