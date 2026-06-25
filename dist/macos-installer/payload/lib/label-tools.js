'use strict';

/**
 * Label-MCP-Tools (Issue #90, ADR 0007 "Aktivitaets-MCP-Aufteilung").
 *
 * Tools fuer Text- und Medienfelder (mod_label): erstellen, aendern.
 *
 * Reine Verschiebung aus moodle-mcp.js (keine Verhaltensaenderung). Wird von
 * moodle-mcp-label.js (eigener stdio-Prozess) UND moodle-mcp.js (bestehender
 * Rest-MCP, vorerst weiter mit ausgeliefert) genutzt, um Code-Duplikation zu
 * vermeiden.
 */

const LABEL_TOOLS = [
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
];

const LABEL_TOOL_NAMES = new Set(LABEL_TOOLS.map(tool => tool.name));

const LABEL_READ_ONLY_TOOL_NAMES = new Set();

/**
 * Fuehrt ein Label-Tool aus. Wirft, falls `name` kein Label-Tool ist - der
 * Aufrufer (moodle-mcp.js bzw. moodle-mcp-label.js) entscheidet per
 * isLabelTool(), ob er ueberhaupt hierher dispatcht.
 */
async function executeLabelTool(callMoodle, name, args) {
  switch (name) {

    case "moodle_update_label": {
      return await callMoodle("local_aicoursecreator_update_label", {
        cmid:    args.cmid,
        name:    args.name ?? "",
        content: args.content || "",
        visible: args.visible ?? -1,
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

    default:
      throw new Error(`Unbekanntes Label-Tool: ${name}`);
  }
}

function isLabelTool(name) {
  return LABEL_TOOL_NAMES.has(name);
}

function isLabelReadOnlyTool(name) {
  return LABEL_READ_ONLY_TOOL_NAMES.has(name);
}

module.exports = {
  LABEL_TOOLS,
  LABEL_TOOL_NAMES,
  LABEL_READ_ONLY_TOOL_NAMES,
  executeLabelTool,
  isLabelTool,
  isLabelReadOnlyTool,
};
