'use strict';

/**
 * Quiz-MCP-Tools (Issue #91, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer Quizze (mod_quiz): erstellen, Settings aendern, Fragen
 * hinzufuegen. Die vollen Formularfelder (QUIZ_OVERRIDE_PROPERTIES) wurden
 * bereits in #86 ergaenzt.
 *
 * Reine Verschiebung aus moodle-mcp.js (keine Verhaltensaenderung). Wird von
 * moodle-mcp-quiz.js (eigener stdio-Prozess) UND moodle-mcp.js (bestehender
 * Rest-MCP, vorerst weiter mit ausgeliefert) genutzt, um Code-Duplikation zu
 * vermeiden.
 */

// ─────────────────────────────────────────────────────────────
// Quiz-Settings-Overrides (#86): einzeln setzbare Felder, die den
// Modus-Default (mini-check/lernstandscheck/abschlusstest) gezielt
// überschreiben. Sentinel '' (String) bzw. -1 (Int) = Modus-Default
// verwenden. Geteilt zwischen moodle_create_quiz und
// moodle_update_quiz_settings, deckungsgleich mit
// create_quiz::overridable_field_params() im Plugin.
// ─────────────────────────────────────────────────────────────
const QUIZ_OVERRIDE_PROPERTIES = {
  preferredbehaviour: { type: "string", description: "Frageverhalten, z.B. 'deferredfeedback', 'immediatecbm', 'deferredcbm'. '' = Modus-Default verwenden.", default: "" },
  navmethod:          { type: "string", enum: ["", "free", "sequential"], description: "Navigationsmethode: 'free' oder 'sequential'. '' = Modus-Default verwenden.", default: "" },
  questionsperpage:   { type: "number", description: "Fragen pro Seite (0 = alle auf einer Seite). -1 = Modus-Default verwenden.", default: -1 },
  attempts:           { type: "number", description: "Maximale Versuchsanzahl (0 = unbegrenzt). -1 = Modus-Default verwenden.", default: -1 },
  attemptonlast:      { type: "number", description: "Neuer Versuch baut auf letztem auf (1) oder nicht (0). -1 = Modus-Default verwenden.", default: -1 },
  grademethod:        { type: "number", description: "Bewertungsmethode (1=Höchste Bewertung, 2=Durchschnittsbewertung, 3=Erster Versuch, 4=Letzter Versuch). -1 = Modus-Default verwenden.", default: -1 },
  delay1:             { type: "number", description: "Wartezeit in Sekunden zwischen 1. und 2. Versuch. -1 = Modus-Default verwenden.", default: -1 },
  delay2:             { type: "number", description: "Wartezeit in Sekunden zwischen weiteren Versuchen. -1 = Modus-Default verwenden.", default: -1 },
  shuffleanswers:     { type: "number", description: "Antworten gemischt anzeigen (1) oder nicht (0). -1 = Modus-Default verwenden.", default: -1 },
  decimalpoints:      { type: "number", description: "Anzahl Nachkommastellen bei der Bewertung. -1 = Modus-Default verwenden.", default: -1 },
  completion:         { type: "number", description: "Abschlussverfolgung: 0=keine, 1=manuell, 2=automatisch. -1 = Modus-Default verwenden.", default: -1 },
  completionusegrade: { type: "number", description: "Abschluss bei erreichter Bewertung (1) oder nicht (0). -1 = Modus-Default verwenden.", default: -1 },
  completionpassgrade:{ type: "number", description: "Abschluss erst bei Bestehensgrenze (1) oder nicht (0). -1 = Modus-Default verwenden.", default: -1 },
  reviewattempt:          { type: "number", description: "Review-Bitmaske: Versuch einsehen. -1 = Modus-Default verwenden.", default: -1 },
  reviewcorrectness:      { type: "number", description: "Review-Bitmaske: Richtig/Falsch einsehen. -1 = Modus-Default verwenden.", default: -1 },
  reviewmaxmarks:         { type: "number", description: "Review-Bitmaske: Maximalpunktzahl einsehen. -1 = Modus-Default verwenden.", default: -1 },
  reviewmarks:            { type: "number", description: "Review-Bitmaske: Punkte einsehen. -1 = Modus-Default verwenden.", default: -1 },
  reviewspecificfeedback: { type: "number", description: "Review-Bitmaske: Spezifisches Feedback einsehen. -1 = Modus-Default verwenden.", default: -1 },
  reviewgeneralfeedback:  { type: "number", description: "Review-Bitmaske: Allgemeines Feedback einsehen. -1 = Modus-Default verwenden.", default: -1 },
  reviewrightanswer:      { type: "number", description: "Review-Bitmaske: Richtige Antwort einsehen. -1 = Modus-Default verwenden.", default: -1 },
  reviewoverallfeedback:  { type: "number", description: "Review-Bitmaske: Gesamtfeedback einsehen. -1 = Modus-Default verwenden.", default: -1 },
  overallfeedbacktextpass: { type: "string", description: "Gesamtfeedback-Text bei Bestehen (überschreibt Modus-Default-Text). '' = Modus-Default verwenden.", default: "" },
  overallfeedbacktextfail: { type: "string", description: "Gesamtfeedback-Text bei Nichtbestehen (überschreibt Modus-Default-Text). '' = Modus-Default verwenden.", default: "" },
};

