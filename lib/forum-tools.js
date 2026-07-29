'use strict';

/**
 * Forum-MCP-Tools (Issue #224, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer Foren (mod_forum): erstellen und aktualisieren. Der Forumtyp ist
 * eines von general (Standardforum), qanda (Frage-Antwort-Forum), eachuser
 * (jede Person ein Thema) oder single (einzelnes einfaches Diskussionsthema).
 *
 * Wird von moodle-mcp-forum.js (eigener stdio-Prozess) UND moodle-mcp.js
 * (Vollprofil) genutzt, um Code-Duplikation zu vermeiden.
 */

const { dispatchTool } = require('./tool-registry');

const FORUM_TYPES = ['general', 'qanda', 'eachuser', 'single'];

function validateForumType(type) {
  if (!FORUM_TYPES.includes(type)) {
    throw new Error(`Unzulaessiger Forumtyp "${type}". Erlaubt sind: ${FORUM_TYPES.join(', ')}.`);
  }
}

const FORUM_TOOLS = [
  {
    name: "moodle_create_forum",
    description: "Erstellt ein Forum (mod_forum) in einem Kursabschnitt. Für Diskussionen und Austausch. Der Forumtyp ist wählbar: general (Standardforum), qanda (Frage-Antwort-Forum), eachuser (jede Person ein Thema) oder single (einzelnes einfaches Diskussionsthema).",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Titel des Forums" },
        intro:      { type: "string", description: "Beschreibung auf der Kursseite (optional)", default: "" },
        type:       { type: "string", description: "Forumtyp: general (Standard), qanda, eachuser oder single", default: "general" },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "name"],
    },
    async handler(args, callMoodle) {
      const type = args.type || "general";
      validateForumType(type);
      return await callMoodle("local_coursepilot_create_forum", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name,
        intro:      args.intro || "",
        type:       type,
        visible:    args.visible ?? 1,
      });
    },
  },
  {
    name: "moodle_update_forum",
    description: "Ändert Titel, Beschreibung und/oder Forumtyp eines bestehenden Forums (mod_forum). Benötigt die cmid (aus moodle_get_modules oder dem Rückgabewert von moodle_create_forum). Felder weglassen = nicht ändern.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:    { type: "number", description: "Course Module ID des Forums" },
        name:    { type: "string", description: "Neuer Titel (leer lassen = nicht ändern)" },
        intro:   { type: "string", description: "Neue Beschreibung (leer lassen = nicht ändern)" },
        type:    { type: "string", description: "Neuer Forumtyp: general, qanda, eachuser oder single (leer lassen = nicht ändern)" },
        visible: { type: "number", description: "1 = sichtbar, 0 = versteckt, -1 = nicht ändern", default: -1 },
      },
      required: ["cmid"],
    },
    async handler(args, callMoodle) {
      const type = args.type || "";
      if (type !== "") {
        validateForumType(type);
      }
      return await callMoodle("local_coursepilot_update_forum", {
        cmid:    args.cmid,
        name:    args.name || "",
        intro:   args.intro || "",
        type:    type,
        visible: args.visible ?? -1,
      });
    },
  },
];

const FORUM_TOOL_NAMES = new Set(FORUM_TOOLS.map(tool => tool.name));

const FORUM_READ_ONLY_TOOL_NAMES = new Set(
  FORUM_TOOLS.filter(tool => tool.readOnly).map(tool => tool.name)
);

/**
 * Fuehrt ein Forum-Tool aus. Wirft, falls `name` kein Forum-Tool ist - der
 * Aufrufer (moodle-mcp.js bzw. moodle-mcp-forum.js) entscheidet per
 * isForumTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeForumTool(callMoodle, name, args) {
  return await dispatchTool(FORUM_TOOLS, name, args, callMoodle, `Unbekanntes Forum-Tool: ${name}`);
}

function isForumTool(name) {
  return FORUM_TOOL_NAMES.has(name);
}

function isForumReadOnlyTool(name) {
  return FORUM_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  FORUM_TOOLS,
  FORUM_TOOL_NAMES,
  FORUM_READ_ONLY_TOOL_NAMES,
  executeForumTool,
  isForumTool,
  isForumReadOnlyTool,
};
