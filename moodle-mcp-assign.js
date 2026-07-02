#!/usr/bin/env node
/**
 * moodle-mcp-assign.js
 * MCP stdio server – Assign-MCP (Issue #90, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die Assign-Tools (mod_assign): erstellen,
 * aendern, Dateien hochladen, Bilder zuschneiden/einbetten. Andere
 * Aktivitaetstypen (Page, Label, URL, Quiz, Fragensammlung) bleiben vorerst
 * in moodle-mcp.js bzw. werden in eigenen Prozessen ausgeliefert.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const { ASSIGN_TOOLS, ASSIGN_READ_ONLY_TOOL_NAMES, executeAssignTool } = require('./lib/assign-tools');

startMcpServer({
  serverName: 'moodle-mcp-assign',
  scriptName: 'moodle-mcp-assign.js',
  tools: ASSIGN_TOOLS,
  readOnlyToolNames: ASSIGN_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeAssignTool(callMoodle, name, args),
});
