#!/usr/bin/env node
/**
 * moodle-mcp-choice.js
 * MCP stdio server – Choice-MCP (Issue #223, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die Choice-Tools (mod_choice /
 * Abstimmung): erstellen und aktualisieren. Andere Aktivitaetstypen bleiben in
 * moodle-mcp.js bzw. ihren eigenen Prozessen.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const {
  CHOICE_TOOLS,
  CHOICE_READ_ONLY_TOOL_NAMES,
  executeChoiceTool,
} = require('./lib/choice-tools');

startMcpServer({
  serverName: 'moodle-mcp-choice',
  scriptName: 'moodle-mcp-choice.js',
  tools: CHOICE_TOOLS,
  readOnlyToolNames: CHOICE_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeChoiceTool(callMoodle, name, args),
});
