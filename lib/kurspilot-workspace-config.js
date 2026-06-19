'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function requireNonEmptyText(value, label) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return trimmed;
}

function getKurspilotWorkspaceConfigPath(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  const appData = options.appData || process.env.APPDATA;

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Kurspilot', 'config.json');
  }

  if (platform === 'win32') {
    return path.join(appData || path.join(homeDir, 'AppData', 'Roaming'), 'Kurspilot', 'config.json');
  }

  return path.join(homeDir, '.config', 'kurspilot', 'config.json');
}

function writeKurspilotWorkspaceSetting(contextRoot, options = {}) {
  const normalizedContextRoot = path.resolve(requireNonEmptyText(contextRoot, 'contextRoot'));
  const configPath = getKurspilotWorkspaceConfigPath(options);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify({ contextRoot: normalizedContextRoot }, null, 2)}\n`);

  return {
    configPath,
    contextRoot: normalizedContextRoot,
  };
}

function readKurspilotWorkspaceSetting(options = {}) {
  const configPath = getKurspilotWorkspaceConfigPath(options);

  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      status: 'missing',
      configPath,
      message: 'Arbeitsbereich-Einstellung fehlt. Bitte das Kurspilot-Konfigurationsprogramm ausfuehren.',
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const contextRoot = requireNonEmptyText(parsed && parsed.contextRoot, 'contextRoot');

    return {
      ok: true,
      status: 'configured',
      configPath,
      contextRoot,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'unreadable',
      configPath,
      message: `Arbeitsbereich-Einstellung konnte nicht gelesen werden: ${error.message}`,
    };
  }
}

module.exports = {
  getKurspilotWorkspaceConfigPath,
  readKurspilotWorkspaceSetting,
  writeKurspilotWorkspaceSetting,
};
