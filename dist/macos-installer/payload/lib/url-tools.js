'use strict';

/**
 * URL-MCP-Tools (Issue #90, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer externe Links (mod_url): erstellen, aendern.
 *
 * Reine Verschiebung aus moodle-mcp.js (keine Verhaltensaenderung). Wird von
 * moodle-mcp-url.js (eigener stdio-Prozess) UND moodle-mcp.js (bestehender
 * Rest-MCP, vorerst weiter mit ausgeliefert) genutzt, um Code-Duplikation zu
 * vermeiden.
 */

const URL_TOOLS = [
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
];

const URL_TOOL_NAMES = new Set(URL_TOOLS.map(tool => tool.name));

const URL_READ_ONLY_TOOL_NAMES = new Set();

/**
 * Fuehrt ein URL-Tool aus. Wirft, falls `name` kein URL-Tool ist - der
 * Aufrufer (moodle-mcp.js bzw. moodle-mcp-url.js) entscheidet per
 * isUrlTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeUrlTool(callMoodle, name, args) {
  switch (name) {

    case "moodle_update_url": {
      return await callMoodle("local_aicoursecreator_update_url", {
        cmid:        args.cmid,
        name:        args.name        || "",
        externalurl: args.externalurl || "",
        intro:       args.intro       || "",
        visible:     args.visible     ?? -1,
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

    default:
      throw new Error(`Unbekanntes URL-Tool: ${name}`);
  }
}

function isUrlTool(name) {
  return URL_TOOL_NAMES.has(name);
}

function isUrlReadOnlyTool(name) {
  return URL_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  URL_TOOLS,
  URL_TOOL_NAMES,
  URL_READ_ONLY_TOOL_NAMES,
  executeUrlTool,
  isUrlTool,
  isUrlReadOnlyTool,
};
