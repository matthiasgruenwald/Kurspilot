'use strict';

/**
 * mcp-server-runtime.js (Issue #147: JSON-RPC-Loop aus 8 Entry-Points teilen)
 *
 * Gemeinsame Laufzeit fuer alle Moodle-MCP-stdio-Entry-Points: Credential-Check,
 * Profil-Filterung (read-only), JSON-RPC-Request-Handling (initialize,
 * tools/list, tools/call), stdin-Buffering und Fehler-Serialisierung.
 *
 * Reine Konsolidierung der zuvor in jedem Entry-Point identisch kopierten
 * Loop-Logik - kein Verhaltensunterschied im MCP-Protokoll.
 *
 * Jeder Entry-Point ruft startMcpServer(config) mit seiner eigenen
 * Tool-Konfiguration auf:
 *   {
 *     serverName: 'moodle-mcp-quiz',
 *     tools: QUIZ_TOOLS,
 *     readOnlyToolNames: QUIZ_READ_ONLY_TOOL_NAMES,
 *     executeTool: (callMoodle, name, args) => executeQuizTool(callMoodle, name, args),
 *     activityMcp: QUIZ_MCP_METADATA, // optional
 *   }
 */

const { createMoodleClient } = require('./moodle-client');

function readCredentialsFromEnvOrArgv() {
  const moodleUrl = process.env.MOODLE_URL || process.argv[2] || '';
  const moodleToken = process.env.MOODLE_TOKEN || process.argv[3] || '';
  return { moodleUrl, moodleToken };
}

function startMcpServer({ serverName, tools, readOnlyToolNames, executeTool, activityMcp, scriptName }) {
  const MCP_PROFILE = process.env.MOODLE_MCP_PROFILE || 'full';
  const { moodleUrl, moodleToken } = readCredentialsFromEnvOrArgv();

  if (!moodleUrl || !moodleToken) {
    process.stderr.write(
      'Fehler: MOODLE_URL und MOODLE_TOKEN müssen gesetzt sein.\n' +
      'Entweder als Umgebungsvariable oder als Argument:\n' +
      `  node ${scriptName} https://moodle.example.de/moodle DEIN_TOKEN\n`
    );
    process.exit(1);
    return;
  }

  const { callMoodle } = createMoodleClient(moodleUrl, moodleToken);

  function isReadOnlyProfile() {
    return MCP_PROFILE === 'readonly' || MCP_PROFILE === 'read-only';
  }

  function toolsForProfile() {
    if (!isReadOnlyProfile()) return tools;
    return tools.filter(tool => readOnlyToolNames.has(tool.name));
  }

  async function executeToolForProfile(name, args) {
    if (isReadOnlyProfile() && !readOnlyToolNames.has(name)) {
      throw new Error(`Tool ${name} ist im read-only Moodle-MCP-Profil nicht verfuegbar.`);
    }
    return await executeTool(callMoodle, name, args);
  }

  function send(obj) {
    process.stdout.write(JSON.stringify(obj) + '\n');
  }

  function handleRequest(req) {
    const { id, method, params } = req;

    // initialize
    if (method === 'initialize') {
      const serverInfo = { name: serverName, version: '1.0.0' };
      if (activityMcp) {
        serverInfo.activityMcp = activityMcp;
      }
      send({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo,
        },
      });
      return;
    }

    // tools/list
    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: toolsForProfile() } });
      return;
    }

    // tools/call
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      executeToolForProfile(name, args)
        .then(result => {
          send({
            jsonrpc: '2.0', id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
          });
        })
        .catch(err => {
          send({
            jsonrpc: '2.0', id,
            result: {
              content: [{ type: 'text', text: `Fehler: ${err.message}` }],
              isError: true,
            },
          });
        });
      return;
    }

    // notifications (keine Antwort nötig)
    if (method && method.startsWith('notifications/')) return;

    // unbekannte Methode
    send({
      jsonrpc: '2.0', id,
      error: { code: -32601, message: `Methode nicht gefunden: ${method}` },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // stdin lesen
  // ─────────────────────────────────────────────────────────────
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk;
    const lines = buffer.split('\n');
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

  process.stdin.on('end', () => process.exit(0));
  process.stderr.write('Moodle MCP Server gestartet\n');
}

module.exports = { startMcpServer };
