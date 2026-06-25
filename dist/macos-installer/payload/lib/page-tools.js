'use strict';

/**
 * Page-MCP-Tools (Issue #90, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer Textseiten (mod_page): erstellen, aendern.
 *
 * Reine Verschiebung aus moodle-mcp.js (keine Verhaltensaenderung). Wird von
 * moodle-mcp-page.js (eigener stdio-Prozess) UND moodle-mcp.js (bestehender
 * Rest-MCP, vorerst weiter mit ausgeliefert) genutzt, um Code-Duplikation zu
 * vermeiden.
 */

const PAGE_TOOLS = [
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
];

const PAGE_TOOL_NAMES = new Set(PAGE_TOOLS.map(tool => tool.name));

const PAGE_READ_ONLY_TOOL_NAMES = new Set();

/**
 * Fuehrt ein Page-Tool aus. Wirft, falls `name` kein Page-Tool ist - der
 * Aufrufer (moodle-mcp.js bzw. moodle-mcp-page.js) entscheidet per
 * isPageTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executePageTool(callMoodle, name, args) {
  switch (name) {

    case "moodle_update_page": {
      return await callMoodle("local_aicoursecreator_update_page", {
        cmid:    args.cmid,
        name:    args.name    || "",
        content: args.content || "",
        visible: args.visible ?? -1,
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

    default:
      throw new Error(`Unbekanntes Page-Tool: ${name}`);
  }
}

function isPageTool(name) {
  return PAGE_TOOL_NAMES.has(name);
}

function isPageReadOnlyTool(name) {
  return PAGE_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  PAGE_TOOLS,
  PAGE_TOOL_NAMES,
  PAGE_READ_ONLY_TOOL_NAMES,
  executePageTool,
  isPageTool,
  isPageReadOnlyTool,
};
