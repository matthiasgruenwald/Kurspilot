'use strict';

/**
 * shortcut-install.js
 *
 * Schreibt eine wiederauffindbare Verknuepfung "Kurspilot konfigurieren"
 * (Issue #127, siehe docs/adr/0008-curl-bootstrap-vertrieb.md, Abschnitt
 * "Updates und Skill-Konflikte"). Zero-dependency: kein
 * `create-desktop-shortcuts`-Paket, da das die Zero-Runtime-Dependency-Regel
 * aus CLAUDE.md verletzen wuerde - alles wird hier selbst geschrieben.
 *
 * Design (siehe ADR "Signing/Gatekeeper"): die Verknuepfung wird lokal vom
 * eigenen Skript erzeugt, nicht herunterladen - dadurch traegt sie nie das
 * Quarantaene-Flag, das Gatekeeper/SmartScreen ausloest. Auffindbarkeit ist
 * das Ziel (Spotlight/Startmenue-Suche "Kurspilot"), kein Desktop-Icon.
 *
 * Plattform-Strategien:
 *   - Windows: echtes COM-Objekt (WScript.Shell.CreateShortcut) gibt es nur
 *     unter cscript.exe/wscript.exe, nicht aus Node heraus aufrufbar ohne
 *     natives Modul. Deshalb generiert dieses Modul den Text eines
 *     VBScript-Hilfsskripts, schreibt es (austauschbar via writeFile) und
 *     fuehrt es per cscript aus (austauschbar via execFile) - das Skript
 *     selbst erzeugt die .lnk via COM. Genau dieses Vorgehen nutzen auch
 *     reale Tools (z.B. das von der ADR bewusst NICHT verwendete
 *     create-desktop-shortcuts-Paket).
 *   - macOS: ein minimales .app-Buendel wird von Hand geschrieben
 *     (Contents/Info.plist + Contents/MacOS/<name> als Shell-Loader-Skript).
 *     Kein osacompile/zusaetzliches CLI-Tool noetig. Nach ~/Applications,
 *     weil das Spotlight-indexiert ist (nicht /Applications, das ist ohne
 *     Admin-Rechte i.d.R. nicht beschreibbar). Per Finder-Doppelklick gibt
 *     es kein Terminal fuer stdout/stderr (Issue #144: "Doppelklick zeigt
 *     gar nichts" liess sich nicht diagnostizieren) - der Loader schreibt
 *     deshalb nach ~/Library/Logs/Kurspilot/setup.log.
 *   - Linux: eine .desktop-Datei nach Freedesktop-Spec, reiner Text.
 *
 * DI-Pattern wie lib/node-provision.js / lib/app-provision.js: `writeFile`,
 * `mkdirSync`, `execFile` sind austauschbar, damit dieses Modul ohne
 * Dateisystem-/Prozess-Zugriff testbar ist.
 */

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const SHORTCUT_NAME = 'Kurspilot konfigurieren';
const SETUP_SCRIPT_RELATIVE_PATH = ['scripts', 'setup-kurspilot.js'];

function getSetupScriptPath(appPath) {
  return path.join(appPath, ...SETUP_SCRIPT_RELATIVE_PATH);
}

function defaultMkdirSync(dir, options) {
  fs.mkdirSync(dir, options);
}

function defaultExecFile(command, args) {
  execFileSync(command, args, { encoding: 'utf8' });
}

// --- Windows ----------------------------------------------------------------

