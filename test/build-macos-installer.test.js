'use strict';

/**
 * Build/Package-Tests fuer das macOS-Apple-Silicon-Installer-Artefakt
 * (Issue #68). Baut das Artefakt einmalig in ein Temp-Verzeichnis (dauert
 * spuerbar laenger als andere Tests, da eine vollstaendige Node-Laufzeit
 * inkl. dylib-Closure kopiert und umgeschrieben wird - kein Netzwerk-Download,
 * nur lokale Dateioperationen) und prueft per `pkgutil --expand` Inhalt und
 * Architektur-Reinheit. Faellt `pkgbuild`/`lipo`/`otool` einmal nicht
 * verfuegbar sein, wird analog zu test/integration/*.test.js per `t.skip()`
 * uebersprungen statt den gesamten Testlauf rot zu machen.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'build-macos-installer.js');

function commandAvailable(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function makeTmpOutputDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-macos-installer-test-'));
}

/**
 * Entpackt ein gebautes .pkg und liefert die Liste der enthaltenen
 * Payload-Pfade (ohne fuehrendes "./").
 */
/**
 * Findet die `Payload`-Datei nach `pkgutil --expand` - bei einem flachen
 * Komponenten-Paket liegt sie direkt im Expand-Verzeichnis, bei einem per
 * `productbuild` gebauten Produktarchiv (siehe Domain-Fix Issue #68-Folgefix)
 * eine Ebene tiefer im Komponenten-Unterordner.
 */
function findPayloadDir(expandDir) {
  if (fs.existsSync(path.join(expandDir, 'Payload'))) {
    return expandDir;
  }
  for (const entry of fs.readdirSync(expandDir, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(expandDir, entry.name, 'Payload'))) {
      return path.join(expandDir, entry.name);
    }
  }
  throw new Error(`Keine Payload-Datei unter ${expandDir} gefunden`);
}

