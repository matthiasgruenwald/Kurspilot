#!/usr/bin/env node
/**
 * moodle-mcp-resource.js
 * MCP stdio server – Resource-MCP (Issue #221, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die Resource-Tools (mod_resource /
 * Datei): erstellen, aendern/Datei tauschen. Andere Aktivitaetstypen
 * (Page, Label, URL, Assign, Quiz, Fragensammlung) bleiben vorerst in
 * moodle-mcp.js bzw. werden in eigenen Prozessen ausgeliefert.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const {
  RESOURCE_TOOLS,
  RESOURCE_READ_ONLY_TOOL_NAMES,
  executeResourceTool,
} = require('./lib/resource-tools');

startMcpServer({
  serverName: 'moodle-mcp-resource',
  scriptName: 'moodle-mcp-resource.js',
  tools: RESOURCE_TOOLS,
  readOnlyToolNames: RESOURCE_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeResourceTool(callMoodle, name, args),
});
