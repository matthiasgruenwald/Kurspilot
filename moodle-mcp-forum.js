#!/usr/bin/env node
/**
 * moodle-mcp-forum.js
 * MCP stdio server – Forum-MCP (Issue #224, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die Forum-Tools (mod_forum): erstellen und
 * aktualisieren. Andere Aktivitaetstypen bleiben in moodle-mcp.js bzw. ihren
 * eigenen Prozessen.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const {
  FORUM_TOOLS,
  FORUM_READ_ONLY_TOOL_NAMES,
  executeForumTool,
} = require('./lib/forum-tools');

startMcpServer({
  serverName: 'moodle-mcp-forum',
  scriptName: 'moodle-mcp-forum.js',
  tools: FORUM_TOOLS,
  readOnlyToolNames: FORUM_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeForumTool(callMoodle, name, args),
});
