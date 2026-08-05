'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function executableExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExistsOnPath(command, pathEnv = process.env.PATH) {
  for (const dir of String(pathEnv || '').split(path.delimiter)) {
    if (dir && executableExists(path.join(dir, command))) {
      return true;
    }
  }
  return false;
}

function getWindowsStorePackageLocations(packageName) {
  try {
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-AppxPackage -Name ${packageName} | Select-Object -ExpandProperty InstallLocation`,
    ], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    return result.status === 0
      ? result.stdout.split(/\r?\n/).map(location => location.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function getStorePackageLocationsFromWindowsApps(windowsAppsDir, packagePrefix) {
  try {
    return fs.readdirSync(windowsAppsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith(`${packagePrefix}_`))
      .map(entry => path.join(windowsAppsDir, entry.name));
  } catch {
    return [];
  }
}

function storeAppExists(packageLocations, executableNames) {
  return packageLocations.some(packageLocation =>
    executableNames.some(executable =>
      fs.existsSync(path.join(packageLocation, 'app', executable))
    )
  );
}

function getWindowsAppData(homeDir) {
  return process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
}

function getClaudeDesktopConfigPath(homeDir) {
  if (process.platform === 'win32') {
    return path.join(getWindowsAppData(homeDir), 'Claude', 'claude_desktop_config.json');
  }
  return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
}

function getClaudeCodeConfigPath(homeDir) {
  return path.join(homeDir, '.claude.json');
}

function getOpenCodeConfigPath(homeDir, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'win32') {
    const appData = options.appData || process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    return path.join(appData, 'opencode', 'opencode.json');
  }
  return path.join(homeDir, '.config', 'opencode', 'opencode.json');
}

const CLIENTS = {
  codex: {
    id: 'codex',
    label: 'Codex',
    installLink: 'https://chatgpt.com/codex',
    providerRoot: '.agents/skills',
    skillTargetRoot(homeDir) {
      return path.join(homeDir, '.codex', 'skills');
    },
    configPaths(homeDir) {
      return [path.join(homeDir, '.codex', 'config.toml')];
    },
    detect({ homeDir, platform, pathEnv, appData, localAppData, windowsAppsDir, getWindowsStorePackageLocations: getStoreLocations, getWindowsAppsPackageLocations }) {
      if (platform === 'win32') {
        if (commandExistsOnPath('codex', pathEnv) ||
          fs.existsSync(path.join(localAppData, 'Codex', 'Codex.exe')) ||
          fs.existsSync(path.join(localAppData, 'OpenAI', 'Codex', 'Codex.exe'))) {
          return true;
        }
        const storePackageLocations = getStoreLocations('OpenAI.Codex');
        return storeAppExists(storePackageLocations, ['Codex.exe', 'ChatGPT.exe']) ||
          storeAppExists(getWindowsAppsPackageLocations(windowsAppsDir, 'OpenAI.Codex'), ['Codex.exe', 'ChatGPT.exe']);
      }
      return commandExistsOnPath('codex', pathEnv) ||
        executableExists(path.join(homeDir, '.local', 'bin', 'codex'));
    },
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    installLink: 'https://claude.ai/download',
    providerRoot: '.claude/skills',
    skillTargetRoot(homeDir) {
      return path.join(homeDir, '.claude', 'skills');
    },
    configPaths(homeDir) {
      return [getClaudeDesktopConfigPath(homeDir), getClaudeCodeConfigPath(homeDir)];
    },
    detect({ homeDir, platform, pathEnv, appData, localAppData }) {
      if (platform === 'win32') {
        return commandExistsOnPath('claude', pathEnv) ||
          fs.existsSync(path.join(localAppData, 'Programs', 'Claude', 'Claude.exe')) ||
          fs.existsSync(path.join(localAppData, 'AnthropicClaude', 'Claude.exe')) ||
          fs.existsSync(path.join(localAppData, 'Claude', 'Claude.exe'));
      }
      return fs.existsSync('/Applications/Claude.app') ||
        commandExistsOnPath('claude', pathEnv);
    },
  },
  opencode: {
    id: 'opencode',
    label: 'opencode',
    installLink: 'https://opencode.ai',
    providerRoot: '.opencode/skills',
    skillTargetRoot(homeDir) {
      return path.join(homeDir, '.agents', 'skills');
    },
    configPaths(homeDir) {
      return [getOpenCodeConfigPath(homeDir)];
    },
    detect({ homeDir, platform, pathEnv, appData, localAppData }) {
      if (platform === 'win32') {
        return commandExistsOnPath('opencode', pathEnv) ||
          fs.existsSync(path.join(appData, 'opencode')) ||
          fs.existsSync(path.join(localAppData, 'opencode')) ||
          fs.existsSync(path.join(localAppData, 'Programs', 'opencode')) ||
          fs.existsSync(path.join(homeDir, '.local', 'share', 'opencode'));
      }
      return commandExistsOnPath('opencode', pathEnv) ||
        fs.existsSync(path.join(homeDir, '.config', 'opencode'));
    },
  },
};

const CLIENT_IDS = Object.keys(CLIENTS);

const OFFICIAL_INSTALL_LINKS = Object.fromEntries(
  CLIENT_IDS.map(id => [id, CLIENTS[id].installLink])
);

function detectClients(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const platform = options.platform || process.platform;
  const pathEnv = Object.hasOwn(options, 'pathEnv') ? options.pathEnv : process.env.PATH;
  const appData = options.appData || process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
  const localAppData = options.localAppData || process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
  const windowsAppsDir = options.windowsAppsDir || path.join(
    process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files',
    'WindowsApps'
  );
  const getStoreLocations = options.getWindowsStorePackageLocations || getWindowsStorePackageLocations;
  const getWindowsAppsPackageLocations = options.getWindowsAppsPackageLocations || getStorePackageLocationsFromWindowsApps;

  const context = {
    homeDir,
    platform,
    pathEnv,
    appData,
    localAppData,
    windowsAppsDir,
    getWindowsStorePackageLocations: getStoreLocations,
    getWindowsAppsPackageLocations,
  };
  return Object.fromEntries(
    CLIENT_IDS.map(id => [id, CLIENTS[id].detect(context)])
  );
}

function clientLabel(clientId) {
  const client = CLIENTS[clientId];
  return client ? client.label : clientId;
}

module.exports = {
  CLIENTS,
  CLIENT_IDS,
  OFFICIAL_INSTALL_LINKS,
  detectClients,
  clientLabel,
  getClaudeDesktopConfigPath,
  getClaudeCodeConfigPath,
  getOpenCodeConfigPath,
};
