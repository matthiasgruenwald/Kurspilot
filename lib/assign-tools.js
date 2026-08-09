'use strict';

/**
 * Assign-MCP-Tools (Issue #90, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer Aufgaben (mod_assign): erstellen, aendern, Dateien hochladen,
 * Bilder zuschneiden/einbetten.
 *
 * Reine Verschiebung aus moodle-mcp.js (keine Verhaltensaenderung). Wird von
 * moodle-mcp-assign.js (eigener stdio-Prozess) UND moodle-mcp.js (bestehender
 * Rest-MCP, vorerst weiter mit ausgeliefert) genutzt, um Code-Duplikation zu
 * vermeiden.
 */

const fs = require('fs');
const path = require('path');
const { cropImage } = require('./image-crop');
const { readCropBackendPreference } = require('./kurspilot-workspace-config');
const { dispatchTool } = require('./tool-registry');

const ASSIGN_TOOLS = [
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
        grade:       { type: "number", description: "Maximale Bewertung in Punkten (0 = unbewertet, -1 = nicht ändern)", default: -1 },
        gradepass:   { type: "number", description: "Bestehensgrenze in Punkten (-1 = nicht ändern)" },
        submissiondrafts: { type: "number", enum: [0, 1], description: "1 = endgültige Abgabe nötig, 0 = fortlaufend bearbeitbar" },
        maxattempts: { type: "number", description: "-1 = unbegrenzt; weglassen = nicht ändern" },
        attemptreopenmethod: { type: "string", enum: ["manual", "automatic", "untilpass"], description: "Wiedereröffnung; weglassen = nicht ändern" },
        allowsubmissionsfromdate: { type: "number", description: "Abgaben ab diesem Unix-Timestamp erlauben (0 = sofort, -1 = nicht ändern)", default: -1 },
        cutoffdate: { type: "number", description: "Letzter Abgabetermin als Unix-Timestamp (0 = keiner, -1 = nicht ändern)", default: -1 },
        gradingduedate: { type: "number", description: "Bewertungsfälligkeit als Unix-Timestamp (0 = keiner, -1 = nicht ändern)", default: -1 },
        requiresubmissionstatement: { type: "number", enum: [0, 1], description: "1 = Eigenständigkeitserklärung verlangen, -1 = nicht ändern" },
        teamsubmission: { type: "number", enum: [0, 1], description: "1 = Gruppenabgabe, 0 = Einzelabgabe, -1 = nicht ändern" },
        requireallteammemberssubmit: { type: "number", enum: [0, 1], description: "Bei Gruppenabgabe müssen alle Mitglieder abgeben, -1 = nicht ändern" },
        teamsubmissiongroupingid: { type: "number", description: "ID einer vorhandenen Kurs-Gruppierung (0 = alle Gruppen, -1 = nicht ändern)", default: -1 },
        sendnotifications: { type: "number", enum: [0, 1], description: "Lehrkräfte über Abgaben benachrichtigen, -1 = nicht ändern" },
        sendlatenotifications: { type: "number", enum: [0, 1], description: "Lehrkräfte über verspätete Abgaben benachrichtigen, -1 = nicht ändern" },
        sendstudentnotifications: { type: "number", enum: [0, 1], description: "Lernende über bewertete Abgaben benachrichtigen, -1 = nicht ändern" },
        blindmarking: { type: "number", enum: [0, 1], description: "Anonyme Bewertung, -1 = nicht ändern" },
        markingworkflow: { type: "number", enum: [0, 1], description: "Bewertungsworkflow verwenden, -1 = nicht ändern" },
        markingallocation: { type: "number", enum: [0, 1], description: "Bewertungen zuordnen (setzt Workflow voraus), -1 = nicht ändern" },
        gradecat: { type: "number", description: "ID einer vorhandenen Bewertungskategorie (0 = Standardkategorie, -1 = nicht ändern)", default: -1 },
        gradingmethod: { type: "string", enum: ["none", "rubric", "guide"], description: "Vorhandene Bewertungsmethode, leer = nicht ändern" },
      },
      required: ["cmid"],
    },
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_update_assign", {
        cmid:        args.cmid,
        name:        args.name        || "",
        description: args.description || "",
        duedate:     args.duedate     ?? -1,
        visible:     args.visible     ?? -1,
        grade:       args.grade       ?? -1,
        gradepass:   args.gradepass   ?? -1,
        submissiondrafts: args.submissiondrafts ?? -1,
        maxattempts: args.maxattempts ?? -2,
        attemptreopenmethod: args.attemptreopenmethod || "",
        allowsubmissionsfromdate: args.allowsubmissionsfromdate ?? -1,
        cutoffdate: args.cutoffdate ?? -1,
        gradingduedate: args.gradingduedate ?? -1,
        requiresubmissionstatement: args.requiresubmissionstatement ?? -1,
        teamsubmission: args.teamsubmission ?? -1,
        requireallteammemberssubmit: args.requireallteammemberssubmit ?? -1,
        teamsubmissiongroupingid: args.teamsubmissiongroupingid ?? -1,
        sendnotifications: args.sendnotifications ?? -1,
        sendlatenotifications: args.sendlatenotifications ?? -1,
        sendstudentnotifications: args.sendstudentnotifications ?? -1,
        blindmarking: args.blindmarking ?? -1,
        markingworkflow: args.markingworkflow ?? -1,
        markingallocation: args.markingallocation ?? -1,
        gradecat: args.gradecat ?? -1,
        gradingmethod: args.gradingmethod || "",
      });
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
    handler(args) {
      const preferredBackend = readCropBackendPreference();
      const { backend } = cropImage(
        args.sourcepath,
        {
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
        },
        args.destpath,
        preferredBackend ? { preferredBackend } : {}
      );
      const result = {
        filepath: args.destpath,
        filename: path.basename(args.destpath),
        message: `Bild erfolgreich zugeschnitten: ${args.destpath}`,
      };
      if (backend === 'sips') {
        result.warning = SIPS_BACKEND_WARNING;
      }
      return result;
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
    async handler(args, callMoodle) {
      const filepath = args.filepath;
      if (!fs.existsSync(filepath)) {
        throw new Error(`Datei nicht gefunden: ${filepath}`);
      }
      const fileBuffer = fs.readFileSync(filepath);
      const base64    = fileBuffer.toString('base64');
      const filename  = args.filename || path.basename(filepath);
      const ext       = path.extname(filename).toLowerCase().slice(1);
      const mimetype  = UPLOAD_MIME_TYPES[ext] || 'application/octet-stream';

      return await callMoodle("local_coursepilot_upload_assignfile", {
        cmid:     args.cmid,
        filename: filename,
        content:  base64,
        mimetype: mimetype,
      });
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
    async handler(args, callMoodle) {
      const filepath = args.filepath;
      if (!fs.existsSync(filepath)) {
        throw new Error(`Datei nicht gefunden: ${filepath}`);
      }
      const fileBuffer = fs.readFileSync(filepath);
      const base64 = fileBuffer.toString('base64');
      const filename = args.filename || path.basename(filepath);
      const ext = path.extname(filename).toLowerCase().slice(1);
      const mimetype = EMBED_IMAGE_MIME_TYPES[ext] || 'application/octet-stream';

      return await callMoodle("local_coursepilot_upload_assign_intro_image", {
        cmid:     args.cmid,
        filename: filename,
        content:  base64,
        mimetype: mimetype,
        alt:      args.alt || "",
      });
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
        mode:         { type: "string", enum: ["standard", "übung"], description: "Aufgaben-Preset. 'übung' = unbewertet und fortlaufend bearbeitbar; einzelne Felder können das Preset überschreiben.", default: "standard" },
        grade:        { type: "number", description: "Maximale Bewertung in Punkten. 0 = unbewertet, -1 = Preset-/Standardwert verwenden.", default: -1 },
        gradepass:    { type: "number", description: "Bestehensgrenze in Punkten; nötig für Wiedereröffnung bis zum Bestehen." },
        submissiondrafts: { type: "number", enum: [0, 1], description: "1 = Lernende müssen endgültig auf 'Abgeben' klicken, 0 = Abgabe bleibt direkt bearbeitbar." },
        maxattempts:  { type: "number", description: "Maximale Anzahl Abgabeversuche: -1 = unbegrenzt, 1 bis 30 = feste Grenze. Weglassen = Preset-/Standardwert." },
        attemptreopenmethod: { type: "string", enum: ["manual", "automatic", "untilpass"], description: "Wiedereröffnung weiterer Versuche. Weglassen = Preset-/Standardwert." },
        allowsubmissionsfromdate: { type: "number", description: "Abgaben ab diesem Unix-Timestamp erlauben (0 = sofort)", default: 0 },
        cutoffdate: { type: "number", description: "Letzter Abgabetermin als Unix-Timestamp (0 = keiner)", default: 0 },
        gradingduedate: { type: "number", description: "Bewertungsfälligkeit als Unix-Timestamp (0 = keiner)", default: 0 },
        requiresubmissionstatement: { type: "number", enum: [0, 1], description: "Eigenständigkeitserklärung verlangen", default: 0 },
        teamsubmission: { type: "number", enum: [0, 1], description: "Gruppenabgabe aktivieren", default: 0 },
        requireallteammemberssubmit: { type: "number", enum: [0, 1], description: "Bei Gruppenabgabe müssen alle Mitglieder abgeben", default: 0 },
        teamsubmissiongroupingid: { type: "number", description: "ID einer vorhandenen Kurs-Gruppierung (0 = alle Gruppen)", default: 0 },
        sendnotifications: { type: "number", enum: [0, 1], description: "Lehrkräfte über Abgaben benachrichtigen", default: 0 },
        sendlatenotifications: { type: "number", enum: [0, 1], description: "Lehrkräfte über verspätete Abgaben benachrichtigen", default: 0 },
        sendstudentnotifications: { type: "number", enum: [0, 1], description: "Lernende über bewertete Abgaben benachrichtigen", default: 1 },
        blindmarking: { type: "number", enum: [0, 1], description: "Anonyme Bewertung", default: 0 },
        markingworkflow: { type: "number", enum: [0, 1], description: "Bewertungsworkflow verwenden", default: 0 },
        markingallocation: { type: "number", enum: [0, 1], description: "Bewertungen zuordnen (setzt Workflow voraus)", default: 0 },
        gradecat: { type: "number", description: "ID einer vorhandenen Bewertungskategorie (0 = Standardkategorie)", default: 0 },
        gradingmethod: { type: "string", enum: ["none", "rubric", "guide"], description: "Vorhandene Bewertungsmethode", default: "none" },
      },
      required: ["courseid", "sectionnum", "name"],
    },
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_create_assign", {
        courseid:    args.courseid,
        sectionnum:  args.sectionnum,
        name:        args.name,
        description: args.description || "",
        duedate:     args.duedate     || 0,
        maxfiles:    args.maxfiles    ?? 1,
        visible:     args.visible     ?? 1,
        mode:        args.mode        || "standard",
        grade:       args.grade       ?? -1,
        gradepass:   args.gradepass   ?? -1,
        submissiondrafts: args.submissiondrafts ?? -1,
        maxattempts: args.maxattempts ?? -2,
        attemptreopenmethod: args.attemptreopenmethod || "",
        allowsubmissionsfromdate: args.allowsubmissionsfromdate ?? 0,
        cutoffdate: args.cutoffdate ?? 0,
        gradingduedate: args.gradingduedate ?? 0,
        requiresubmissionstatement: args.requiresubmissionstatement ?? 0,
        teamsubmission: args.teamsubmission ?? 0,
        requireallteammemberssubmit: args.requireallteammemberssubmit ?? 0,
        teamsubmissiongroupingid: args.teamsubmissiongroupingid ?? 0,
        sendnotifications: args.sendnotifications ?? 0,
        sendlatenotifications: args.sendlatenotifications ?? 0,
        sendstudentnotifications: args.sendstudentnotifications ?? 1,
        blindmarking: args.blindmarking ?? 0,
        markingworkflow: args.markingworkflow ?? 0,
        markingallocation: args.markingallocation ?? 0,
        gradecat: args.gradecat ?? 0,
        gradingmethod: args.gradingmethod || "none",
      });
    },
  },
];

