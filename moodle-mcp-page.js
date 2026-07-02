#!/usr/bin/env node
/**
 * moodle-mcp-page.js
 * MCP stdio server – Page-MCP (Issue #90, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die Page-Tools (mod_page): erstellen,
 * aendern. Andere Aktivitaetstypen (Label, URL, Assign, Quiz, Fragensammlung)
 * bleiben vorerst in moodle-mcp.js bzw. werden in eigenen Prozessen
 * ausgeliefert.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const { PAGE_TOOLS, PAGE_READ_ONLY_TOOL_NAMES, executePageTool } = require('./lib/page-tools');

startMcpServer({
  serverName: 'moodle-mcp-page',
  scriptName: 'moodle-mcp-page.js',
  tools: PAGE_TOOLS,
  readOnlyToolNames: PAGE_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executePageTool(callMoodle, name, args),
});
