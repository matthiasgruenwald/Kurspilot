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
  switch (name) {

    case "moodle_update_assign": {
      return await callMoodle("local_aicoursecreator_update_assign", {
        cmid:        args.cmid,
        name:        args.name        || "",
        description: args.description || "",
        duedate:     args.duedate     ?? -1,
        visible:     args.visible     ?? -1,
      });
    }

    case "moodle_crop_image": {
      const { backend } = cropImage(
        args.sourcepath,
        {
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
        },
        args.destpath
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
      const mimetype  = UPLOAD_MIME_TYPES[ext] || 'application/octet-stream';

      return await callMoodle("local_aicoursecreator_upload_assignfile", {
        cmid:     args.cmid,
        filename: filename,
        content:  base64,
        mimetype: mimetype,
      });
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
      const mimetype = EMBED_IMAGE_MIME_TYPES[ext] || 'application/octet-stream';

      return await callMoodle("local_aicoursecreator_upload_assign_intro_image", {
        cmid:     args.cmid,
        filename: filename,
        content:  base64,
        mimetype: mimetype,
        alt:      args.alt || "",
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

    default:
      throw new Error(`Unbekanntes Assign-Tool: ${name}`);
  }
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