function vbsStringLiteral(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildShortcutVbScript({ shortcutPath, nodePath, setupScriptPath, appPath }) {
  const lines = [
    'Set oWS = WScript.CreateObject("WScript.Shell")',
    `sLinkFile = ${vbsStringLiteral(shortcutPath)}`,
    'Set oLink = oWS.CreateShortcut(sLinkFile)',
    `oLink.TargetPath = ${vbsStringLiteral(nodePath)}`,
    `oLink.Arguments = ${vbsStringLiteral(setupScriptPath)}`,
    `oLink.WorkingDirectory = ${vbsStringLiteral(appPath)}`,
    `oLink.Description = ${vbsStringLiteral(SHORTCUT_NAME)}`,
    'oLink.Save',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

function installWindowsShortcut({ homeDir, nodePath, appPath, writeFile, execFile }) {
  const setupScriptPath = getSetupScriptPath(appPath);
  const startMenuDir = path.join(homeDir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const shortcutPath = path.join(startMenuDir, `${SHORTCUT_NAME}.lnk`);
  const vbsPath = path.join(os.tmpdir(), 'kurspilot-create-shortcut.vbs');

  const vbsContent = buildShortcutVbScript({ shortcutPath, nodePath, setupScriptPath, appPath });
  writeFile(vbsPath, vbsContent);
  execFile('cscript.exe', ['//nologo', vbsPath]);

  return { platform: 'win32', shortcutPath };
}

// --- macOS --------------------------------------------------------------------

function buildMacInfoPlist() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>CFBundleName</key>',
    `  <string>${SHORTCUT_NAME}</string>`,
    '  <key>CFBundleExecutable</key>',
    `  <string>${SHORTCUT_NAME}</string>`,
    '  <key>CFBundleIdentifier</key>',
    '  <string>org.kurspilot.configurator</string>',
    '  <key>CFBundlePackageType</key>',
    '  <string>APPL</string>',
    '  <key>CFBundleShortVersionString</key>',
    '  <string>1.0</string>',
    '  <key>LSUIElement</key>',
    '  <false/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function buildMacLauncherScript({ nodePath, setupScriptPath, logPath }) {
  const logDir = path.dirname(logPath);
  return [
    '#!/bin/sh',
    `mkdir -p ${shellQuote(logDir)}`,
    `exec ${shellQuote(nodePath)} ${shellQuote(setupScriptPath)} >> ${shellQuote(logPath)} 2>&1`,
    '',
  ].join('\n');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function installMacShortcut({ homeDir, nodePath, appPath, writeFile, mkdirSync }) {
  const setupScriptPath = getSetupScriptPath(appPath);
  const bundleDir = path.join(homeDir, 'Applications', `${SHORTCUT_NAME}.app`);
  const contentsDir = path.join(bundleDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const logPath = path.join(homeDir, 'Library', 'Logs', 'Kurspilot', 'setup.log');

  mkdirSync(macosDir, { recursive: true });

  writeFile(path.join(contentsDir, 'Info.plist'), buildMacInfoPlist());

  const launcherPath = path.join(macosDir, SHORTCUT_NAME);
  writeFile(launcherPath, buildMacLauncherScript({ nodePath, setupScriptPath, logPath }));
  try {
    fs.chmodSync(launcherPath, 0o755);
  } catch {
    // im Test ohne echtes Dateisystem nicht vorhanden - kein harter Fehler.
  }

  return { platform: 'darwin', shortcutPath: bundleDir };
}

// --- Linux ----------------------------------------------------------------

function buildDesktopEntry({ nodePath, setupScriptPath }) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${SHORTCUT_NAME}`,
    `Exec=${nodePath} ${setupScriptPath}`,
    'Terminal=false',
    'Categories=Education;',
    '',
  ].join('\n');
}

function installLinuxShortcut({ homeDir, nodePath, appPath, writeFile, mkdirSync }) {
  const setupScriptPath = getSetupScriptPath(appPath);
  const applicationsDir = path.join(homeDir, '.local', 'share', 'applications');
  const shortcutPath = path.join(applicationsDir, 'kurspilot.desktop');

  mkdirSync(applicationsDir, { recursive: true });
  writeFile(shortcutPath, buildDesktopEntry({ nodePath, setupScriptPath }));

  return { platform: 'linux', shortcutPath };
}

// --- Einstiegspunkt ---------------------------------------------------------

/**
 * Schreibt die plattformspezifische Verknuepfung "Kurspilot konfigurieren",
 * die <nodePath> <appPath>/scripts/setup-kurspilot.js startet.
 *
 * @param {object} options
 * @param {string} [options.platform] z.B. 'win32' | 'darwin' | 'linux'
 * @param {string} [options.homeDir]
 * @param {string} options.nodePath
 * @param {string} options.appPath
 * @param {Function} options.writeFile (filePath, content) => void - austauschbar (Tests/DI)
 * @param {Function} [options.mkdirSync] (dir, options) => void - austauschbar (Tests/DI)
 * @param {Function} [options.execFile] (command, args) => void - austauschbar (Tests/DI), nur Windows
 * @returns {{platform: string, shortcutPath: string}}
 */
function installConfiguratorShortcut(options = {}) {
  const {
    platform = process.platform,
    homeDir = os.homedir(),
    nodePath,
    appPath,
    writeFile,
    mkdirSync = defaultMkdirSync,
    execFile = defaultExecFile,
  } = options;

  if (platform === 'win32') {
    return installWindowsShortcut({ homeDir, nodePath, appPath, writeFile, execFile });
  }
  if (platform === 'darwin') {
    return installMacShortcut({ homeDir, nodePath, appPath, writeFile, mkdirSync });
  }
  if (platform === 'linux') {
    return installLinuxShortcut({ homeDir, nodePath, appPath, writeFile, mkdirSync });
  }

  throw new Error(
    `Verknuepfung fuer Plattform ${platform} wird nicht unterstuetzt (not supported). ` +
    'Unterstuetzt: win32, darwin, linux.'
  );
}

module.exports = {
  installConfiguratorShortcut,
  SHORTCUT_NAME,
};
