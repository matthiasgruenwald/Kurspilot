'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
    detect({ homeDir, platform, pathEnv, appData, localAppData }) {
      if (platform === 'win32') {
        return commandExistsOnPath('codex', pathEnv) ||
          fs.existsSync(path.join(homeDir, '.codex')) ||
          fs.existsSync(path.join(appData, 'Codex')) ||
          fs.existsSync(path.join(localAppData, 'Codex')) ||
          fs.existsSync(path.join(localAppData, 'OpenAI', 'Codex'));
      }
      return commandExistsOnPath('codex', pathEnv) ||
        executableExists(path.join(homeDir, '.local', 'bin', 'codex')) ||
        fs.existsSync(path.join(homeDir, '.codex'));
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
          fs.existsSync(path.join(homeDir, '.claude')) ||
          fs.existsSync(path.join(appData, 'Claude')) ||
          fs.existsSync(path.join(localAppData, 'Claude')) ||
          fs.existsSync(path.join(localAppData, 'Programs', 'Claude')) ||
          fs.existsSync(path.join(localAppData, 'AnthropicClaude'));
      }
      return fs.existsSync('/Applications/Claude.app') ||
        commandExistsOnPath('claude', pathEnv) ||
        fs.existsSync(path.join(homeDir, '.claude'));
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

  const context = { homeDir, platform, pathEnv, appData, localAppData };
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