// Übernimmt alle QUIZ_OVERRIDE_PROPERTIES-Felder aus args mit ihrem
// Sentinel-Default ('' bzw. -1), sodass nicht angegebene Felder beim
// Plugin als "Modus-Default verwenden" ankommen.
function quizOverrideArgs(args) {
  const overrides = {};
  for (const [field, schema] of Object.entries(QUIZ_OVERRIDE_PROPERTIES)) {
    overrides[field] = args[field] ?? schema.default;
  }
  return overrides;
}

const QUIZ_TOOLS = [
  {
    name: "moodle_create_quiz",
    description: "Erstellt ein Quiz (mod_quiz) in einem Kursabschnitt. Modus wählt eine komplette Kurspilot-Settings-Kombination: 'mini-check' (kurzer Kompetenzcheck, direkte Auswertung mit Selbsteinschätzung), 'lernstandscheck' (Default, spätere Auswertung mit Selbsteinschätzung und Lernplanung) oder 'abschlusstest' (Abschlusstest mit Verbesserungsmöglichkeit, keine Klassenarbeit). Alle weiteren Felder sind optional und überschreiben gezielt den jeweiligen Modus-Default. Fragen müssen anschließend separat zum Quiz hinzugefügt werden.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Titel des Quiz" },
        intro:      { type: "string", description: "Beschreibung/Anleitung des Quiz (HTML, optional)", default: "" },
        mode:       { type: "string", enum: ["mini-check", "lernstandscheck", "abschlusstest"], description: "Quizmodus. 'mini-check', 'lernstandscheck' (Default) oder 'abschlusstest'. Nicht 'test' verwenden.", default: "lernstandscheck" },
        gradepass:  { type: "number", description: "Bestehensgrenze in Prozent (0-100). 0 = Modus-Default verwenden (80 bei allen Kurspilot-Quizmodi).", default: 0 },
        timelimit:  { type: "number", description: "Zeitlimit in Sekunden (0 = unbegrenzt / Modus-Default).", default: 0 },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
        ...QUIZ_OVERRIDE_PROPERTIES,
      },
      required: ["courseid", "sectionnum", "name"],
    },
  },
  {
    name: "moodle_update_quiz_settings",
    description: "Aktualisiert ein bestehendes Quiz (mod_quiz) auf eine Kurspilot-Settings-Kombination: Frageverhalten, Layout, Navigation, Versuche, Wartezeiten, Bewertungsmethode, Review-Optionen, Gesamtfeedback, Bestehensgrenze und Abschlussbedingungen. Alle weiteren Felder sind optional und überschreiben gezielt den jeweiligen Modus-Default.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:      { type: "number", description: "Course Module ID des Quiz" },
        mode:      { type: "string", enum: ["mini-check", "lernstandscheck", "abschlusstest"], description: "Quizmodus. 'mini-check', 'lernstandscheck' (Default) oder 'abschlusstest'.", default: "lernstandscheck" },
        gradepass: { type: "number", description: "Bestehensgrenze in Prozent (0-100). 0 = Modus-Default verwenden (80 bei allen Kurspilot-Quizmodi).", default: 0 },
        timelimit: { type: "number", description: "Zeitlimit in Sekunden (0 = unbegrenzt / Modus-Default).", default: 0 },
        ...QUIZ_OVERRIDE_PROPERTIES,
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_add_questions_to_quiz",
    description: "Fügt Fragenbank-Fragen (#9) zu einem Quiz (#6) hinzu – als Referenz auf die jeweils aktuellste Version (version=null, ADR-0001). Reihenfolge der Fragen im Quiz folgt questionids[]. Bereits enthaltene Fragen (gleiche questionbankentryid) werden übersprungen statt dupliziert. Liefert den aktuellen Quiz-Inhalt (slots) mit der jeweils aktuellsten questionid zurück.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:        { type: "number", description: "Course module ID des Quiz (aus moodle_create_quiz)" },
        questionids: { type: "array", items: { type: "number" }, description: "questionid (latest version, aus moodle_create_mc_question/moodle_get_question) je Frage, in gewünschter Quiz-Reihenfolge" },
      },
      required: ["cmid", "questionids"],
    },
  },
];

