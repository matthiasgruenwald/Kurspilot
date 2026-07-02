'use strict';

/**
 * tool-registry.js (Issue #151: Deklarative Tool-Registry statt Switch-Case-Dispatch)
 *
 * Ein Tool-Modul (z.B. lib/core-tools.js) ist ein TOOLS[]-Array aus
 * {name, description, inputSchema, readOnly?, handler(args, callMoodle)}.
 * dispatchTool() ist der eine gemeinsame Lookup+Call-Helfer, den alle 7
 * execute*Tool()-Funktionen nutzen, statt je ein eigenes switch-case zu
 * pflegen. Bewusst eine einzelne Funktion statt einer Registry-Klasse
 * (ponytail) - Schema-Validierung selbst lebt zentral in der Runtime aus
 * Issue #147 (lib/mcp-server-runtime.js), an der Systemgrenze vor dem Aufruf
 * hierher.
 */
function dispatchTool(tools, name, args, callMoodle, unknownMessage) {
  const tool = tools.find(t => t.name === name);
  if (!tool) {
    throw new Error(unknownMessage || `Unbekanntes Tool: ${name}`);
  }
  return tool.handler(args, callMoodle);
}

module.exports = { dispatchTool };
