'use strict';

/**
 * Choice-MCP-Tools (Issue #223, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer Abstimmungen (mod_choice): erstellen und aktualisieren. Optionen
 * werden als String-Array (2-6 Eintraege) uebergeben und vor dem Aufruf zu
 * options[0], options[1], ... serialisiert, wie Moodles Webservice-Endpoint es
 * fuer Array-Parameter per x-www-form-urlencoded erwartet (Pattern:
 * lib/mc-question.js optionsToFormParams).
 *
 * Wird von moodle-mcp-choice.js (eigener stdio-Prozess) UND moodle-mcp.js
 * (Vollprofil) genutzt, um Code-Duplikation zu vermeiden.
 */

const { dispatchTool } = require('./tool-registry');
const { optionsToFormParams } = require('./mc-question');

function validateChoiceOptions(options) {
  if (!Array.isArray(options) || options.length < 2) {
    throw new Error('Eine Abstimmung benoetigt mindestens 2 Optionen (options[]).');
  }
  if (options.length > 6) {
    throw new Error('Eine Abstimmung hat maximal 6 Optionen (options[]).');
  }
}

const CHOICE_TOOLS = [
  {
    name: "moodle_create_choice",
    description: "Erstellt eine Abstimmung (mod_choice) in einem Kursabschnitt. Für schnelle Meinungsbilder/Umfragen mit 2-6 Antwortoptionen. Optionen werden als String-Array übergeben.",
    inputSchema: {
      type: "object",
      properties: {
        courseid:   { type: "number", description: "Kurs-ID" },
        sectionnum: { type: "number", description: "Abschnittsnummer (0-basiert)" },
        name:       { type: "string", description: "Titel der Abstimmung" },
        intro:      { type: "string", description: "Beschreibung auf der Kursseite (optional)", default: "" },
        options:    { type: "array", items: { type: "string" }, description: "Antwortoptionen als Strings (2-6)" },
        visible:    { type: "number", description: "1 = sichtbar (Standard), 0 = versteckt", default: 1 },
      },
      required: ["courseid", "sectionnum", "name", "options"],
    },
    async handler(args, callMoodle) {
      validateChoiceOptions(args.options);
      return await callMoodle("local_coursepilot_create_choice", {
        courseid:   args.courseid,
        sectionnum: args.sectionnum,
        name:       args.name,
        intro:      args.intro || "",
        visible:    args.visible ?? 1,
        ...optionsToFormParams(args.options),
      });
    },
  },
  {
    name: "moodle_update_choice",
    description: "Ändert Titel, Beschreibung und/oder Optionen einer bestehenden Abstimmung (mod_choice). Benötigt die cmid (aus moodle_get_modules oder dem Rückgabewert von moodle_create_choice). Optionen weglassen = Optionen nicht ändern.",
    inputSchema: {
      type: "object",
      properties: {
        cmid:    { type: "number", description: "Course Module ID der Abstimmung" },
        name:    { type: "string", description: "Neuer Titel (leer lassen = nicht ändern)" },
        intro:   { type: "string", description: "Neue Beschreibung (leer lassen = nicht ändern)" },
        options: { type: "array", items: { type: "string" }, description: "Neue Antwortoptionen als Strings (2-6, weglassen = nicht ändern)" },
        visible: { type: "number", description: "1 = sichtbar, 0 = versteckt, -1 = nicht ändern", default: -1 },
      },
      required: ["cmid"],
    },
    async handler(args, callMoodle) {
      const payload = {
        cmid:    args.cmid,
        name:    args.name || "",
        intro:   args.intro || "",
        visible: args.visible ?? -1,
      };
      if (Array.isArray(args.options) && args.options.length > 0) {
        validateChoiceOptions(args.options);
        Object.assign(payload, optionsToFormParams(args.options));
      }
      return await callMoodle("local_coursepilot_update_choice", payload);
    },
  },
];

const CHOICE_TOOL_NAMES = new Set(CHOICE_TOOLS.map(tool => tool.name));

const CHOICE_READ_ONLY_TOOL_NAMES = new Set(
  CHOICE_TOOLS.filter(tool => tool.readOnly).map(tool => tool.name)
);

/**
 * Fuehrt ein Choice-Tool aus. Wirft, falls `name` kein Choice-Tool ist -
 * der Aufrufer (moodle-mcp.js bzw. moodle-mcp-choice.js) entscheidet per
 * isChoiceTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeChoiceTool(callMoodle, name, args) {
  return await dispatchTool(CHOICE_TOOLS, name, args, callMoodle, `Unbekanntes Choice-Tool: ${name}`);
}

function isChoiceTool(name) {
  return CHOICE_TOOL_NAMES.has(name);
}

function isChoiceReadOnlyTool(name) {
  return CHOICE_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  CHOICE_TOOLS,
  CHOICE_TOOL_NAMES,
  CHOICE_READ_ONLY_TOOL_NAMES,
  executeChoiceTool,
  isChoiceTool,
  isChoiceReadOnlyTool,
};
