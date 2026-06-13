#!/usr/bin/env node
/**
 * moodle-mcp.js
 * MCP stdio server – verbindet Claude Desktop mit der Moodle REST API
 *
 * Konfiguration: Umgebungsvariablen oder direkt unten eintragen
 */

const fs = require('fs');
const path = require('path');

const MOODLE_URL   = process.env.MOODLE_URL   || process.argv[2] || "";
const MOODLE_TOKEN = process.env.MOODLE_TOKEN  || process.argv[3] || "";

if (!MOODLE_URL || !MOODLE_TOKEN) {
  process.stderr.write(
    "Fehler: MOODLE_URL und MOODLE_TOKEN müssen gesetzt sein.\n" +
    "Entweder als Umgebungsvariable oder als Argument:\n" +
    "  node moodle-mcp.js https://moodle.example.de/moodle DEIN_TOKEN\n"
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Moodle REST API Hilfsfunktion
// ─────────────────────────────────────────────────────────────
async function callMoodle(wsfunction, params = {}) {
  const body = new URLSearchParams({
    wstoken: MOODLE_TOKEN,
    wsfunction,
    moodlewsrestformat: "json",
    ...params,
  });

  const res = await fetch(`${MOODLE_URL}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();

  if (data && data.exception) {
    throw new Error(`Moodle Fehler: ${data.message} (${data.errorcode})`);
  }
  return data;
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
    name: "moodle_get_modules",
    description: "Gibt alle Aktivitäten eines Kurses oder Abschnitts zurück – mit cmid, Typ und Name. Verwenden um cmids für Update-Aufrufe zu ermitteln.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert, -1 = alle Abschnitte)", default: -1 },
      },
      required: ["courseid"],
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
    name: "moodle_set_completion",
    description: "Aktiviert die Abschlussverfolgung fuer eine Aktivitaet. completion=1: SuS klickt manuell 'Abgeschlossen'. completion=2+completionsubmit=1: automatisch bei Einreichung (nur Aufgaben). completion=2+completionpassgrade=1: automatisch wenn Bestehensgrenze erreicht (nur Module mit gradepass, z.B. Quiz). Muss vor moodle_set_restriction aufgerufen werden.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:                { type: "number", description: "Course Module ID der Aktivitaet" },
        completion:          { type: "number", description: "0=keine, 1=manuell, 2=automatisch", default: 1 },
        completionsubmit:    { type: "number", description: "1=bei Einreichung abschliessen (nur mod_assign)", default: 0 },
        completionpassgrade: { type: "number", description: "1=abgeschlossen sobald Bestehensgrenze erreicht (nur Module mit gradepass, z.B. Quiz). Erfordert completion=2.", default: 0 },
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_set_restriction",
    description: "Sperrt eine Aktivitaet bis Voraussetzungen erfuellt sind. Standardmodus: Liste von cmids die abgeschlossen sein muessen (AND/OR). Spezialmodus condition_type='quiz_passed': Folgeaktivitaet erst sichtbar, wenn das Ziel-Quiz (condition_target_cmid) die Bestehensgrenze erreicht hat (Notenbedingung). Ohne expliziten Aufruf wird keine Sperre gesetzt.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:                  { type: "number", description: "Course Module ID der zu sperrenden Aktivitaet" },
        require_cmids:         { type: "array", items: { type: "number" }, description: "cmids die abgeschlossen sein muessen (Standardmodus). Leer/weglassen fuer condition_type='quiz_passed'." },
        show_locked:           { type: "number", description: "1=ausgegraut anzeigen (Standard), 0=komplett verstecken", default: 1 },
        operator:              { type: "string", description: "AND=alle Bedingungen muessen erfuellt sein, OR=eine reicht", default: "AND" },
        condition_type:        { type: "string", description: "Spezialmodus: '' (Standard, completion-basiert) oder 'quiz_passed' (Notenbedingung Bestehensgrenze)", default: "" },
        condition_target_cmid: { type: "number", description: "Ziel-cmid fuer Spezialmodus (z.B. cmid des Quiz fuer 'quiz_passed'). 0=nicht verwendet.", default: 0 },
      },
      required: ["cmid"],
    },
  },
  {
    name: "moodle_get_sections",
    description: "Gibt alle Abschnitte eines Moodle-Kurses zurück (Name, Nummer, ID).",
    inputSchema: {
      type: "object",
      properties: {
        courseid: { type: "number", description: "Die Kurs-ID (steht in der URL: ?id=XX)" },
      },
      required: ["courseid"],
    },
  },
  {
    name: "moodle_update_section",
    description: "Setzt Name und Beschreibung (HTML) eines Kursabschnitts.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Name des Abschnitts, z.B. 'LS 7.2 – ESP32 Webserver'" },
        summary:    { type: "string", description: "HTML-Inhalt der Abschnittsbeschreibung (Handlungssituation-Card)" },
      },
      required: ["courseid", "sectionnum", "name"],
    },
  },
  {
    name: "moodle_ensure_section",
    description: "Legt einen fehlenden Kursabschnitt bei Bedarf an und setzt optional Name/Beschreibung. Verwenden, wenn moodle_update_section mit invalidrecord scheitert.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Name des Abschnitts" },
        summary:    { type: "string", description: "HTML-Inhalt der Abschnittsbeschreibung" },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum"],
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
    description: "Erstellt ein Quiz (mod_quiz) in einem Kursabschnitt. Modus wählt eine komplette Settings-Kombination: 'lerncheck' (Default, Lernstandscheck: unbegrenzte Versuche, beste Bewertung, deferredfeedback, ~80%), 'intensiv' (Intensiv-Üben: unbegrenzte Versuche, Durchschnittsnote, sofortiges Feedback pro Frage, ~80%), 'bewertung' (Bewertungsmodus: genau ein Versuch, beste Bewertung, deferredfeedback erst nach Schließung, ~50%, Zeitlimit optional). gradepass/timelimit überschreiben den Modus-Default. Fragen müssen anschließend separat zum Quiz hinzugefügt werden.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Titel des Quiz" },
        intro:      { type: "string", description: "Beschreibung/Anleitung des Quiz (HTML, optional)", default: "" },
        mode:       { type: "string", enum: ["lerncheck", "intensiv", "bewertung"], description: "Test-Modus. 'lerncheck' (Default) für Lernstandschecks, 'intensiv' für Intensiv-Üben mit sofortigem Feedback, 'bewertung' für Bewertungsmodus mit einem Versuch.", default: "lerncheck" },
        gradepass:  { type: "number", description: "Bestehensgrenze in Prozent (0-100). 0 = Modus-Default verwenden (~80 bei lerncheck/intensiv, ~50 bei bewertung).", default: 0 },
        timelimit:  { type: "number", description: "Zeitlimit in Sekunden (0 = unbegrenzt / Modus-Default). Vor allem im Bewertungsmodus sinnvoll.", default: 0 },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "name"],
    },
  },
  {
    name: "moodle_create_question_category",
    description: "Legt eine Fragenbank-Kategorie im Kurs an (oder gibt eine bereits vorhandene gleichnamige Kategorie zurück – idempotent, keine Dubletten). Namenskonvention: '<Nummer des Inhaltsabschnitts> <Titel>', z.B. '7.2 Stoffe und ihre Eigenschaften' – passend zum gleichnamigen Kursabschnitt.",
    inputSchema: {
      type: "object",
      properties: {
        courseid: { type: "number", description: "Kurs-ID" },
        name:     { type: "string", description: "Name der Kategorie, z.B. '7.2 Stoffe und ihre Eigenschaften'" },
        parent:   { type: "number", description: "ID der übergeordneten Kategorie (0 = direkt unter der Top-Kategorie des Kurses, Standard)", default: 0 },
      },
      required: ["courseid", "name"],
    },
  },
  {
    name: "moodle_get_question_categories",
    description: "Listet alle Fragenbank-Kategorien eines Kurses (inkl. der Top-Kategorie) mit id, Name und übergeordneter Kategorie-ID.",
    inputSchema: {
      type: "object",
      properties: {
        courseid: { type: "number", description: "Kurs-ID" },
      },
      required: ["courseid"],
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
];

const { optionsToFormParams, validateMcQuestionInput } = require('./lib/mc-question');

// ─────────────────────────────────────────────────────────────
// Tool-Ausführung
// ─────────────────────────────────────────────────────────────
async function executeTool(name, args) {
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

    case "moodle_set_completion": {
      return await callMoodle("local_aicoursecreator_set_completion", {
        cmid:                args.cmid,
        completion:          args.completion          ?? 1,
        completionsubmit:    args.completionsubmit    ?? 0,
        completionpassgrade: args.completionpassgrade ?? 0,
      });
    }

    case "moodle_set_restriction": {
      const req = args.require_cmids || [];
      const result = await callMoodle("local_aicoursecreator_set_restriction", {
        cmid:                  args.cmid,
        show_locked:           args.show_locked           ?? 1,
        operator:              args.operator              || "AND",
        condition_type:        args.condition_type        || "",
        condition_target_cmid: args.condition_target_cmid ?? 0,
        ...Object.fromEntries(req.map((id, i) => [`require_cmids[${i}]`, id])),
      });
      return result;
    }

    case "moodle_get_modules": {
      return await callMoodle("local_aicoursecreator_get_modules", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum ?? -1,
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

    case "moodle_get_sections": {
      const result = await callMoodle("local_aicoursecreator_get_sections", {
        courseid: args.courseid,
      });
      return result.map(s => ({
        sectionnum: s.sectionnum,
        id: s.id,
        name: s.name || `(Abschnitt ${s.sectionnum})`,
        visible: s.visible,
      }));
    }

    case "moodle_update_section": {
      return await callMoodle("local_aicoursecreator_update_section", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name       || "",
        summary:    args.summary    || "",
        visible:    args.visible    ?? 1,
      });
    }

    case "moodle_ensure_section": {
      return await callMoodle("local_aicoursecreator_ensure_section", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name       || "",
        summary:    args.summary    || "",
        visible:    args.visible    ?? 1,
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
        mode:       args.mode      || "lerncheck",
        gradepass:  args.gradepass ?? 0,
        timelimit:  args.timelimit ?? 0,
        visible:    args.visible   ?? 1,
      });
    }

    case "moodle_create_question_category": {
      return await callMoodle("local_aicoursecreator_create_question_category", {
        courseid: args.courseid,
        name:     args.name,
        parent:   args.parent ?? 0,
      });
    }

    case "moodle_get_question_categories": {
      return await callMoodle("local_aicoursecreator_get_question_categories", {
        courseid: args.courseid,
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
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
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
