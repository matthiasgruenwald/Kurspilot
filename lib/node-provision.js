'use strict';

/**
 * node-provision.js
 *
 * Beschafft eine ausfuehrbare Node-Binary fuer den curl/PowerShell-Bootstrap
 * (Issue #122, siehe docs/adr/0008-curl-bootstrap-vertrieb.md). Der erste
 * Livetest scheiterte u.a. an einem Architektur-Mismatch bei einem
 * gebuendelten Binary - dieses Modul vermeidet das, indem es bei Bedarf das
 * offizielle, architektur-passende Node-Tarball direkt von nodejs.org laedt.
 *
 * Reihenfolge (siehe ADR, "Node-Beschaffung, idempotent"):
 *   1. existiert bereits ein Kurspilot-eigenes Node? -> nutzen, nicht erneut laden.
 *   2. sonst: System-Node auf PATH, Version >= 18? -> nutzen.
 *   3. sonst: offizielles Tarball architektur-passend laden und entpacken.
 *
 * DI-Pattern wie lib/setup-flow.js: `fetch`/`extract`/`existsSync`/etc. sind
 * austauschbar, damit dieses Modul ohne echtes Netz/Dateisystem testbar ist.
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const NODE_MIN_MAJOR_VERSION = 18;
const NODE_DIST_VERSION = 'v20.11.0';

/**
 * OS+Arch -> Download-Ziel als Datentabelle (nicht verzweigte if/else-Logik).
 * Ein neues Ziel (z.B. Linux) ist ein zusaetzlicher Tabelleneintrag, kein Umbau.
 * `archiveType` steuert das Entpackformat (tar.gz vs. zip).
 */
const NODE_DOWNLOAD_TABLE = {
  'darwin-arm64': {
    url: `https://nodejs.org/dist/${NODE_DIST_VERSION}/node-${NODE_DIST_VERSION}-darwin-arm64.tar.gz`,
    archiveType: 'tar.gz',
    binaryRelativePath: ['bin', 'node'],
  },
  'darwin-x64': {
    url: `https://nodejs.org/dist/${NODE_DIST_VERSION}/node-${NODE_DIST_VERSION}-darwin-x64.tar.gz`,
    archiveType: 'tar.gz',
    binaryRelativePath: ['bin', 'node'],
  },
  'win32-x64': {
    url: `https://nodejs.org/dist/${NODE_DIST_VERSION}/node-${NODE_DIST_VERSION}-win-x64.zip`,
    archiveType: 'zip',
    binaryRelativePath: ['node.exe'],
  },
  'win32-arm64': {
    url: `https://nodejs.org/dist/${NODE_DIST_VERSION}/node-${NODE_DIST_VERSION}-win-arm64.zip`,
    archiveType: 'zip',
    binaryRelativePath: ['node.exe'],
  },
};

/**
 * Ablageort des Kurspilot-eigenen Node (siehe ADR, "Ablageorte"):
 * macOS/Linux: ~/.kurspilot/node, Windows: %LOCALAPPDATA%\Kurspilot\node.
 */
function getKurspilotNodeDir({ homeDir, platform, localAppData } = {}) {
  if (platform === 'win32') {
    const resolvedLocalAppData = localAppData || path.join(homeDir, 'AppData', 'Local');
    return path.join(resolvedLocalAppData, 'Kurspilot', 'node');
  }
  return path.join(homeDir, '.kurspilot', 'node');
}

function platformArchKey(platform, arch) {
  return `${platform}-${arch}`;
}

function defaultCommandExistsOnPath(command, pathEnv, existsSync, isExecutable) {
  for (const dir of String(pathEnv || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    if (existsSync(candidate) && isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function defaultGetSystemNodeVersion(nodePath, execFileSync) {
  try {
    return execFileSync(nodePath, ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function majorVersionOf(versionString) {
  const match = /^v?(\d+)\./.exec(String(versionString || ''));
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Liefert den Pfad zu einer ausfuehrbaren Node-Binary (siehe Modul-Doku fuer
 * die Reihenfolge). Wirft, wenn ein Tarball-Download noetig ist, aber OS+Arch
 * nicht in NODE_DOWNLOAD_TABLE steht (z.B. Linux, aktuell zurueckgestellt).
 *
 * @param {object} options
 * @param {string} options.homeDir
 * @param {string} options.platform z.B. 'darwin' | 'win32'
 * @param {string} options.arch z.B. 'arm64' | 'x64'
 * @param {string} [options.pathEnv] PATH-Umgebungsvariable (Tests/DI)
 * @param {string} [options.localAppData] nur Windows (Tests/DI)
 * @param {Function} [options.existsSync] austauschbar (Tests/DI)
 * @param {Function} [options.isExecutable] austauschbar (Tests/DI)
 * @param {Function} [options.getSystemNodeVersion] austauschbar (Tests/DI),
 *   erhaelt den gefundenen System-Node-Pfad, liefert Versionsstring oder null
 * @param {Function} options.fetch async (url) => Buffer - austauschbar (Tests/DI)
 * @param {Function} options.extract async (buffer, destDir, archiveType) => void
 * @returns {Promise<{binaryPath: string, source: 'kurspilot'|'system'|'downloaded'}>}
 */
async function resolveNodeBinary(options = {}) {
  const {
    homeDir = os.homedir(),
    platform = process.platform,
    arch = process.arch,
    pathEnv = process.env.PATH,
    localAppData,
    existsSync = fs.existsSync,
    isExecutable = defaultIsExecutable,
    getSystemNodeVersion,
    fetch: fetchFn,
    extract: extractFn,
  } = options;

  const kurspilotNodeDir = getKurspilotNodeDir({ homeDir, platform, localAppData });
  const kurspilotBinaryPath = getBinaryPathForTarget(kurspilotNodeDir, platform, arch);

  if (existsSync(kurspilotBinaryPath)) {
    return { binaryPath: kurspilotBinaryPath, source: 'kurspilot' };
  }

  const systemNodeCommand = platform === 'win32' ? 'node.exe' : 'node';
  const systemNodePath = defaultCommandExistsOnPath(systemNodeCommand, pathEnv, existsSync, isExecutable);
  if (systemNodePath) {
    const versionFn = getSystemNodeVersion || (() => null);
    const version = versionFn(systemNodePath);
    if (majorVersionOf(version) >= NODE_MIN_MAJOR_VERSION) {
      return { binaryPath: systemNodePath, source: 'system' };
    }
  }

  const targetKey = platformArchKey(platform, arch);
  const target = NODE_DOWNLOAD_TABLE[targetKey];
  if (!target) {
    throw new Error(
      `Node-Download fuer ${targetKey} wird nicht unterstuetzt (not supported). ` +
      'Unterstuetzt: ' + Object.keys(NODE_DOWNLOAD_TABLE).join(', ') + '.'
    );
  }

  const archiveBuffer = await fetchFn(target.url);
  await extractFn(archiveBuffer, kurspilotNodeDir, target.archiveType);

  return { binaryPath: kurspilotBinaryPath, source: 'downloaded' };
}

function getBinaryPathForTarget(nodeDir, platform, arch) {
  const target = NODE_DOWNLOAD_TABLE[platformArchKey(platform, arch)];
  const relativePath = target ? target.binaryRelativePath : (platform === 'win32' ? ['node.exe'] : ['bin', 'node']);
  return path.join(nodeDir, ...relativePath);
}

function defaultIsExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  resolveNodeBinary,
  getKurspilotNodeDir,
  NODE_DOWNLOAD_TABLE,
  NODE_MIN_MAJOR_VERSION,
  NODE_DIST_VERSION,
};
