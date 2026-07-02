#!/usr/bin/env node
/**
 * moodle-mcp-label.js
 * MCP stdio server – Label-MCP (Issue #90, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die Label-Tools (mod_label): erstellen,
 * aendern. Andere Aktivitaetstypen (Page, URL, Assign, Quiz, Fragensammlung)
 * bleiben vorerst in moodle-mcp.js bzw. werden in eigenen Prozessen
 * ausgeliefert.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const { LABEL_TOOLS, LABEL_READ_ONLY_TOOL_NAMES, executeLabelTool } = require('./lib/label-tools');

startMcpServer({
  serverName: 'moodle-mcp-label',
  scriptName: 'moodle-mcp-label.js',
  tools: LABEL_TOOLS,
  readOnlyToolNames: LABEL_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeLabelTool(callMoodle, name, args),
});
