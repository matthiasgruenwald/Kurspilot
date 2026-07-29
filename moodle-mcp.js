#!/usr/bin/env node
/**
 * moodle-mcp.js
 * MCP stdio server – verbindet Claude Desktop mit der Moodle REST API
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort. Dieser Entry-Point
 * kombiniert alle Aktivitaets- und Core-Tool-Module zu einem Vollprofil.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const { CORE_TOOLS, CORE_READ_ONLY_TOOL_NAMES, executeCoreTool, isCoreTool } = require('./lib/core-tools');
const { PAGE_TOOLS, executePageTool, isPageTool } = require('./lib/page-tools');
const { LABEL_TOOLS, executeLabelTool, isLabelTool } = require('./lib/label-tools');
const { URL_TOOLS, executeUrlTool, isUrlTool } = require('./lib/url-tools');
const { RESOURCE_TOOLS, executeResourceTool, isResourceTool } = require('./lib/resource-tools');
const { FOLDER_TOOLS, executeFolderTool, isFolderTool } = require('./lib/folder-tools');
const { CHOICE_TOOLS, executeChoiceTool, isChoiceTool } = require('./lib/choice-tools');
const { FORUM_TOOLS, executeForumTool, isForumTool } = require('./lib/forum-tools');
const { ASSIGN_TOOLS, executeAssignTool, isAssignTool } = require('./lib/assign-tools');
const { QUIZ_TOOLS, executeQuizTool, isQuizTool } = require('./lib/quiz-tools');
const {
  QUESTION_BANK_TOOLS,
  QUESTION_BANK_READ_ONLY_TOOL_NAMES,
  executeQuestionBankTool,
  isQuestionBankTool,
} = require('./lib/question-bank-tools');

// ─────────────────────────────────────────────────────────────
// Tool-Definitionen
// ─────────────────────────────────────────────────────────────
const TOOLS = [
  // Page-, Label-, URL-, Assign-, Quiz-Tools (Issue #90/#91): aktivitaetsspezifische
  // Tools, geteilt mit den eigenstaendigen moodle-mcp-page.js,
  // moodle-mcp-label.js, moodle-mcp-url.js, moodle-mcp-assign.js, moodle-mcp-quiz.js
  ...LABEL_TOOLS,
  ...URL_TOOLS,
  ...RESOURCE_TOOLS,
  ...FOLDER_TOOLS,
  ...CHOICE_TOOLS,
  ...FORUM_TOOLS,
  ...PAGE_TOOLS,
  ...ASSIGN_TOOLS,
  ...QUIZ_TOOLS,
  ...QUESTION_BANK_TOOLS,
  // Core-Tools (Issue #89): aktivitaetsunabhaengige Sections/Module/Completion/
  // Restriction/Katalog-Tools, geteilt mit dem eigenstaendigen moodle-mcp-core.js
  ...CORE_TOOLS,
];

const READ_ONLY_TOOL_NAMES = new Set([
  "moodle_get_modules",
  "moodle_get_sections",
  "moodle_get_course_catalog",
  ...QUESTION_BANK_READ_ONLY_TOOL_NAMES,
]);

// ─────────────────────────────────────────────────────────────
// Tool-Ausführung: an das passende Aktivitaets-/Core-Modul weiterreichen
// ─────────────────────────────────────────────────────────────
async function executeTool(callMoodle, name, args) {
  if (isCoreTool(name)) {
    return await executeCoreTool(callMoodle, name, args);
  }

  if (isLabelTool(name)) {
    return await executeLabelTool(callMoodle, name, args);
  }

  if (isUrlTool(name)) {
    return await executeUrlTool(callMoodle, name, args);
  }

  if (isResourceTool(name)) {
    return await executeResourceTool(callMoodle, name, args);
  }

  if (isFolderTool(name)) {
    return await executeFolderTool(callMoodle, name, args);
  }

  if (isChoiceTool(name)) {
    return await executeChoiceTool(callMoodle, name, args);
  }

  if (isForumTool(name)) {
    return await executeForumTool(callMoodle, name, args);
  }

  if (isPageTool(name)) {
    return await executePageTool(callMoodle, name, args);
  }

  if (isAssignTool(name)) {
    return await executeAssignTool(callMoodle, name, args);
  }

  if (isQuizTool(name)) {
    return await executeQuizTool(callMoodle, name, args);
  }

  if (isQuestionBankTool(name)) {
    return await executeQuestionBankTool(callMoodle, name, args);
  }

  throw new Error(`Unbekanntes Tool: ${name}`);
}

startMcpServer({
  serverName: 'moodle-mcp',
  scriptName: 'moodle-mcp.js',
  tools: TOOLS,
  readOnlyToolNames: READ_ONLY_TOOL_NAMES,
  executeTool,
});
