#!/usr/bin/env node
/**
 * moodle-mcp-folder.js
 * MCP stdio server – Folder-MCP (Issue #222, ADR 0007 "Aktivitaets-MCP-Aufteilung")
 *
 * Eigenstaendiger stdio-Prozess fuer die Folder-Tools (mod_folder /
 * Verzeichnis): erstellen, umbenennen, Dateien (auch in Unterverzeichnisse)
 * hochladen. Andere Aktivitaetstypen bleiben in moodle-mcp.js bzw. ihren
 * eigenen Prozessen.
 *
 * Duenner Konfig-Wrapper um die gemeinsame Laufzeit (Issue #147,
 * lib/mcp-server-runtime.js) - Loop-Logik lebt dort.
 */

const { startMcpServer } = require('./lib/mcp-server-runtime');
const {
  FOLDER_TOOLS,
  FOLDER_READ_ONLY_TOOL_NAMES,
  executeFolderTool,
} = require('./lib/folder-tools');

startMcpServer({
  serverName: 'moodle-mcp-folder',
  scriptName: 'moodle-mcp-folder.js',
  tools: FOLDER_TOOLS,
  readOnlyToolNames: FOLDER_READ_ONLY_TOOL_NAMES,
  executeTool: (callMoodle, name, args) => executeFolderTool(callMoodle, name, args),
});
