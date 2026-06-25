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
  },
];

const QUESTION_BANK_TOOL_NAMES = new Set(QUESTION_BANK_TOOLS.map(tool => tool.name));

const QUESTION_BANK_READ_ONLY_TOOL_NAMES = new Set([
  'moodle_get_question_categories',
  'moodle_get_question',
]);

async function executeQuestionBankTool(callMoodle, name, args) {
  switch (name) {

    case "moodle_create_question_category": {
      return await callMoodle("local_aicoursecreator_create_question_category", {
        courseid:       args.courseid,
        questionbankid: args.questionbankid,
        name:           args.name,
        parent:         args.parent ?? 0,
      });
    }

    case "moodle_get_question_categories": {
      return await callMoodle("local_aicoursecreator_get_question_categories", {
        courseid:       args.courseid,
        questionbankid: args.questionbankid,
      });
    }

    case "moodle_update_question_category": {
      return await callMoodle("local_aicoursecreator_update_question_category", {
        courseid:       args.courseid,
        categoryid:     args.categoryid,
        questionbankid: args.questionbankid,
        name:           args.name || "",
        parent:         args.parent ?? 0,
      });
    }

    case "moodle_ensure_question_bank": {
      return await callMoodle("local_aicoursecreator_ensure_question_bank", {
        courseid: args.courseid,
        name:     args.name,
      });
    }

    case "moodle_create_mc_question": {
      validateMcQuestionInput(args);
      return await callMoodle("local_aicoursecreator_create_mc_question", {
        categoryid:      args.categoryid,
        name:            args.name,
        questiontext:    args.questiontext,
        correctindex:    args.correctindex,
        defaultmark:     args.defaultmark ?? 1.0,
        generalfeedback: args.generalfeedback || "",
        ...optionsToFormParams(args.options),
      });
    }

    case "moodle_update_mc_question": {
      validateMcQuestionInput(args);
      return await callMoodle("local_aicoursecreator_update_mc_question", {
        questionid:      args.questionid,
        name:            args.name,
        questiontext:    args.questiontext,
        correctindex:    args.correctindex,
        defaultmark:     args.defaultmark ?? 1.0,
        generalfeedback: args.generalfeedback || "",
        ...optionsToFormParams(args.options),
      });
    }

    case "moodle_get_question": {
      if (!args.name && !args.questionid) {
        throw new Error("moodle_get_question: name oder questionid muss angegeben werden.");
      }
      return await callMoodle("local_aicoursecreator_get_question", {
        categoryid: args.categoryid,
        name:       args.name || "",
        questionid: args.questionid ?? 0,
      });
    }

    default:
      throw new Error(`Unbekanntes Fragensammlungs-Tool: ${name}`);
  }
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