const QUIZ_TOOL_NAMES = new Set(QUIZ_TOOLS.map(tool => tool.name));

const QUIZ_READ_ONLY_TOOL_NAMES = new Set();

/**
 * Fuehrt ein Quiz-Tool aus. Wirft, falls `name` kein Quiz-Tool ist - der
 * Aufrufer (moodle-mcp.js bzw. moodle-mcp-quiz.js) entscheidet per
 * isQuizTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeQuizTool(callMoodle, name, args) {
  switch (name) {

    case "moodle_create_quiz": {
      return await callMoodle("local_aicoursecreator_create_quiz", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name,
        intro:      args.intro     || "",
        mode:       args.mode      || "lernstandscheck",
        gradepass:  args.gradepass ?? 0,
        timelimit:  args.timelimit ?? 0,
        visible:    args.visible   ?? 1,
        ...quizOverrideArgs(args),
      });
    }

    case "moodle_update_quiz_settings": {
      return await callMoodle("local_aicoursecreator_update_quiz_settings", {
        cmid:      args.cmid,
        mode:      args.mode      || "lernstandscheck",
        gradepass: args.gradepass ?? 0,
        timelimit: args.timelimit ?? 0,
        ...quizOverrideArgs(args),
      });
    }

    case "moodle_add_questions_to_quiz": {
      if (!Array.isArray(args.questionids) || args.questionids.length === 0) {
        throw new Error("moodle_add_questions_to_quiz: questionids darf nicht leer sein.");
      }
      return await callMoodle("local_aicoursecreator_add_questions_to_quiz", {
        cmid: args.cmid,
        ...Object.fromEntries(args.questionids.map((id, i) => [`questionids[${i}]`, id])),
      });
    }

    default:
      throw new Error(`Unbekanntes Quiz-Tool: ${name}`);
  }
}

function isQuizTool(name) {
  return QUIZ_TOOL_NAMES.has(name);
}

function isQuizReadOnlyTool(name) {
  return QUIZ_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  QUIZ_OVERRIDE_PROPERTIES,
  quizOverrideArgs,
  QUIZ_TOOLS,
  QUIZ_TOOL_NAMES,
  QUIZ_READ_ONLY_TOOL_NAMES,
  executeQuizTool,
  isQuizTool,
  isQuizReadOnlyTool,
};
