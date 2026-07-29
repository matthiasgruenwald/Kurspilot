'use strict';

/**
 * Folder-MCP-Tools (Issue #222, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer Verzeichnisse (mod_folder): erstellen, umbenennen, Dateien
 * (auch in Unterverzeichnisse) hochladen. Die lokale Datei wird im Handler
 * gelesen und Base64-kodiert an die Moodle-Webservice-Funktion uebertragen
 * (Pattern: assign-tools.js moodle_upload_assignfile).
 *
 * Wird von moodle-mcp-folder.js (eigener stdio-Prozess) UND moodle-mcp.js
 * (Vollprofil) genutzt, um Code-Duplikation zu vermeiden.
 */

const fs = require('fs');
const path = require('path');
const { dispatchTool } = require('./tool-registry');

const FOLDER_MIME_TYPES = {
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
    mimetype: FOLDER_MIME_TYPES[ext] || 'application/octet-stream',
  };
}

const FOLDER_TOOLS = [
  {
    name: "moodle_create_folder",
    description: "Erstellt ein Verzeichnis (mod_folder) in einem Kursabschnitt. Für Materialsammlungen mit mehreren Dateien. Dateien werden danach per moodle_upload_folder_file hochgeladen.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Titel des Verzeichnisses" },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "name"],
    },
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_create_folder", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name,
        visible:    args.visible ?? 1,
      });
    },
  },
  {
    name: "moodle_update_folder",
    description: "Ändert den Namen und/oder die Sichtbarkeit eines bestehenden Verzeichnisses (mod_folder). Benötigt die cmid (aus moodle_get_modules oder dem Rückgabewert von moodle_create_folder).",
    inputSchema: {
      type: "object",
      properties: {
        cmid:    { type: "number", description: "Course Module ID des Verzeichnisses" },
        name:    { type: "string", description: "Neuer Titel (leer lassen = nicht ändern)" },
        visible: { type: "number", description: "1 = sichtbar, 0 = versteckt, -1 = nicht ändern", default: -1 },
      },
      required: ["cmid"],
    },
    async handler(args, callMoodle) {
      return await callMoodle("local_coursepilot_update_folder", {
        cmid:    args.cmid,
        name:    args.name || "",
        visible: args.visible ?? -1,
      });
    },
  },
  {
    name: "moodle_upload_folder_file",
    description: "Lädt eine lokal gespeicherte Datei in ein Verzeichnis (mod_folder) hoch, optional in ein Unterverzeichnis via filepath (z.B. '/material/'). Eine vorhandene Datei gleichen Namens im selben Verzeichnis wird ersetzt.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:     { type: "number", description: "Course Module ID des Verzeichnisses" },
        filepath: { type: "string", description: "Absoluter Pfad zur lokalen Datei, z.B. /tmp/arbeitsblatt.pdf" },
        filename: { type: "string", description: "Dateiname in Moodle (optional, Standard: Dateiname aus filepath)" },
        folderpath: { type: "string", description: "Zielverzeichnis im Ordner, z.B. '/' oder '/material/' (Standard: '/')", default: "/" },
      },
      required: ["cmid", "filepath"],
    },
    async handler(args, callMoodle) {
      const file = readLocalFile(args.filepath, args.filename);
      return await callMoodle("local_coursepilot_upload_folder_file", {
        cmid:     args.cmid,
        filename: file.filename,
        content:  file.content,
        mimetype: file.mimetype,
        filepath: args.folderpath || "/",
      });
    },
  },
];

const FOLDER_TOOL_NAMES = new Set(FOLDER_TOOLS.map(tool => tool.name));

const FOLDER_READ_ONLY_TOOL_NAMES = new Set(
  FOLDER_TOOLS.filter(tool => tool.readOnly).map(tool => tool.name)
);

/**
 * Fuehrt ein Folder-Tool aus. Wirft, falls `name` kein Folder-Tool ist -
 * der Aufrufer (moodle-mcp.js bzw. moodle-mcp-folder.js) entscheidet per
 * isFolderTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeFolderTool(callMoodle, name, args) {
  return await dispatchTool(FOLDER_TOOLS, name, args, callMoodle, `Unbekanntes Folder-Tool: ${name}`);
}

function isFolderTool(name) {
  return FOLDER_TOOL_NAMES.has(name);
}

function isFolderReadOnlyTool(name) {
  return FOLDER_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  FOLDER_TOOLS,
  FOLDER_TOOL_NAMES,
  FOLDER_READ_ONLY_TOOL_NAMES,
  executeFolderTool,
  isFolderTool,
  isFolderReadOnlyTool,
};
