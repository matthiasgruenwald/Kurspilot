#!/usr/bin/env node
/**
 * moodle-mcp-quiz.js
 * MCP stdio server – Quiz-MCP (Issue #91, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die Quiz-Tools (mod_quiz): erstellen,
 * Settings aendern, Fragen hinzufuegen. Andere Aktivitaetstypen (Label, URL,
 * Page, Assign, Fragensammlung) bleiben vorerst in moodle-mcp.js bzw. werden
 * in eigenen Prozessen ausgeliefert.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const {
  QUIZ_MCP_METADATA,
  QUIZ_TOOLS,
  QUIZ_READ_ONLY_TOOL_NAMES,
  executeQuizTool,
} = require('./lib/quiz-tools');

startMcpServer({
  serverName: 'moodle-mcp-quiz',
  scriptName: 'moodle-mcp-quiz.js',
  tools: QUIZ_TOOLS,
  readOnlyToolNames: QUIZ_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeQuizTool(callMoodle, name, args),
  activityMcp: QUIZ_MCP_METADATA,
});
