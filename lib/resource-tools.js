'use strict';

/**
 * Resource-MCP-Tools (Issue #221, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer Datei-Ressourcen (mod_resource): erstellen, aendern/Datei
 * tauschen. Die lokale Datei wird im Handler gelesen und Base64-kodiert an
 * die Moodle-Webservice-Funktion uebertragen (Pattern: assign-tools.js
 * moodle_upload_assignfile).
 *
 * Wird von moodle-mcp-resource.js (eigener stdio-Prozess) UND moodle-mcp.js
 * (Vollprofil) genutzt, um Code-Duplikation zu vermeiden.
 */

const fs = require('fs');
const path = require('path');
const { dispatchTool } = require('./tool-registry');

const RESOURCE_MIME_TYPES = {
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

function readLocalFile(filepath, filenameOverride) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Datei nicht gefunden: ${filepath}`);
  }
  const fileBuffer = fs.readFileSync(filepath);
  const filename = filenameOverride || path.basename(filepath);
  const ext = path.extname(filename).toLowerCase().slice(1);
  return {
    filename,
    content: fileBuffer.toString('base64'),
    mimetype: RESOURCE_MIME_TYPES[ext] || 'application/octet-stream',
  };
}

const RESOURCE_TOOLS = [
  {
    name: "moodle_update_resource",
    description: "Ändert den Namen und/oder tauscht die Datei einer bestehenden Datei-Ressource (mod_resource). Benötigt die cmid (aus moodle_get_modules oder dem Rückgabewert von moodle_create_resource).",
    inputSchema: {
      type: "object",
      properties: {
        cmid:     { type: "number", description: "Course Module ID der Datei-Ressource" },
        name:     { type: "string", description: "Neuer Titel (leer lassen = nicht ändern)" },
        filepath: { type: "string", description: "Absoluter Pfad zur neuen lokalen Datei (leer lassen = Datei nicht ändern)" },
        filename: { type: "string", description: "Dateiname in Moodle (optional, Standard: Dateiname aus filepath)" },
        visible:  { type: "number", description: "1 = sichtbar, 0 = versteckt, -1 = nicht ändern", default: -1 },
      },
      required: ["cmid"],
    },
    async handler(args, callMoodle) {
      const payload = {
        cmid:     args.cmid,
        name:     args.name || "",
        filename: "",
        content:  "",
        mimetype: "application/octet-stream",
        visible:  args.visible ?? -1,
      };
      if (args.filepath) {
        const file = readLocalFile(args.filepath, args.filename);
        payload.filename = file.filename;
        payload.content = file.content;
        payload.mimetype = file.mimetype;
      }
      return await callMoodle("local_coursepilot_update_resource", payload);
    },
  },
  {
    name: "moodle_create_resource",
    description: "Erstellt eine Datei-Ressource (mod_resource) in einem Kursabschnitt. Für Materialien die Schüler herunterladen/öffnen sollen (PDF, Bild, DOCX, XLSX, PPTX). Die Datei wird lokal gelesen und als Hauptdatei der Ressource gespeichert.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Titel der Datei-Ressource" },
        filepath:   { type: "string", description: "Absoluter Pfad zur lokalen Datei, z.B. /tmp/arbeitsblatt.pdf" },
        filename:   { type: "string", description: "Dateiname in Moodle (optional, Standard: Dateiname aus filepath)" },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "name", "filepath"],
    },
    async handler(args, callMoodle) {
      const file = readLocalFile(args.filepath, args.filename);
      return await callMoodle("local_coursepilot_create_resource", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name,
        filename:   file.filename,
        content:    file.content,
        mimetype:   file.mimetype,
        visible:    args.visible ?? 1,
      });
    },
  },
];

const RESOURCE_TOOL_NAMES = new Set(RESOURCE_TOOLS.map(tool => tool.name));

const RESOURCE_READ_ONLY_TOOL_NAMES = new Set(
  RESOURCE_TOOLS.filter(tool => tool.readOnly).map(tool => tool.name)
);

/**
 * Fuehrt ein Resource-Tool aus. Wirft, falls `name` kein Resource-Tool ist -
 * der Aufrufer (moodle-mcp.js bzw. moodle-mcp-resource.js) entscheidet per
 * isResourceTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeResourceTool(callMoodle, name, args) {
  return await dispatchTool(RESOURCE_TOOLS, name, args, callMoodle, `Unbekanntes Resource-Tool: ${name}`);
}

function isResourceTool(name) {
  return RESOURCE_TOOL_NAMES.has(name);
}

function isResourceReadOnlyTool(name) {
  return RESOURCE_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  RESOURCE_TOOLS,
  RESOURCE_TOOL_NAMES,
  RESOURCE_READ_ONLY_TOOL_NAMES,
  executeResourceTool,
  isResourceTool,
  isResourceReadOnlyTool,
};
