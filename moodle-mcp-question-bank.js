#!/usr/bin/env node
/**
 * moodle-mcp-question-bank.js
 * MCP stdio server – Fragensammlung-MCP (Issue #92, ADR 0007)
 *
 * Eigenstaendiger stdio-Prozess fuer benannte Fragensammlungen,
 * Fragenkategorien und MC-Fragen. Das MCP bleibt unabhaengig startbar; Quiz
 * deklariert die strukturelle Abhaengigkeit auf dieses MCP separat.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const {
  QUESTION_BANK_MCP_METADATA,
  QUESTION_BANK_TOOLS,
  QUESTION_BANK_READ_ONLY_TOOL_NAMES,
  executeQuestionBankTool,
} = require('./lib/question-bank-tools');

startMcpServer({
  serverName: 'moodle-mcp-question-bank',
  scriptName: 'moodle-mcp-question-bank.js',
  tools: QUESTION_BANK_TOOLS,
  readOnlyToolNames: QUESTION_BANK_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeQuestionBankTool(callMoodle, name, args),
  activityMcp: QUESTION_BANK_MCP_METADATA,
});
