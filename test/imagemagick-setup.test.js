'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  isImageMagickInstalled,
  resolveMagickBinary,
  installImageMagickWindows,
  installImageMagick,
  isHomebrewInstalled,
  getKurspilotImageMagickDir,
  IMAGEMAGICK_DOWNLOAD_TABLE,
  WINDOWS_PORTABLE_ZIP_URL,
} = require('../lib/imagemagick-setup');

test('isImageMagickInstalled: true, wenn "magick -version" ohne Fehler laeuft', () => {
  const calls = [];
  const result = isImageMagickInstalled({
    execFileSync: (command, args) => {
      calls.push({ command, args });
      return 'Version: ImageMagick 7.1.1-39\n';
    },
  });

  assert.strictEqual(result, true);
  assert.deepStrictEqual(calls, [{ command: 'magick', args: ['-version'] }]);
});

test('isImageMagickInstalled: false, wenn "magick" fehlschlaegt oder fehlt', () => {
  const result = isImageMagickInstalled({
    execFileSync: () => {
      throw new Error('magick ist nicht gefunden');
    },
    existsSync: () => false,
  });

  assert.strictEqual(result, false);
});

// --- resolveMagickBinary ---------------------------------------------------

test('resolveMagickBinary: gibt "magick" zurueck, wenn magick im PATH liegt (win32)', () => {
  const binary = resolveMagickBinary({
    platform: 'win32',
    existsSync: () => false,
  });
  assert.strictEqual(binary, 'magick');
});

test('resolveMagickBinary: gibt vollen Kurspilot-Pfad zurueck, wenn magick nicht im PATH aber im Kurspilot-Verzeichnis liegt (win32)', () => {
  const homeDir = 'C:\\Users\\mg';
  const localAppData = 'C:\\Users\\mg\\AppData\\Local';
  const expected = path.join(getKurspilotImageMagickDir({ homeDir, platform: 'win32', localAppData }), 'magick.exe');

  const binary = resolveMagickBinary({
    platform: 'win32',
    homeDir,
    localAppData,
    existsSync: (p) => p === expected,
  });

  assert.strictEqual(binary, expected);
});

test('resolveMagickBinary: gibt "convert" zurueck auf macOS/Linux (kein Kurspilot-Pfad)', () => {
  assert.strictEqual(resolveMagickBinary({ platform: 'darwin' }), 'convert');
  assert.strictEqual(resolveMagickBinary({ platform: 'linux' }), 'convert');
});

test('isImageMagickInstalled: true, wenn magick nicht im PATH aber im Kurspilot-Verzeichnis (win32)', () => {
  const homeDir = 'C:\\Users\\mg';
  const localAppData = 'C:\\Users\\mg\\AppData\\Local';
  const fullPath = path.join(getKurspilotImageMagickDir({ homeDir, platform: 'win32', localAppData }), 'magick.exe');
  const calls = [];

  const result = isImageMagickInstalled({
    platform: 'win32',
    homeDir,
    localAppData,
    existsSync: (p) => p === fullPath,
    execFileSync: (command, args) => {
      calls.push(command);
      if (command === 'magick') throw new Error('nicht im PATH');
      return '';
    },
  });

  assert.strictEqual(result, true);
  assert.ok(calls.includes(fullPath), 'muss vollen Kurspilot-Pfad probieren');
});

