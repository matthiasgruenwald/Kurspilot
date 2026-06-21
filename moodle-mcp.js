#!/usr/bin/env node
/**
 * moodle-mcp.js
 * MCP stdio server – verbindet Claude Desktop mit der Moodle REST API
 *
 * Konfiguration: Umgebungsvariablen oder direkt unten eintragen
 */

const { createMoodleClient } = require('./lib/moodle-client');
const { CORE_TOOLS, CORE_READ_ONLY_TOOL_NAMES, executeCoreTool, isCoreTool } = require('./lib/core-tools');
const { PAGE_TOOLS, executePageTool, isPageTool } = require('./lib/page-tools');
const { LABEL_TOOLS, executeLabelTool, isLabelTool } = require('./lib/label-tools');
const { URL_TOOLS, executeUrlTool, isUrlTool } = require('./lib/url-tools');
const { ASSIGN_TOOLS, executeAssignTool, isAssignTool } = require('./lib/assign-tools');

const MOODLE_URL   = process.env.MOODLE_URL   || process.argv[2] || "";
const MOODLE_TOKEN = process.env.MOODLE_TOKEN  || process.argv[3] || "";
const MCP_PROFILE  = process.env.MOODLE_MCP_PROFILE || "full";

if (!MOODLE_URL || !MOODLE_TOKEN) {
  process.stderr.write(
    "Fehler: MOODLE_URL und MOODLE_TOKEN müssen gesetzt sein.\n" +
    "Entweder als Umgebungsvariable oder als Argument:\n" +
    "  node moodle-mcp.js https://moodle.example.de/moodle DEIN_TOKEN\n"
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Moodle REST API Hilfsfunktion (geteilt mit moodle-mcp-core.js)
// ─────────────────────────────────────────────────────────────
const { callMoodle } = createMoodleClient(MOODLE_URL, MOODLE_TOKEN);

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

// ─────────────────────────────────────────────────────────────
// Tool-Definitionen
// ─────────────────────────────────────────────────────────────
const TOOLS = [
  // Page-, Label-, URL-, Assign-Tools (Issue #90): aktivitaetsspezifische
  // Tools, geteilt mit den eigenstaendigen moodle-mcp-page.js,
  // moodle-mcp-label.js, moodle-mcp-url.js, moodle-mcp-assign.js
  ...LABEL_TOOLS,
  ...URL_TOOLS,
  ...PAGE_TOOLS,
  ...ASSIGN_TOOLS,
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
    description: "Legt eine Fragenbank-Kategorie in der ausgewaehlten benannten Kurs-/Projekt-Fragensammlung an (oder gibt eine bereits vorhandene gleichnamige Kategorie zurueck – idempotent, keine Dubletten). Namenskonvention: '<Nummer des Inhaltsabschnitts> <Titel>', z.B. '7.2 Stoffe und ihre Eigenschaften' – passend zum gleichnamigen Kursabschnitt.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:       { type: "number", description: "Kurs-ID" },
        questionbankid: { type: "number", description: "ID der benannten Fragensammlung (CMID) aus moodle_ensure_question_bank" },
        name:           { type: "string", description: "Name der Kategorie, z.B. '7.2 Stoffe und ihre Eigenschaften'" },
        parent:         { type: "number", description: "ID der übergeordneten Kategorie (0 = direkt unter der Top-Kategorie der ausgewaehlten Fragensammlung, Standard)", default: 0 },
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
    description: "Legt eine Multiple-Choice-Frage in einer Fragenbank-Kategorie an. V1: genau eine richtige Antwort (correctindex zeigt darauf), variable Anzahl Antwort-Optionen (mind. 2), Antworten werden gemischt, richtig/falsch-Bewertung ohne Teilpunkte. Liefert questionid + questionbankentryid + version=1 zurück.",
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
    description: "Aktualisiert eine MC-Frage als NEUE Moodle-Version derselben Frage (ADR-0001): gleiche questionbankentryid, neue question-Zeile, neue question_versions-Zeile (max+1). Die alte Version bleibt für bestehende Quiz-Attempts gültig. Vor dem Aufruf moodle_get_question nutzen, um die richtige questionid zu finden.",
    inputSchema: {
      type: "object",
      properties: {
        questionid:      { type: "number", description: "questionid der aktuellen (latest) Version der Frage (aus moodle_get_question)" },
        name:            { type: "string", description: "Name der Frage (i.d.R. unverändert)" },
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
    description: "Liefert die latest version einer Frage in einer Kategorie – eindeutig identifiziert per Name ODER per questionid. Vor einem Edit (moodle_update_mc_question) aufrufen, um die aktuelle questionid und questionbankentryid zu kennen.",
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
  // Core-Tools (Issue #89): aktivitaetsunabhaengige Sections/Module/Completion/
  // Restriction/Katalog-Tools, geteilt mit dem eigenstaendigen moodle-mcp-core.js
  ...CORE_TOOLS,
];

const { optionsToFormParams, validateMcQuestionInput } = require('./lib/mc-question');

const READ_ONLY_TOOL_NAMES = new Set([
  "moodle_get_modules",
  "moodle_get_sections",
  "moodle_get_course_catalog",
  "moodle_get_question_categories",
  "moodle_get_question",
]);

function isReadOnlyProfile() {
  return MCP_PROFILE === "readonly" || MCP_PROFILE === "read-only";
}

function toolsForProfile() {
  if (!isReadOnlyProfile()) return TOOLS;
  return TOOLS.filter(tool => READ_ONLY_TOOL_NAMES.has(tool.name));
}

// ─────────────────────────────────────────────────────────────
// Tool-Ausführung
// ─────────────────────────────────────────────────────────────
async function executeTool(name, args) {
  if (isReadOnlyProfile() && !READ_ONLY_TOOL_NAMES.has(name)) {
    throw new Error(`Tool ${name} ist im read-only Moodle-MCP-Profil nicht verfuegbar.`);
  }

  if (isCoreTool(name)) {
    return await executeCoreTool(callMoodle, name, args);
  }

  if (isLabelTool(name)) {
    return await executeLabelTool(callMoodle, name, args);
  }

  if (isUrlTool(name)) {
    return await executeUrlTool(callMoodle, name, args);
  }

  if (isPageTool(name)) {
    return await executePageTool(callMoodle, name, args);
  }

  if (isAssignTool(name)) {
    return await executeAssignTool(callMoodle, name, args);
  }

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
      throw new Error(`Unbekanntes Tool: ${name}`);
  }
}

// ─────────────────────────────────────────────────────────────
// MCP stdio Protokoll
// ─────────────────────────────────────────────────────────────
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function handleRequest(req) {
  const { id, method, params } = req;

  // initialize
  if (method === "initialize") {
    send({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "moodle-mcp", version: "1.0.0" },
      },
    });
    return;
  }

  // tools/list
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: toolsForProfile() } });
    return;
  }

  // tools/call
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    executeTool(name, args)
      .then(result => {
        send({
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      })
      .catch(err => {
        send({
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: `Fehler: ${err.message}` }],
            isError: true,
          },
        });
      });
    return;
  }

  // notifications (keine Antwort nötig)
  if (method && method.startsWith("notifications/")) return;

  // unbekannte Methode
  send({
    jsonrpc: "2.0", id,
    error: { code: -32601, message: `Methode nicht gefunden: ${method}` },
  });
}

// ─────────────────────────────────────────────────────────────
// stdin lesen
// ─────────────────────────────────────────────────────────────
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop(); // letztes (unvollständiges) Element behalten
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      handleRequest(JSON.parse(trimmed));
    } catch (e) {
      // JSON-Parse-Fehler ignorieren
    }
  }
});

process.stdin.on("end", () => process.exit(0));
process.stderr.write("Moodle MCP Server gestartet\n");

// ── set_completion ──────────────────────────────────────────────────────────
// (appended by update 1.0.5)
