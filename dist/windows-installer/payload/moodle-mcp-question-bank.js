#!/usr/bin/env node
/**
 * moodle-mcp-question-bank.js
 * MCP stdio server – Fragensammlung-MCP (Issue #92, ADR 0007)
 *
 * Eigenstaendiger stdio-Prozess fuer benannte Fragensammlungen,
 * Fragenkategorien und MC-Fragen. Das MCP bleibt unabhaengig startbar; Quiz
 * deklariert die strukturelle Abhaengigkeit auf dieses MCP separat.
 */

const { createMoodleClient } = require('./lib/moodle-client');
const {
  QUESTION_BANK_MCP_METADATA,
  QUESTION_BANK_TOOLS,
  QUESTION_BANK_READ_ONLY_TOOL_NAMES,
  executeQuestionBankTool,
} = require('./lib/question-bank-tools');

const MOODLE_URL = process.env.MOODLE_URL || process.argv[2] || "";
const MOODLE_TOKEN = process.env.MOODLE_TOKEN || process.argv[3] || "";
const MCP_PROFILE = process.env.MOODLE_MCP_PROFILE || "full";

if (!MOODLE_URL || !MOODLE_TOKEN) {
  process.stderr.write(
    "Fehler: MOODLE_URL und MOODLE_TOKEN müssen gesetzt sein.\n" +
    "Entweder als Umgebungsvariable oder als Argument:\n" +
    "  node moodle-mcp-question-bank.js https://moodle.example.de/moodle DEIN_TOKEN\n"
  );
  process.exit(1);
}

const { callMoodle } = createMoodleClient(MOODLE_URL, MOODLE_TOKEN);

function isReadOnlyProfile() {
  return MCP_PROFILE === "readonly" || MCP_PROFILE === "read-only";
}

function toolsForProfile() {
  if (!isReadOnlyProfile()) return QUESTION_BANK_TOOLS;
  return QUESTION_BANK_TOOLS.filter(tool => QUESTION_BANK_READ_ONLY_TOOL_NAMES.has(tool.name));
}

async function executeTool(name, args) {
  if (isReadOnlyProfile() && !QUESTION_BANK_READ_ONLY_TOOL_NAMES.has(name)) {
    throw new Error(`Tool ${name} ist im read-only Moodle-MCP-Profil nicht verfuegbar.`);
  }
  return await executeQuestionBankTool(callMoodle, name, args);
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function handleRequest(req) {
  const { id, method, params } = req;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "moodle-mcp-question-bank",
          version: "1.0.0",
          activityMcp: QUESTION_BANK_MCP_METADATA,
        },
      },
    });
    return;
  }

  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: toolsForProfile() } });
    return;
  }

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

  if (method && method.startsWith("notifications/")) return;

  send({
    jsonrpc: "2.0", id,
    error: { code: -32601, message: `Methode nicht gefunden: ${method}` },
  });
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop();
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