const ASSIGN_TOOL_NAMES = new Set(ASSIGN_TOOLS.map(tool => tool.name));

const ASSIGN_READ_ONLY_TOOL_NAMES = new Set();

const UPLOAD_MIME_TYPES = {
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

// Issue #135: Warnhinweis fuer die Tool-Antwort, wenn cropImage() auf macOS
// ueber das Systemtool "sips" statt ImageMagick gecroppt hat (bekannte
// Einschraenkungen, siehe lib/image-crop.js).
const SIPS_BACKEND_WARNING =
  "Zuschnitt erfolgte mit dem macOS-Systemtool 'sips' (kein ImageMagick noetig). " +
  "Bekannte Einschraenkungen: bei animierten GIFs wird nur der erste Frame verarbeitet, " +
  "bei CMYK-JPEGs ohne eingebettetes Farbprofil sind invertierte Farben moeglich.";

const EMBED_IMAGE_MIME_TYPES = {
  'png':  'image/png',
  'jpg':  'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif':  'image/gif',
  'svg':  'image/svg+xml',
  'webp': 'image/webp',
};

/**
 * Fuehrt ein Assign-Tool aus. Wirft, falls `name` kein Assign-Tool ist - der
 * Aufrufer (moodle-mcp.js bzw. moodle-mcp-assign.js) entscheidet per
 * isAssignTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeAssignTool(callMoodle, name, args) {
  return await dispatchTool(ASSIGN_TOOLS, name, args, callMoodle, `Unbekanntes Assign-Tool: ${name}`);
}

function isAssignTool(name) {
  return ASSIGN_TOOL_NAMES.has(name);
}

function isAssignReadOnlyTool(name) {
  return ASSIGN_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  ASSIGN_TOOLS,
  ASSIGN_TOOL_NAMES,
  ASSIGN_READ_ONLY_TOOL_NAMES,
  executeAssignTool,
  isAssignTool,
  isAssignReadOnlyTool,
};
