'use strict';

/**
 * Erzeugt/mergt die nutzerweiten Codex- und Claude-MCP-Konfigurationen
 * fuer das Kurspilot-Paket (Issue #65). Schreibt ausschliesslich die
 * dokumentierten Speicherorte aus README.md ("Claude Desktop konfigurieren",
 * "Codex konfigurieren"):
 *
 *   - Claude Desktop: claude_desktop_config.json (JSON, "mcpServers"-Objekt)
 *   - Codex:          ~/.codex/config.toml ([mcp_servers.NAME]-Tabellen)
 *
 * Beide Eintraege rufen ausschliesslich scripts/start-mcp.js auf (siehe
 * docs/adr/0006-node-helper-fuer-moodle-token-speicher.md). Es werden nie
 * Moodle-URL oder -Token in die generierte Konfiguration geschrieben - der
 * Wrapper liest sie erst zur Laufzeit aus dem Schluesselbund.
 *
 * Bewusst kein generisches Config-Management-Framework: nur die zwei
 * dokumentierten Pfade/Formate werden unterstuetzt (karpathy-guidelines).
 */

const fs = require('node:fs');
const path = require('node:path');
const { getDefaultBundle, listActivities, resolveDependencies } = require('./activity-registry');

const LEGACY_ENTRY_NAMES = ['kurspilot-planung', 'kurspilot-umsetzung'];
const CORE_SERVER = 'core';
const DEFAULT_PROFILE = 'full';

/**
 * Baut die Kurspilot-MCP-Eintraege: Core immer, dazu je ein eigener Eintrag
 * pro ausgewaehltem Aktivitaets-MCP. Die Eintraege rufen ausschliesslich den
 * tokenfreien Wrapper scripts/start-mcp.js auf.
 */
function buildKurspilotEntries(startMcpPath, nodeExecPath, options = {}) {
  const serverIds = getSelectedServerIds(options.selectedActivityIds);
  const entries = {};
  for (const serverId of serverIds) {
    entries[`kurspilot-${serverId}`] = {
      command: nodeExecPath,
      args: [startMcpPath, '--server', serverId],
    };
  }
  return entries;
}

function getSelectedActivityIds(selectedActivityIds) {
  const requestedActivityIds = selectedActivityIds === undefined
    ? getDefaultBundle()
    : [...selectedActivityIds];
  return resolveDependencies(requestedActivityIds);
}

function getSelectedServerIds(selectedActivityIds) {
  return [CORE_SERVER, ...getSelectedActivityIds(selectedActivityIds)];
}

function listManagedEntryNames(selectedActivityIds) {
  return [
    ...LEGACY_ENTRY_NAMES,
    ...getSelectedServerIds(selectedActivityIds).map((serverId) => `kurspilot-${serverId}`),
  ];
}

function listAllManagedEntryNames() {
  return listManagedEntryNames(listActivities().map((activity) => activity.id));
}

