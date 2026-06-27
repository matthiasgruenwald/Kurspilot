'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  installConfiguratorShortcut,
  SHORTCUT_NAME,
} = require('../lib/shortcut-install');

function fakeWriteFile() {
  const writtenFiles = {};
  const writeFile = (filePath, content) => {
    writtenFiles[filePath] = content;
  };
  return { writeFile, writtenFiles };
}

// --- Windows ----------------------------------------------------------------

test('Windows: legt ein VBS-Hilfsskript an und fuehrt es mit cscript aus, um die .lnk im Startmenue zu erzeugen', () => {
  const { writeFile, writtenFiles } = fakeWriteFile();
  const execCalls = [];

  const result = installConfiguratorShortcut({
    platform: 'win32',
    homeDir: 'C:\\Users\\Lehrkraft',
    nodePath: 'C:\\Users\\Lehrkraft\\AppData\\Local\\Kurspilot\\node\\node.exe',
    appPath: 'C:\\Users\\Lehrkraft\\AppData\\Local\\Kurspilot\\app',
    writeFile,
    execFile: (command, args) => { execCalls.push({ command, args }); },
  });

  // ein .vbs-Hilfsskript wurde geschrieben
  const vbsPath = Object.keys(writtenFiles).find(filePath => filePath.endsWith('.vbs'));
  assert.ok(vbsPath, 'erwartet eine geschriebene .vbs-Datei');

  const vbsContent = writtenFiles[vbsPath];
  // VBS muss CreateShortcut, Zielpfad im Startmenue, TargetPath und Arguments enthalten
  assert.match(vbsContent, /WScript\.CreateObject\("WScript\.Shell"\)/);
  assert.match(vbsContent, /CreateShortcut/);
  assert.match(vbsContent, new RegExp(escapeRegExp(SHORTCUT_NAME)));
  assert.match(vbsContent, /AppData.Roaming.Microsoft.Windows.Start Menu.Programs/);
  assert.match(vbsContent, /node\.exe/);
  assert.match(vbsContent, /setup-kurspilot\.js/);

  // cscript wurde mit dieser Datei aufgerufen
  assert.strictEqual(execCalls.length, 1);
  assert.match(execCalls[0].command, /cscript/i);
  assert.ok(execCalls[0].args.includes(vbsPath));

  assert.strictEqual(result.platform, 'win32');
  assert.ok(result.shortcutPath.endsWith('.lnk'));
  assert.ok(result.shortcutPath.includes('Start Menu'));
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- macOS --------------------------------------------------------------------

test('macOS: schreibt ein .app-Buendel nach ~/Applications mit Info.plist und Launcher-Skript', () => {
  const { writeFile, writtenFiles } = fakeWriteFile();
  const mkdirCalls = [];

  const result = installConfiguratorShortcut({
    platform: 'darwin',
    homeDir: '/Users/lehrkraft',
    nodePath: '/Users/lehrkraft/.kurspilot/node/bin/node',
    appPath: '/Users/lehrkraft/.kurspilot/app',
    writeFile,
    mkdirSync: (dir) => { mkdirCalls.push(dir); },
  });

  const appBundleDir = path.join('/Users/lehrkraft', 'Applications', `${SHORTCUT_NAME}.app`);
  const infoPlistPath = path.join(appBundleDir, 'Contents', 'Info.plist');
  const launcherPath = path.join(appBundleDir, 'Contents', 'MacOS', SHORTCUT_NAME);

  assert.ok(writtenFiles[infoPlistPath], 'erwartet eine geschriebene Info.plist');
  assert.match(writtenFiles[infoPlistPath], /CFBundleName/);
  assert.match(writtenFiles[infoPlistPath], new RegExp(escapeRegExp(SHORTCUT_NAME)));

  assert.ok(writtenFiles[launcherPath], 'erwartet ein geschriebenes Launcher-Skript');
  assert.match(writtenFiles[launcherPath], /#!\/bin\/sh/);
  assert.match(writtenFiles[launcherPath], /node\/bin\/node/);
  assert.match(writtenFiles[launcherPath], /setup-kurspilot\.js/);

  assert.strictEqual(result.platform, 'darwin');
  assert.strictEqual(result.shortcutPath, appBundleDir);
});

test('macOS: legt die noetigen Verzeichnisse rekursiv an', () => {
  const { writeFile } = fakeWriteFile();
  const mkdirCalls = [];

  installConfiguratorShortcut({
    platform: 'darwin',
    homeDir: '/Users/lehrkraft',
    nodePath: '/Users/lehrkraft/.kurspilot/node/bin/node',
    appPath: '/Users/lehrkraft/.kurspilot/app',
    writeFile,
    mkdirSync: (dir, options) => { mkdirCalls.push({ dir, options }); },
  });

  const macosDir = path.join('/Users/lehrkraft', 'Applications', `${SHORTCUT_NAME}.app`, 'Contents', 'MacOS');
  const call = mkdirCalls.find(c => c.dir === macosDir);
  assert.ok(call, 'erwartet mkdirSync fuer Contents/MacOS');
  assert.strictEqual(call.options.recursive, true);
});

// --- Linux ----------------------------------------------------------------

test('Linux: schreibt eine .desktop-Datei nach ~/.local/share/applications', () => {
  const { writeFile, writtenFiles } = fakeWriteFile();
  const mkdirCalls = [];

  const result = installConfiguratorShortcut({
    platform: 'linux',
    homeDir: '/home/lehrkraft',
    nodePath: '/home/lehrkraft/.kurspilot/node/bin/node',
    appPath: '/home/lehrkraft/.kurspilot/app',
    writeFile,
    mkdirSync: (dir) => { mkdirCalls.push(dir); },
  });

  const desktopFilePath = path.join('/home/lehrkraft', '.local', 'share', 'applications', 'kurspilot.desktop');
  assert.ok(writtenFiles[desktopFilePath], 'erwartet eine geschriebene .desktop-Datei');

  const content = writtenFiles[desktopFilePath];
  assert.match(content, /\[Desktop Entry\]/);
  assert.match(content, /Type=Application/);
  assert.match(content, new RegExp(`Name=${escapeRegExp(SHORTCUT_NAME)}`));
  assert.match(content, /Exec=.*node\/bin\/node.*setup-kurspilot\.js/);

  assert.strictEqual(result.platform, 'linux');
  assert.strictEqual(result.shortcutPath, desktopFilePath);
});

// --- gemeinsamer Befehl ----------------------------------------------------

test('alle drei Plattformen zeigen auf denselben Befehl: <nodePath> <appPath>/scripts/setup-kurspilot.js', () => {
  const nodePath = '/x/node';
  const appPath = '/x/app';
  const expectedScript = path.join(appPath, 'scripts', 'setup-kurspilot.js');

  for (const platform of ['win32', 'darwin', 'linux']) {
    const { writeFile, writtenFiles } = fakeWriteFile();
    installConfiguratorShortcut({
      platform,
      homeDir: platform === 'win32' ? 'C:\\Users\\Lehrkraft' : '/home/lehrkraft',
      nodePath,
      appPath,
      writeFile,
      execFile: () => {},
      mkdirSync: () => {},
    });

    const allContent = Object.values(writtenFiles).join('\n');
    assert.ok(allContent.includes(nodePath), `${platform}: nodePath fehlt im Inhalt`);
    assert.ok(allContent.includes(expectedScript) || allContent.includes(expectedScript.replace(/\\/g, '\\\\')),
      `${platform}: Skriptpfad fehlt im Inhalt`);
  }
});

test('nicht unterstuetzte Plattform wirft einen Fehler', () => {
  assert.throws(() => {
    installConfiguratorShortcut({
      platform: 'sunos',
      homeDir: '/home/lehrkraft',
      nodePath: '/x/node',
      appPath: '/x/app',
      writeFile: () => {},
    });
  }, /sunos/);
});
