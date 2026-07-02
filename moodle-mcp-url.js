#!/usr/bin/env node
/**
 * moodle-mcp-url.js
 * MCP stdio server – URL-MCP (Issue #90, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die URL-Tools (mod_url): erstellen,
 * aendern. Andere Aktivitaetstypen (Page, Label, Assign, Quiz, Fragensammlung)
 * bleiben vorerst in moodle-mcp.js bzw. werden in eigenen Prozessen
 * ausgeliefert.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const { URL_TOOLS, URL_READ_ONLY_TOOL_NAMES, executeUrlTool } = require('./lib/url-tools');

startMcpServer({
  serverName: 'moodle-mcp-url',
  scriptName: 'moodle-mcp-url.js',
  tools: URL_TOOLS,
  readOnlyToolNames: URL_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeUrlTool(callMoodle, name, args),
});