test('installImageMagickWindows: laedt das portable Zip per PowerShell ohne winget/UAC und meldet Erfolg', () => {
  const calls = [];
  const result = installImageMagickWindows({
    platform: 'win32',
    homeDir: 'C:\\Users\\Lehrkraft',
    localAppData: 'C:\\Users\\Lehrkraft\\AppData\\Local',
    execFileSync: (command, args) => {
      calls.push({ command, args });
      return '';
    },
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.strictEqual(calls[0].command, 'powershell.exe');
  assert.ok(calls[0].args.includes('-NoProfile'));
  const psCommand = calls[0].args[calls[0].args.length - 1];
  assert.match(psCommand, /Invoke-WebRequest/);
  assert.match(psCommand, /tar -xf/);
  assert.ok(psCommand.includes(WINDOWS_PORTABLE_ZIP_URL), 'muss die portable Archiv-URL nutzen (kein winget/UAC)');
});

test('installImageMagickWindows: meldet Fehler, wenn der PowerShell-Download fehlschlaegt', () => {
  const result = installImageMagickWindows({
    platform: 'win32',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: () => {
      throw new Error('Download fehlgeschlagen');
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /Download fehlgeschlagen/);
});

test('installImageMagickWindows: gibt echten PowerShell-stderr statt nur "Command failed" weiter (Issue #129)', () => {
  const result = installImageMagickWindows({
    platform: 'win32',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: () => {
      const err = new Error('Command failed: powershell.exe -NoProfile -Command ...');
      err.stderr = Buffer.from('Invoke-WebRequest : Der Remoteserver hat einen Fehler zurueckgegeben: (403) Verboten.\n');
      throw err;
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /403/);
  assert.doesNotMatch(result.error, /Command failed/);
});

test('installImageMagickWindows: meldet auf Nicht-Windows-Plattformen nicht-unterstuetzt, ohne PowerShell aufzurufen', () => {
  let called = false;
  const result = installImageMagickWindows({
    platform: 'darwin',
    execFileSync: () => {
      called = true;
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /nur unter Windows/);
  assert.strictEqual(called, false);
});

// --- installImageMagick: arch-erkennend, OS-uebergreifend -------------------

test('installImageMagick: erkennt vorhandene Installation plattformuebergreifend und installiert nicht erneut', () => {
  let execCalled = false;
  let fetchCalled = false;
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    execFileSync: () => {
      execCalled = true;
      return 'Version: ImageMagick 7.1.1-39\n';
    },
    fetch: async () => { fetchCalled = true; return Buffer.from(''); },
    extract: async () => {},
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.strictEqual(execCalled, true, 'muss magick -version pruefen');
  assert.strictEqual(fetchCalled, false, 'darf bei vorhandener Installation nicht laden');
});

test('installImageMagick: Windows x64 laedt das portable Zip per PowerShell (kein winget/UAC)', () => {
  let calls = [];
  const result = installImageMagick({
    platform: 'win32',
    arch: 'x64',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: (command, args) => {
      if (command === 'magick') throw new Error('nicht gefunden');
      calls.push({ command, args });
      return '';
    },
    fetch: async () => Buffer.from(''),
    extract: async () => {},
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.strictEqual(calls[0].command, 'powershell.exe');
  const psCommand = calls[0].args[calls[0].args.length - 1];
  assert.ok(psCommand.includes(WINDOWS_PORTABLE_ZIP_URL));
});

test('installImageMagick: Windows arm64 nutzt denselben synchronen PowerShell-Pfad wie x64 (kein async/Promise, kein stiller Fehler in setup-flow)', () => {
  // ARM64-Windows in Parallels (Apple Silicon) braeche ohne diesen Pfad still:
  // die alte async-Zip-Methode lieferte eine Promise, die runSetupFlow() nicht
  // awaitete -> executedSteps nie befuellt, kein Fehler sichtbar.
  // x64-Binary laeuft auf ARM64-Windows via Emulation.
  let calls = [];
  const result = installImageMagick({
    platform: 'win32',
    arch: 'arm64',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: (command, args) => {
      if (command === 'magick') throw new Error('nicht gefunden');
      calls.push({ command, args });
      return '';
    },
  });

  assert.ok(!(result instanceof Promise), 'muss synchrones Objekt liefern, keine Promise');
  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.strictEqual(calls[0].command, 'powershell.exe');
  const psCommand = calls[0].args[calls[0].args.length - 1];
  assert.ok(psCommand.includes(WINDOWS_PORTABLE_ZIP_URL), 'muss WINDOWS_PORTABLE_ZIP_URL verwenden');
});

// --- macOS: Brew-Installation (Issue #137) -----------------------------------

test('isHomebrewInstalled: true, wenn "brew --version" ohne Fehler laeuft', () => {
  const calls = [];
  const result = isHomebrewInstalled({
    execFileSync: (command, args) => {
      calls.push({ command, args });
      return 'Homebrew 4.3.0\n';
    },
  });

  assert.strictEqual(result, true);
  assert.deepStrictEqual(calls, [{ command: 'brew', args: ['--version'] }]);
});

test('isHomebrewInstalled: false, wenn "brew" fehlschlaegt oder fehlt', () => {
  const result = isHomebrewInstalled({
    execFileSync: () => {
      throw new Error('brew ist nicht gefunden');
    },
    existsSync: () => false,
  });

  assert.strictEqual(result, false);
});

test('isHomebrewInstalled: true ueber bekannten absoluten Pfad, wenn "brew" nicht im PATH liegt (#140, GUI-Start ohne Shell-PATH)', () => {
  const result = isHomebrewInstalled({
    execFileSync: () => {
      throw new Error('brew ist nicht im PATH');
    },
    existsSync: candidate => candidate === '/opt/homebrew/bin/brew',
  });

  assert.strictEqual(result, true);
});

test('installImageMagick: macOS (arm64/x64) mit Homebrew bereits installiert installiert ImageMagick direkt per "brew install"', () => {
  const calls = [];
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    execFileSync: (command, args) => {
      if (command === 'magick') throw new Error('magick nicht gefunden');
      calls.push({ command, args });
      if (command === 'brew' && args[0] === '--version') return 'Homebrew 4.3.0\n';
      return '';
    },
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.ok(
    calls.some(call => call.command === 'brew' && call.args[0] === 'install' && call.args.includes('imagemagick')),
    'muss "brew install imagemagick" aufrufen'
  );
});

test('installImageMagick: force:true repariert eine bereits vorhandene macOS-Installation per "brew reinstall" statt nichts zu tun (#142)', () => {
  const calls = [];
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    force: true,
    execFileSync: (command, args) => {
      // magick -version wuerde hier erfolgreich laufen (schon installiert) -
      // wird absichtlich NICHT abgefragt, da force den Kurzschluss umgeht.
      if (command === 'magick') return 'Version: ImageMagick 7.1.1-39\n';
      calls.push({ command, args });
      if (command === 'brew' && args[0] === '--version') return 'Homebrew 4.3.0\n';
      return '';
    },
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.ok(
    calls.some(call => call.command === 'brew' && call.args[0] === 'reinstall' && call.args.includes('imagemagick')),
    'muss "brew reinstall imagemagick" aufrufen, nicht "install" (#142: Reparatur einer bestehenden, ggf. defekten Installation)'
  );
});

test('installImageMagick: ohne force wird eine vorhandene Installation NICHT erneut angefasst (bestehendes Verhalten bleibt)', () => {
  let execCalled = false;
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    execFileSync: () => {
      execCalled = true;
      return 'Version: ImageMagick 7.1.1-39\n';
    },
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(execCalled, true, 'genau ein magick -version Check, kein brew-Aufruf');
});

test('installImageMagick: macOS findet bereits installiertes Homebrew ueber den absoluten Pfad und installiert ImageMagick direkt, statt Homebrew neu zu installieren (#140)', () => {
  const calls = [];
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    execFileSync: (command, args) => {
      if (command === 'magick') throw new Error('magick nicht gefunden');
      if (command === 'brew' && args[0] === '--version') throw new Error('brew nicht im PATH (GUI-Start)');
      calls.push({ command, args });
      return '';
    },
    existsSync: candidate => candidate === '/opt/homebrew/bin/brew',
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  assert.ok(
    !calls.some(call => /\/bin\/bash$|^bash$/.test(call.command)),
    'darf Homebrew NICHT neu installieren, wenn es bereits unter /opt/homebrew/bin existiert'
  );
  assert.ok(
    calls.some(call => call.command === '/opt/homebrew/bin/brew' && call.args[0] === 'install' && call.args.includes('imagemagick')),
    'muss "brew install imagemagick" ueber den absoluten Pfad aufrufen, nicht ueber das (leere) PATH'
  );
});

test('installImageMagick: macOS (arm64/x64) ohne Homebrew installiert zuerst Homebrew, dann ImageMagick', () => {
  const calls = [];
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'x64',
    execFileSync: (command, args) => {
      if (command === 'magick') throw new Error('magick nicht gefunden');
      if (command === 'brew' && args[0] === '--version') throw new Error('brew nicht gefunden');
      calls.push({ command, args });
      return '';
    },
    existsSync: () => false,
  });

  assert.strictEqual(result.installed, true);
  assert.strictEqual(result.error, null);
  const brewInstallCommand = calls.find(call => /\/bin\/bash$|^bash$/.test(call.command));
  assert.ok(brewInstallCommand, 'muss das offizielle Homebrew-Installationsskript per bash ausfuehren');
  assert.ok(
    calls.some(call => call.command === 'brew' && call.args[0] === 'install' && call.args.includes('imagemagick')),
    'muss nach Homebrew-Installation "brew install imagemagick" aufrufen'
  );
});

test('installImageMagick: macOS meldet verstaendlichen Fehler, wenn die Homebrew-Installation fehlschlaegt, statt zu crashen', () => {
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    execFileSync: (command, args) => {
      if (command === 'magick') throw new Error('magick nicht gefunden');
      if (command === 'brew' && args[0] === '--version') throw new Error('brew nicht gefunden');
      const err = new Error('Command failed');
      err.stderr = Buffer.from('curl: (6) Could not resolve host\n');
      throw err;
    },
    existsSync: () => false,
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /Homebrew/);
  assert.match(result.error, /Could not resolve host/);
});

test('installImageMagick: macOS meldet verstaendlichen Fehler, wenn "brew install imagemagick" fehlschlaegt, statt zu crashen', () => {
  const result = installImageMagick({
    platform: 'darwin',
    arch: 'arm64',
    execFileSync: (command, args) => {
      if (command === 'magick') throw new Error('magick nicht gefunden');
      if (command === 'brew' && args[0] === '--version') return 'Homebrew 4.3.0\n';
      if (command === 'brew' && args[0] === 'install') {
        const err = new Error('Command failed');
        err.stderr = Buffer.from('Error: imagemagick: no bottle available\n');
        throw err;
      }
      return '';
    },
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /imagemagick/);
  assert.match(result.error, /no bottle available/);
});

test('installImageMagick: macOS darwin-arm64/darwin-x64 haben einen method:"brew"-Tabelleneintrag', () => {
  assert.strictEqual(IMAGEMAGICK_DOWNLOAD_TABLE['darwin-arm64'].method, 'brew');
  assert.strictEqual(IMAGEMAGICK_DOWNLOAD_TABLE['darwin-x64'].method, 'brew');
});

test('installImageMagick: Linux ist als Tabelleneintrag vorbereitet (AppImage), aber nicht aktiv getestet', () => {
  assert.ok(IMAGEMAGICK_DOWNLOAD_TABLE['linux-x64'], 'Linux-x64-Eintrag muss in der Datentabelle vorbereitet sein');
  assert.strictEqual(IMAGEMAGICK_DOWNLOAD_TABLE['linux-x64'].method, 'appimage');
});

test('installImageMagick: unbekannte OS+Arch-Kombination meldet Fehler statt zu crashen', async () => {
  const result = await installImageMagick({
    platform: 'sunos',
    arch: 'sparc',
    homeDir: '/home/lehrkraft',
    execFileSync: () => { throw new Error('magick nicht gefunden'); },
    fetch: async () => Buffer.from(''),
    extract: async () => {},
  });

  assert.strictEqual(result.installed, false);
  assert.ok(result.error);
});

test('installImageMagick: meldet Fehler, wenn der PowerShell-Download fehlschlaegt (Windows)', () => {
  const result = installImageMagick({
    platform: 'win32',
    arch: 'x64',
    homeDir: 'C:\\Users\\Lehrkraft',
    execFileSync: (command) => {
      if (command === 'magick') throw new Error('nicht gefunden');
      throw new Error('Download fehlgeschlagen');
    },
    fetch: async () => Buffer.from(''),
    extract: async () => {},
  });

  assert.strictEqual(result.installed, false);
  assert.match(result.error, /Download fehlgeschlagen/);
});

test('getKurspilotImageMagickDir: macOS/Linux nutzt ~/.kurspilot/imagemagick', () => {
  const dir = getKurspilotImageMagickDir({ homeDir: '/Users/lehrkraft', platform: 'darwin' });
  assert.strictEqual(dir, path.join('/Users/lehrkraft', '.kurspilot', 'imagemagick'));
});

test('getKurspilotImageMagickDir: Windows nutzt %LOCALAPPDATA%\\Kurspilot\\imagemagick', () => {
  const dir = getKurspilotImageMagickDir({
    homeDir: 'C:\\Users\\Lehrkraft',
    platform: 'win32',
    localAppData: 'C:\\Users\\Lehrkraft\\AppData\\Local',
  });
  assert.strictEqual(dir, path.join('C:\\Users\\Lehrkraft\\AppData\\Local', 'Kurspilot', 'imagemagick'));
});