function backupExistingFile(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.bak-${timestamp}`;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

// --- Claude Desktop (JSON) --------------------------------------------------

/**
 * Erzeugt oder mergt claude_desktop_config.json mit den Kurspilot-Eintraegen.
 * Fremde Top-Level-Keys und fremde mcpServers-Eintraege bleiben erhalten.
 * Vor dem Ueberschreiben einer vorhandenen Datei wird ein Backup angelegt.
 */
function setupClaudeDesktopConfig(configPath, startMcpPath, nodeExecPath, options = {}) {
  const created = !fs.existsSync(configPath);
  const backupPath = created ? null : backupExistingFile(configPath);

  let config = {};
  if (!created) {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = raw.trim() ? JSON.parse(raw) : {};
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  for (const entryName of listAllManagedEntryNames()) {
    delete config.mcpServers[entryName];
  }

  const kurspilotEntries = buildKurspilotEntries(startMcpPath, nodeExecPath, options);
  config.mcpServers = { ...config.mcpServers, ...kurspilotEntries };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  return { created, backupPath, configPath };
}

/**
 * Erzeugt oder mergt ~/.claude.json mit den Kurspilot-Eintraegen (Issue #112-
 * Folgefehler: lokale Claude-Code-Sessions lesen ihre MCP-Server aus dieser
 * Datei, nicht aus claude_desktop_config.json - das ist eine vom Cowork-
 * Remote-Bridge-Mechanismus unabhaengige zweite Speicherstelle). Gleiche
 * Merge-/Backup-Semantik wie setupClaudeDesktopConfig.
 */
function setupClaudeCodeConfig(configPath, startMcpPath, nodeExecPath, options = {}) {
  return setupClaudeDesktopConfig(configPath, startMcpPath, nodeExecPath, options);
}

// --- Codex (TOML) ------------------------------------------------------------

function buildCodexEntryBlock(entryName, startMcpPath, nodeExecPath, serverId) {
  return [
    `[mcp_servers.${entryName}]`,
    `command = "${nodeExecPath}"`,
    `args = ["${startMcpPath}", "--server", "${serverId}"]`,
    'startup_timeout_sec = 30',
    '',
    `[mcp_servers.${entryName}.env]`,
    `MOODLE_MCP_PROFILE = "${DEFAULT_PROFILE}"`,
    `MOODLE_MCP_SERVER = "${serverId}"`,
    '',
  ].join('\n');
}

function buildCodexBlocks(startMcpPath, nodeExecPath, options = {}) {
  return getSelectedServerIds(options.selectedActivityIds).map((serverId) =>
    buildCodexEntryBlock(`kurspilot-${serverId}`, startMcpPath, nodeExecPath, serverId)
  ).join('\n');
}

/**
 * Entfernt einen vorhandenen `[mcp_servers.<entryName>]`-Block (inklusive
 * seiner Unter-Tabelle `[mcp_servers.<entryName>.env]`, falls vorhanden) aus
 * dem TOML-Text. Nur textuelles Tabellen-Matching - kein vollwertiger
 * TOML-Parser, bewusst beschraenkt auf das dokumentierte Format.
 */
function removeTomlTable(tomlText, entryName) {
  const escapedName = entryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tableHeaderPattern = new RegExp(
    `^\\[mcp_servers\\.${escapedName}(?:\\.[A-Za-z0-9_-]+)?\\]\\s*$`
  );

  const lines = tomlText.split('\n');
  const keptLines = [];
  let skipping = false;

  for (const line of lines) {
    const isAnyTableHeader = /^\[.*\]\s*$/.test(line.trim());
    if (isAnyTableHeader) {
      skipping = tableHeaderPattern.test(line.trim());
      if (skipping) continue;
    }
    if (!skipping) {
      keptLines.push(line);
    }
  }

  return keptLines.join('\n');
}

/**
 * Erzeugt oder mergt ~/.codex/config.toml mit den Kurspilot-MCP-Blocks.
 * Fremde [mcp_servers.*]-Blocks bleiben erhalten. Vor dem Ueberschreiben
 * einer vorhandenen Datei wird ein Backup angelegt.
 */
function setupCodexConfig(configPath, startMcpPath, nodeExecPath, options = {}) {
  const created = !fs.existsSync(configPath);
  const backupPath = created ? null : backupExistingFile(configPath);

  let tomlText = created ? '' : fs.readFileSync(configPath, 'utf8');

  for (const entryName of listAllManagedEntryNames()) {
    tomlText = removeTomlTable(tomlText, entryName);
  }

  const trimmed = tomlText.replace(/\s+$/, '');
  const newBlocks = buildCodexBlocks(startMcpPath, nodeExecPath, options);
  tomlText = trimmed ? `${trimmed}\n\n${newBlocks}` : newBlocks;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${tomlText.replace(/\s+$/, '')}\n`);

  return { created, backupPath, configPath };
}

/**
 * Entfernt die Kurspilot-mcpServers-Eintraege wieder aus
 * claude_desktop_config.json. Fremde Eintraege und Top-Level-Keys bleiben
 * erhalten. No-Op, wenn die Datei nicht existiert. Fuer den Uninstall-Flow
 * (lib/uninstall-flow.js).
 */
function removeKurspilotEntriesFromClaudeConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return { removed: false, backupPath: null, configPath };
  }

  const backupPath = backupExistingFile(configPath);
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = raw.trim() ? JSON.parse(raw) : {};

  if (config.mcpServers && typeof config.mcpServers === 'object') {
    for (const entryName of listAllManagedEntryNames()) {
      delete config.mcpServers[entryName];
    }
  }

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  return { removed: true, backupPath, configPath };
}

/**
 * Entfernt die Kurspilot-[mcp_servers.*]-Blocks wieder aus
 * ~/.codex/config.toml. Fremde Blocks bleiben erhalten. No-Op, wenn die
 * Datei nicht existiert. Fuer den Uninstall-Flow (lib/uninstall-flow.js).
 */
function removeKurspilotEntriesFromCodexConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return { removed: false, backupPath: null, configPath };
  }

  const backupPath = backupExistingFile(configPath);
  let tomlText = fs.readFileSync(configPath, 'utf8');

  for (const entryName of listAllManagedEntryNames()) {
    tomlText = removeTomlTable(tomlText, entryName);
  }

  fs.writeFileSync(configPath, `${tomlText.replace(/\s+$/, '')}\n`);

  return { removed: true, backupPath, configPath };
}

/**
 * Entfernt die Kurspilot-mcpServers-Eintraege wieder aus ~/.claude.json.
 * Fuer den Uninstall-Flow (lib/uninstall-flow.js), Gegenstueck zu
 * setupClaudeCodeConfig.
 */
function removeKurspilotEntriesFromClaudeCodeConfig(configPath) {
  return removeKurspilotEntriesFromClaudeConfig(configPath);
}

module.exports = {
  buildKurspilotEntries,
  setupClaudeDesktopConfig,
  setupClaudeCodeConfig,
  setupCodexConfig,
  removeKurspilotEntriesFromClaudeConfig,
  removeKurspilotEntriesFromClaudeCodeConfig,
  removeKurspilotEntriesFromCodexConfig,
};
