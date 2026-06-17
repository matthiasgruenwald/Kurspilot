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
function expandPkgAndListPayload(pkgPath, expandDir) {
  execFileSync('pkgutil', ['--expand', pkgPath, expandDir]);
  const payloadPath = path.join(expandDir, 'Payload');
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
    'package.json',
    'bin/kurspilot-setup',
    'scripts/setup-kurspilot.js',
    'scripts/start-mcp.js',
    'scripts/moodle-credentials.js',
    'lib/setup-flow.js',
    'lib/mcp-config-setup.js',
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
  const nodeBinaryPath = extractFileFromPayload(path.join(expandDir, 'Payload'), 'runtime/bin/node', extractDir);

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
  const launcherPath = extractFileFromPayload(path.join(expandDir, 'Payload'), 'bin/kurspilot-setup', extractDir);
  const launcherContent = fs.readFileSync(launcherPath, 'utf8');
  assert.match(launcherContent, /setup-kurspilot\.js/, 'Start-Skript sollte setup-kurspilot.js aufrufen');
  assert.doesNotMatch(
    launcherContent,
    /\/opt\/homebrew|\/Users\/[^/]+\/Library/,
    'Start-Skript sollte keine hartcodierten Build-Maschinen-Pfade enthalten'
  );
});