function expandPkgAndListPayload(pkgPath, expandDir) {
  execFileSync('pkgutil', ['--expand', pkgPath, expandDir]);
  const payloadPath = path.join(findPayloadDir(expandDir), 'Payload');
  const listing = execFileSync(
    `gunzip < ${JSON.stringify(payloadPath)} | cpio -it 2>/dev/null`,
    { shell: '/bin/bash', encoding: 'utf8' }
  );
  return listing
    .split('\n')
    .map(line => line.trim().replace(/^\.\//, ''))
    .filter(Boolean);
}

function extractFileFromPayload(payloadPath, relativeEntry, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync(
    `gunzip < ${JSON.stringify(payloadPath)} | cpio -idm ${JSON.stringify(`./${relativeEntry}`)}`,
    { shell: '/bin/bash', cwd: destDir }
  );
  return path.join(destDir, relativeEntry);
}

test('build-macos-installer: baut ein .pkg mit arm64-only Laufzeit und erwarteten Dateien', { timeout: 120000 }, t => {
  if (!commandAvailable('pkgbuild') || !commandAvailable('pkgutil') || !commandAvailable('lipo') || !commandAvailable('otool')) {
    t.skip('pkgbuild/pkgutil/lipo/otool nicht verfuegbar - macOS-Installer-Build wird uebersprungen');
    return;
  }

  const outputDir = path.join(makeTmpOutputDir(), 'macos-installer');
  execFileSync('node', [BUILD_SCRIPT, '--output', outputDir], { encoding: 'utf8' });

  const pkgPath = path.join(outputDir, 'Kurspilot.pkg');
  assert.ok(fs.existsSync(pkgPath), 'Kurspilot.pkg sollte erzeugt werden');

  const expandDir = path.join(outputDir, 'expanded');
  const payloadEntries = expandPkgAndListPayload(pkgPath, expandDir);

  // --- Erwartete Kerndateien vorhanden -------------------------------------
  const expectedEntries = [
    'moodle-mcp.js',
    'moodle-mcp-core.js',
    'moodle-mcp-page.js',
    'moodle-mcp-label.js',
    'moodle-mcp-url.js',
    'moodle-mcp-assign.js',
    'moodle-mcp-quiz.js',
    'moodle-mcp-question-bank.js',
    'SKILL.md',
    'package.json',
    'Kurspilot konfigurieren.app/Contents/Info.plist',
    'Kurspilot konfigurieren.app/Contents/MacOS/Kurspilot konfigurieren',
    'bin/kurspilot-setup',
    'scripts/setup-kurspilot.js',
    'scripts/start-mcp.js',
    'scripts/moodle-credentials.js',
    'lib/setup-flow.js',
    'lib/setup-browser-server.js',
    'lib/mcp-config-setup.js',
    'assets/setup/token-help.svg',
    'runtime/bin/node',
  ];
  for (const entry of expectedEntries) {
    assert.ok(
      payloadEntries.includes(entry),
      `Payload sollte ${entry} enthalten - enthaelt: ${payloadEntries.slice(0, 20).join(', ')}...`
    );
  }

  // --- Keine Plugin-PHP-Dateien (macOS-Installer ist Server-unabhaengig) --
  assert.ok(
    !payloadEntries.some(entry => entry.startsWith('Plugin/')),
    'Payload sollte keine Plugin/-Dateien enthalten (PHP ist Moodle-Server-seitig)'
  );

  // --- Mindestens eine gebuendelte Laufzeit-dylib vorhanden ----------------
  const bundledLibs = payloadEntries.filter(entry => entry.startsWith('runtime/lib/') && entry.endsWith('.dylib'));
  assert.ok(bundledLibs.length > 0, 'runtime/lib/ sollte gebuendelte dylibs enthalten');

  // --- Keine Windows-Artefakte (.exe/.dll) ---------------------------------
  assert.ok(
    !payloadEntries.some(entry => entry.endsWith('.exe') || entry.endsWith('.dll')),
    'Payload sollte keine Windows-Binaries (.exe/.dll) enthalten'
  );

  // --- Node-Binary ist reines arm64 Mach-O, kein Fat-/Intel-Binary --------
  const extractDir = path.join(outputDir, 'extracted');
  const payloadDir = findPayloadDir(expandDir);
  const nodeBinaryPath = extractFileFromPayload(path.join(payloadDir, 'Payload'), 'runtime/bin/node', extractDir);

  const lipoInfo = execFileSync('lipo', ['-info', nodeBinaryPath], { encoding: 'utf8' });
  assert.match(lipoInfo, /arm64/, 'gebuendeltes Node-Binary sollte arm64 enthalten');
  assert.doesNotMatch(lipoInfo, /x86_64/, 'gebuendeltes Node-Binary sollte kein x86_64-Slice enthalten (Apple-Silicon-Erstschnitt)');
  assert.match(lipoInfo, /Non-fat file/, 'gebuendeltes Node-Binary sollte kein Fat-Binary sein, sondern reines arm64');

  const fileInfo = execFileSync('file', [nodeBinaryPath], { encoding: 'utf8' });
  assert.match(fileInfo, /arm64/, 'file sollte arm64 melden');
  assert.doesNotMatch(fileInfo, /x86_64/, 'file sollte kein x86_64 melden');

  // --- Keine verbliebenen Homebrew-Pfade in den gebuendelten dylibs -------
  const otoolOutput = execFileSync('otool', ['-L', nodeBinaryPath], { encoding: 'utf8' });
  assert.doesNotMatch(
    otoolOutput,
    /\/opt\/homebrew|\/usr\/local\/(Cellar|opt)/,
    'gebuendeltes Node-Binary sollte keine Homebrew-Pfade mehr referenzieren'
  );

  // --- Start-Skript ruft die gebuendelte Laufzeit relativ auf, nicht die ---
  // --- Build-Maschine -------------------------------------------------------
  const launcherPath = extractFileFromPayload(path.join(payloadDir, 'Payload'), 'bin/kurspilot-setup', extractDir);
  const launcherContent = fs.readFileSync(launcherPath, 'utf8');
  assert.match(launcherContent, /setup-kurspilot\.js/, 'Start-Skript sollte setup-kurspilot.js aufrufen');
  assert.doesNotMatch(
    launcherContent,
    /\/opt\/homebrew|\/Users\/[^/]+\/Library/,
    'Start-Skript sollte keine hartcodierten Build-Maschinen-Pfade enthalten'
  );

  const appLauncherPath = extractFileFromPayload(
    path.join(payloadDir, 'Payload'),
    'Kurspilot konfigurieren.app/Contents/MacOS/Kurspilot konfigurieren',
    extractDir
  );
  const appLauncherStat = fs.statSync(appLauncherPath);
  assert.ok((appLauncherStat.mode & 0o111) !== 0, 'sichtbarer Starter sollte ausfuehrbar sein');

  const appLauncherContent = fs.readFileSync(appLauncherPath, 'utf8');
  assert.match(
    appLauncherContent,
    /bin\/kurspilot-setup/,
    'sichtbarer Starter sollte den bestehenden Setup-Einstieg wiederverwenden'
  );
  assert.doesNotMatch(
    appLauncherContent,
    /\/opt\/homebrew|\/Users\/[^/]+\/Library/,
    'sichtbarer Starter sollte keine hartcodierten Build-Maschinen-Pfade enthalten'
  );

  const appInfoPath = extractFileFromPayload(
    path.join(payloadDir, 'Payload'),
    'Kurspilot konfigurieren.app/Contents/Info.plist',
    extractDir
  );
  const appInfo = fs.readFileSync(appInfoPath, 'utf8');
  assert.match(appInfo, /<string>Kurspilot konfigurieren<\/string>/, 'Starter sollte sichtbar Kurspilot konfigurieren heissen');
});

test('build-macos-installer: installiert nur in die Nutzer-Domain, keine Admin-Rechte noetig', { timeout: 120000 }, t => {
  if (!commandAvailable('pkgbuild') || !commandAvailable('productbuild') || !commandAvailable('pkgutil')) {
    t.skip('pkgbuild/productbuild/pkgutil nicht verfuegbar - Domain-Check wird uebersprungen');
    return;
  }

  const outputDir = path.join(makeTmpOutputDir(), 'macos-installer');
  execFileSync('node', [BUILD_SCRIPT, '--output', outputDir], { encoding: 'utf8' });

  const pkgPath = path.join(outputDir, 'Kurspilot.pkg');
  const expandDir = path.join(outputDir, 'expanded-domain-check');
  execFileSync('pkgutil', ['--expand', pkgPath, expandDir]);

  const distributionPath = path.join(expandDir, 'Distribution');
  assert.ok(
    fs.existsSync(distributionPath),
    'Erwartet ein Produktarchiv mit Distribution-Datei (productbuild), damit die Nutzer-Domain erzwungen werden kann'
  );

  const distribution = fs.readFileSync(distributionPath, 'utf8');
  assert.match(
    distribution,
    /enable_currentUserHome="true"/,
    'Distribution sollte die currentUserHome-Domain aktivieren (Installation ohne Admin-Rechte)'
  );
  assert.match(
    distribution,
    /enable_localSystem="false"/,
    'Distribution sollte die localSystem-Domain deaktivieren, damit kein Admin-Passwort verlangt wird'
  );
});

test('build-macos-installer: postinstall-Skript weist nach der Installation auf das Konfigurationsprogramm hin', { timeout: 120000 }, t => {
  if (!commandAvailable('pkgbuild') || !commandAvailable('productbuild') || !commandAvailable('pkgutil')) {
    t.skip('pkgbuild/productbuild/pkgutil nicht verfuegbar - postinstall-Check wird uebersprungen');
    return;
  }

  const outputDir = path.join(makeTmpOutputDir(), 'macos-installer');
  execFileSync('node', [BUILD_SCRIPT, '--output', outputDir], { encoding: 'utf8' });

  const pkgPath = path.join(outputDir, 'Kurspilot.pkg');
  const expandDir = path.join(outputDir, 'expanded-postinstall-check');
  execFileSync('pkgutil', ['--expand', pkgPath, expandDir]);

  const componentDir = findPayloadDir(expandDir);
  const postinstallPath = path.join(componentDir, 'Scripts', 'postinstall');
  assert.ok(fs.existsSync(postinstallPath), 'Komponenten-Paket sollte ein Scripts/postinstall enthalten');

  const stat = fs.statSync(postinstallPath);
  assert.ok((stat.mode & 0o111) !== 0, 'postinstall sollte ausfuehrbar sein');

  const content = fs.readFileSync(postinstallPath, 'utf8');
  assert.match(content, /kurspilot-setup/, 'postinstall sollte auf das Start-Skript bin/kurspilot-setup verweisen');
  assert.match(
    content,
    /Kurspilot ist installiert/,
    'Abschlussdialog sollte sichtbar melden, dass die Dateiinstallation abgeschlossen ist'
  );
  assert.match(
    content,
    /persoenliche Einstellungen/,
    'Abschlussdialog sollte in den getrennten Schritt persoenliche Einstellungen ueberleiten'
  );
  assert.match(
    content,
    /--after-install/,
    'postinstall sollte das Konfigurationstool im After-Install-Modus starten'
  );
  assert.doesNotMatch(
    content,
    /open -a Terminal/,
    'postinstall sollte kein unverstaendliches Terminalfenster oeffnen'
  );
  assert.match(
    content,
    /osascript/,
    'postinstall sollte die Lehrkraft sichtbar (z.B. per osascript-Hinweis) informieren statt stillschweigend zu installieren'
  );
});
