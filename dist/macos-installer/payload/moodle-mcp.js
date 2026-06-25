#!/usr/bin/env node
/**
 * moodle-mcp.js
 * MCP stdio server – verbindet Claude Desktop mit der Moodle REST API
 *
 * Konfiguration: Umgebungsvariablen oder direkt unten eintragen
 */

const { createMoodleClient } = require('./lib/moodle-client');
const { CORE_TOOLS, CORE_READ_ONLY_TOOL_NAMES, executeCoreTool, isCoreTool } = require('./lib/core-tools');
const { PAGE_TOOLS, executePageTool, isPageTool } = require('./lib/page-tools');
const { LABEL_TOOLS, executeLabelTool, isLabelTool } = require('./lib/label-tools');
const { URL_TOOLS, executeUrlTool, isUrlTool } = require('./lib/url-tools');
const { ASSIGN_TOOLS, executeAssignTool, isAssignTool } = require('./lib/assign-tools');
const { QUIZ_TOOLS, executeQuizTool, isQuizTool } = require('./lib/quiz-tools');
const {
  QUESTION_BANK_TOOLS,
  QUESTION_BANK_READ_ONLY_TOOL_NAMES,
  executeQuestionBankTool,
  isQuestionBankTool,
} = require('./lib/question-bank-tools');

const MOODLE_URL   = process.env.MOODLE_URL   || process.argv[2] || "";
const MOODLE_TOKEN = process.env.MOODLE_TOKEN  || process.argv[3] || "";
const MCP_PROFILE  = process.env.MOODLE_MCP_PROFILE || "full";

if (!MOODLE_URL || !MOODLE_TOKEN) {
  process.stderr.write(
    "Fehler: MOODLE_URL und MOODLE_TOKEN müssen gesetzt sein.\n" +
    "Entweder als Umgebungsvariable oder als Argument:\n" +
    "  node moodle-mcp.js https://moodle.example.de/moodle DEIN_TOKEN\n"
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Moodle REST API Hilfsfunktion (geteilt mit moodle-mcp-core.js)
// ─────────────────────────────────────────────────────────────
const { callMoodle } = createMoodleClient(MOODLE_URL, MOODLE_TOKEN);

// ─────────────────────────────────────────────────────────────
// Tool-Definitionen
// ─────────────────────────────────────────────────────────────
const TOOLS = [
  // Page-, Label-, URL-, Assign-, Quiz-Tools (Issue #90/#91): aktivitaetsspezifische
  // Tools, geteilt mit den eigenstaendigen moodle-mcp-page.js,
  // moodle-mcp-label.js, moodle-mcp-url.js, moodle-mcp-assign.js, moodle-mcp-quiz.js
  ...LABEL_TOOLS,
  ...URL_TOOLS,
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

function isReadOnlyProfile() {
  return MCP_PROFILE === "readonly" || MCP_PROFILE === "read-only";
}

function toolsForProfile() {
  if (!isReadOnlyProfile()) return TOOLS;
  return TOOLS.filter(tool => READ_ONLY_TOOL_NAMES.has(tool.name));
}

// ─────────────────────────────────────────────────────────────
// Tool-Ausführung
// ─────────────────────────────────────────────────────────────
async function executeTool(name, args) {
  if (isReadOnlyProfile() && !READ_ONLY_TOOL_NAMES.has(name)) {
    throw new Error(`Tool ${name} ist im read-only Moodle-MCP-Profil nicht verfuegbar.`);
  }

  if (isCoreTool(name)) {
    return await executeCoreTool(callMoodle, name, args);
  }

  if (isLabelTool(name)) {
    return await executeLabelTool(callMoodle, name, args);
  }

  if (isUrlTool(name)) {
    return await executeUrlTool(callMoodle, name, args);
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

// ─────────────────────────────────────────────────────────────
// MCP stdio Protokoll
// ─────────────────────────────────────────────────────────────
function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function handleRequest(req) {
  const { id, method, params } = req;

  // initialize
  if (method === "initialize") {
    send({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "moodle-mcp", version: "1.0.0" },
      },
    });
    return;
  }

  // tools/list
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: toolsForProfile() } });
    return;
  }

  // tools/call
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    executeTool(name, args)
      .then(result => {
        send({
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      })
      .catch(err => {
        send({
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: `Fehler: ${err.message}` }],
            isError: true,
          },
        });
      });
    return;
  }

  // notifications (keine Antwort nötig)
  if (method && method.startsWith("notifications/")) return;

  // unbekannte Methode
  send({
    jsonrpc: "2.0", id,
    error: { code: -32601, message: `Methode nicht gefunden: ${method}` },
  });
}

// ─────────────────────────────────────────────────────────────
// stdin lesen
// ─────────────────────────────────────────────────────────────
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop(); // letztes (unvollständiges) Element behalten
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      handleRequest(JSON.parse(trimmed));
    } catch (e) {
      // JSON-Parse-Fehler ignorieren
    }
  }
});

process.stdin.on("end", () => process.exit(0));
process.stderr.write("Moodle MCP Server gestartet\n");

// ── set_completion ──────────────────────────────────────────────────────────
// (appended by update 1.0.5)
