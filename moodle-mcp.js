#!/usr/bin/env node
/**
 * moodle-mcp.js
 * MCP stdio server – verbindet Claude Desktop mit der Moodle REST API
 *
 * Konfiguration: Umgebungsvariablen oder direkt unten eintragen
 */

const fs = require('fs');
const path = require('path');
const { cropImage } = require('./lib/image-crop');
const { createMoodleClient } = require('./lib/moodle-client');
const { CORE_TOOLS, CORE_READ_ONLY_TOOL_NAMES, executeCoreTool, isCoreTool } = require('./lib/core-tools');

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
  {
    name: "moodle_update_label",
    description: "Ändert den HTML-Inhalt und/oder Namen eines bestehenden Text- und Medienfelds (mod_label).",
    inputSchema: {
      type: "object",
      properties: {
        cmid:    { type: "number", description: "Course Module ID des Labels" },
        name:    { type: "string", description: "Anzeigename des Labels in der Kursverwaltung (leer = nicht ändern)" },
        content: { type: "string", description: "Neuer HTML-Inhalt" },
        visible: { type: "number", description: "1 = sichtbar, 0 = versteckt, -1 = nicht ändern", default: -1 },
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_update_url",
    description: "Ändert Name und/oder Ziel-URL eines bestehenden externen Links (mod_url).",
    inputSchema: {
      type: "object",
      properties: {
        cmid:        { type: "number", description: "Course Module ID des Links" },
        name:        { type: "string", description: "Neuer Anzeigename (leer = nicht ändern)" },
        externalurl: { type: "string", description: "Neue URL inkl. https:// (leer = nicht ändern)" },
        intro:       { type: "string", description: "Neue Beschreibung (leer = nicht ändern)" },
        visible:     { type: "number", description: "1 = sichtbar, 0 = versteckt, -1 = nicht ändern", default: -1 },
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_update_page",
    description: "Ändert Titel und/oder HTML-Inhalt einer bestehenden Textseite (mod_page). Benötigt die cmid (aus moodle_get_modules oder dem Rückgabewert von moodle_create_page).",
    inputSchema: {
      type: "object",
      properties: {
        cmid:    { type: "number", description: "Course Module ID der Textseite" },
        name:    { type: "string", description: "Neuer Titel (leer lassen = nicht ändern)" },
        content: { type: "string", description: "Neuer HTML-Inhalt (leer lassen = nicht ändern)" },
        visible: { type: "number", description: "1 = sichtbar, 0 = versteckt, -1 = nicht ändern", default: -1 },
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_update_assign",
    description: "Ändert Titel, Beschreibung und/oder Abgabedatum einer bestehenden Aufgabe (mod_assign). Benötigt die cmid.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:        { type: "number", description: "Course Module ID der Aufgabe" },
        name:        { type: "string", description: "Neuer Titel (leer lassen = nicht ändern)" },
        description: { type: "string", description: "Neue HTML-Beschreibung (leer lassen = nicht ändern)" },
        duedate:     { type: "number", description: "Neues Abgabedatum als Unix-Timestamp (0 = kein Datum, -1 = nicht ändern)", default: -1 },
        visible:     { type: "number", description: "1 = sichtbar, 0 = versteckt, -1 = nicht ändern", default: -1 },
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_crop_image",
    description: "Schneidet eine lokal gespeicherte Bilddatei rechteckig zu und schreibt den Ausschnitt als neue lokale Datei. Danach den zurueckgegebenen filepath z.B. mit moodle_upload_assignfile hochladen.",
    inputSchema: {
      type: "object",
      properties: {
        sourcepath: { type: "string", description: "Absoluter Pfad zur Quellabbildung (PNG/JPG usw.)" },
        destpath:   { type: "string", description: "Absoluter Pfad fuer die zugeschnittene Zieldatei" },
        x:          { type: "number", description: "Linke obere Ecke des Ausschnitts in Pixeln (x)" },
        y:          { type: "number", description: "Linke obere Ecke des Ausschnitts in Pixeln (y)" },
        width:      { type: "number", description: "Breite des Ausschnitts in Pixeln" },
        height:     { type: "number", description: "Hoehe des Ausschnitts in Pixeln" },
      },
      required: ["sourcepath", "destpath", "x", "y", "width", "height"],
    },
  },
  {
    name: "moodle_upload_assignfile",
    description: "Laedt eine lokal gespeicherte Datei (PDF, DOCX, XLSX, PPTX, HTML, PNG, JPG usw.) als 'Zusaetzliche Datei' in eine Moodle-Aufgabe hoch. Claude generiert die Datei zuerst lokal, dann wird sie per Base64 an Moodle uebertragen. Unterstuetzt alle gaengigen Dateiformate.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:     { type: "number", description: "Course Module ID der Aufgabe" },
        filepath: { type: "string", description: "Absoluter Pfad zur lokalen Datei, z.B. C:\\temp\\arbeitsblatt.docx" },
        filename: { type: "string", description: "Dateiname in Moodle (optional, Standard: Dateiname aus filepath)" },
      },
      required: ["cmid", "filepath"],
    },
  },
  {
    name: "moodle_embed_assign_image",
    description: "Laedt eine lokal gespeicherte Bilddatei in den Beschreibungs-Dateibereich einer Moodle-Aufgabe hoch und bindet sie direkt sichtbar in die Aufgabenbeschreibung ein. Fuer zugeschnittene Scans erst moodle_crop_image nutzen, dann den Ausschnitt hier einbetten.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:     { type: "number", description: "Course Module ID der Aufgabe" },
        filepath: { type: "string", description: "Absoluter Pfad zur lokalen Bilddatei" },
        filename: { type: "string", description: "Dateiname in Moodle (optional, Standard: Dateiname aus filepath)" },
        alt:      { type: "string", description: "Alternativtext fuer das Bild", default: "" },
      },
      required: ["cmid", "filepath"],
    },
  },
  {
    name: "moodle_create_page",
    description: "Erstellt eine Textseite (mod_page) in einem Kursabschnitt. NUR für Inhalte die Schüler nur LESEN (Infoblätter, Leitfäden, Phasen-Header).",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Titel der Textseite" },
        content:    { type: "string", description: "HTML-Inhalt der Seite" },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "name", "content"],
    },
  },
  {
    name: "moodle_create_label",
    description: "Erstellt ein Text- und Medienfeld (mod_label) – wird direkt auf der Kursseite angezeigt. Ideal für farbige Phasen-Header (Phase 1 Informieren, Phase 2 Planen usw.).",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Anzeigename in der Kursverwaltung, z.B. 'Phase 1 – Informieren & Analysieren'", default: "" },
        content:    { type: "string", description: "HTML-Inhalt des Labels (z.B. farbiger Phasen-Header)" },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "content"],
    },
  },
  {
    name: "moodle_create_url",
    description: "Erstellt einen Link zu einer externen Webseite (mod_url) in einem Kursabschnitt. Für Dokumentationen, GitHub-Repos, MDN, Arduino-Referenzen usw.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:    { type: "number", description: "Kurs-ID" },
        sectionnum:  { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:        { type: "string", description: "Anzeigename des Links, z.B. 'Dokumentation: Arduino ESP32 (Espressif GitHub)'" },
        externalurl: { type: "string", description: "Vollständige URL inkl. https://" },
        intro:       { type: "string", description: "Kurze Beschreibung des Links (optional)", default: "" },
        visible:     { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "name", "externalurl"],
    },
  },
  {
    name: "moodle_create_assign",
    description: "Erstellt eine Aufgabe (mod_assign) in einem Kursabschnitt. Verwenden wenn Schüler etwas abgeben/ausfüllen sollen (Arbeitsblätter, Reflexionen, Checklisten).",
    inputSchema: {
      type: "object",
      properties: {
        courseid:     { type: "number", description: "Kurs-ID" },
        sectionnum:   { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:         { type: "string", description: "Titel der Aufgabe" },
        description:  { type: "string", description: "HTML-Beschreibung der Aufgabe" },
        duedate:      { type: "number", description: "Abgabedatum als Unix-Timestamp (0 = kein Datum)", default: 0 },
        maxfiles:     { type: "number", description: "Max. Datei-Uploads (1 = Standard, 0 = kein Upload)", default: 1 },
        visible:      { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "name"],
    },
  },
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

  switch (name) {

    case "moodle_update_label": {
      return await callMoodle("local_aicoursecreator_update_label", {
        cmid:    args.cmid,
        name:    args.name ?? "",
        content: args.content || "",
        visible: args.visible ?? -1,
      });
    }

    case "moodle_update_url": {
      return await callMoodle("local_aicoursecreator_update_url", {
        cmid:        args.cmid,
        name:        args.name        || "",
        externalurl: args.externalurl || "",
        intro:       args.intro       || "",
        visible:     args.visible     ?? -1,
      });
    }

    case "moodle_upload_assignfile": {
      const filepath = args.filepath;
      if (!fs.existsSync(filepath)) {
        throw new Error(`Datei nicht gefunden: ${filepath}`);
      }
      const fileBuffer = fs.readFileSync(filepath);
      const base64    = fileBuffer.toString('base64');
      const filename  = args.filename || path.basename(filepath);
      const ext       = path.extname(filename).toLowerCase().slice(1);

      // MIME-Type automatisch bestimmen
      const mimeTypes = {
        'pdf':  'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc':  'application/msword',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls':  'application/vnd.ms-excel',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'ppt':  'application/vnd.ms-powerpoint',
        'html': 'text/html',
        'htm':  'text/html',
        'png':  'image/png',
        'jpg':  'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif':  'image/gif',
        'svg':  'image/svg+xml',
        'txt':  'text/plain',
        'csv':  'text/csv',
        'zip':  'application/zip',
      };
      const mimetype = mimeTypes[ext] || 'application/octet-stream';

      return await callMoodle("local_aicoursecreator_upload_assignfile", {
        cmid:     args.cmid,
        filename: filename,
        content:  base64,
        mimetype: mimetype,
      });
    }

    case "moodle_crop_image": {
      cropImage(
        args.sourcepath,
        {
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
        },
        args.destpath
      );
      return {
        filepath: args.destpath,
        filename: path.basename(args.destpath),
        message: `Bild erfolgreich zugeschnitten: ${args.destpath}`,
      };
    }

    case "moodle_embed_assign_image": {
      const filepath = args.filepath;
      if (!fs.existsSync(filepath)) {
        throw new Error(`Datei nicht gefunden: ${filepath}`);
      }
      const fileBuffer = fs.readFileSync(filepath);
      const base64 = fileBuffer.toString('base64');
      const filename = args.filename || path.basename(filepath);
      const ext = path.extname(filename).toLowerCase().slice(1);
      const mimeTypes = {
        'png':  'image/png',
        'jpg':  'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif':  'image/gif',
        'svg':  'image/svg+xml',
        'webp': 'image/webp',
      };
      const mimetype = mimeTypes[ext] || 'application/octet-stream';

      return await callMoodle("local_aicoursecreator_upload_assign_intro_image", {
        cmid:     args.cmid,
        filename: filename,
        content:  base64,
        mimetype: mimetype,
        alt:      args.alt || "",
      });
    }

    case "moodle_update_page": {
      return await callMoodle("local_aicoursecreator_update_page", {
        cmid:    args.cmid,
        name:    args.name    || "",
        content: args.content || "",
        visible: args.visible ?? -1,
      });
    }

    case "moodle_update_assign": {
      return await callMoodle("local_aicoursecreator_update_assign", {
        cmid:        args.cmid,
        name:        args.name        || "",
        description: args.description || "",
        duedate:     args.duedate     ?? -1,
        visible:     args.visible     ?? -1,
      });
    }

    case "moodle_create_page": {
      return await callMoodle("local_aicoursecreator_create_page", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name,
        content:    args.content,
        visible:    args.visible ?? 1,
      });
    }

    case "moodle_create_label": {
      return await callMoodle("local_aicoursecreator_create_label", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name ?? "",
        content:    args.content,
        visible:    args.visible ?? 1,
      });
    }

    case "moodle_create_url": {
      return await callMoodle("local_aicoursecreator_create_url", {
        courseid:    args.courseid,
        sectionnum:  args.sectionnum,
        name:        args.name,
        externalurl: args.externalurl,
        intro:       args.intro || "",
        visible:     args.visible ?? 1,
      });
    }

    case "moodle_create_assign": {
      return await callMoodle("local_aicoursecreator_create_assign", {
        courseid:    args.courseid,
        sectionnum:  args.sectionnum,
        name:        args.name,
        description: args.description || "",
        duedate:     args.duedate     || 0,
        maxfiles:    args.maxfiles    ?? 1,
        visible:     args.visible     ?? 1,
      });
    }

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
