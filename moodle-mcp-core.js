#!/usr/bin/env node
/**
 * moodle-mcp-core.js
 * MCP stdio server – Core-MCP (Issue #89, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die aktivitaetsunabhaengigen
 * Moodle-Tools: Abschnitte lesen/aendern/verschieben, Module verschieben,
 * Abschlussverfolgung, Voraussetzungen, Kurskatalog. Aktivitaetsspezifische
 * Tools (Page, Label, URL, Assign, Quiz, Fragensammlung) bleiben vorerst in
 * moodle-mcp.js (spaetere Slices #90-92 extrahieren diese separat).
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const { CORE_TOOLS, CORE_READ_ONLY_TOOL_NAMES, executeCoreTool } = require('./lib/core-tools');

startMcpServer({
  serverName: 'moodle-mcp-core',
  scriptName: 'moodle-mcp-core.js',
  tools: CORE_TOOLS,
  readOnlyToolNames: CORE_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeCoreTool(callMoodle, name, args),
});
