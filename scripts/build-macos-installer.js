#!/usr/bin/env node
'use strict';

/**
 * Baut das erste plattformspezifische macOS-Apple-Silicon-Installer-Artefakt
 * (Issue #68, Parent #5; **Apple-Silicon-Erstschnitt** und
 * **macOS-Installer-Artefakt** aus CONTEXT.md). Bewusst nur arm64 in diesem
 * Slice - kein Intel-/Universal-Build, kein Windows (karpathy-guidelines).
 *
 * Schritte:
 *   1. Payload-Verzeichnis zusammenstellen: moodle-mcp.js, scripts/, lib/,
 *      package.json (ohne devDependencies) sowie skills/ und .agents/.claude
 *      Skill-Adapter, die der Installer ohnehin via install-skills.js
 *      verteilt. KEINE Plugin-PHP-Dateien (Plugin/ ist fuer macOS-Lehrkraefte
 *      irrelevant - das Plugin laeuft auf dem Moodle-Server).
 *   2. Gebuendelte Kurspilot-Laufzeit (siehe scripts/bundle-node-runtime.js)
 *      nach payload/runtime/{bin,lib} kopieren - eigenstaendig, kein
 *      Homebrew/`/usr/local`/System-Node am Zielsystem noetig.
 *   3. Ein Start-Skript `payload/bin/kurspilot-setup`, das
 *      `runtime/bin/node scripts/setup-kurspilot.js` mit Pfaden relativ zur
 *      Installationswurzel aufruft (kein hartcodierter Build-Maschinen-Pfad).
 *   4. Per `pkgbuild` (macOS-Bordmittel) ein `.pkg` bauen, das die Payload in
 *      `~/Library/Application Support/Kurspilot` installiert - kein
 *      sudo/Root und keine Aenderung von `/usr/local` oder Homebrew.
 *
 * Aufruf:
 *   node scripts/build-macos-installer.js [--output dist/macos-installer]
 *
 * Tests: test/build-macos-installer.test.js baut das Artefakt in ein
 * Temp-Verzeichnis und prueft Payload-Inhalt, Architektur-Reinheit und
 * pkgbuild-Ergebnis (analog zum Integrationstest-Skip-Muster, falls
 * `pkgbuild` einmal fehlen sollte).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { bundleNodeRuntime } = require('./bundle-node-runtime');

const REPO_ROOT = path.join(__dirname, '..');
const PACKAGE_IDENTIFIER = 'org.igs.kurspilot';
const PACKAGE_VERSION = require(path.join(REPO_ROOT, 'package.json')).version;
const INSTALL_LOCATION = path.join('Library', 'Application Support', 'Kurspilot');

const PAYLOAD_FILES = [
  'moodle-mcp.js',
  'moodle-mcp-core.js',
  'moodle-mcp-page.js',
  'moodle-mcp-label.js',
  'moodle-mcp-url.js',
  'moodle-mcp-assign.js',
  'moodle-mcp-quiz.js',
  'moodle-mcp-question-bank.js',
  'SKILL.md',
];
const PAYLOAD_DIRS = ['scripts', 'lib', 'skills', '.agents', '.claude'];

/**
 * Stellt das Payload-Verzeichnis zusammen: Repo-Dateien, die der Installer
 * am Zielsystem braucht, plus die gebuendelte Node-Laufzeit. Plugin/ (PHP)
 * wird bewusst nicht mitgenommen - das ist Moodle-Server-seitig, nicht
 * Teil der lokalen Lehrkraft-Installation.
 */
function buildPayload(payloadDir) {
  fs.mkdirSync(payloadDir, { recursive: true });

  for (const file of PAYLOAD_FILES) {
    fs.copyFileSync(path.join(REPO_ROOT, file), path.join(payloadDir, file));
  }

  for (const dir of PAYLOAD_DIRS) {
    const source = path.join(REPO_ROOT, dir);
    if (fs.existsSync(source)) {
      fs.cpSync(source, path.join(payloadDir, dir), { recursive: true });
    }
  }

  writePackageJsonWithoutDevDependencies(payloadDir);

  const runtimeDir = path.join(payloadDir, 'runtime');
  const { bundledLibs } = bundleNodeRuntime(process.execPath, runtimeDir);

  writeSetupLauncher(payloadDir);

  return { bundledLibs };
}

function writePackageJsonWithoutDevDependencies(payloadDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  delete pkg.devDependencies;
  fs.writeFileSync(path.join(payloadDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * Schreibt `bin/kurspilot-setup`: ein Shell-Start-Skript, das die gebuendelte
 * Laufzeit relativ zur Installationswurzel aufruft (kein Build-Maschinen-Pfad
 * verdrahtet). Startet das Kurspilot-Konfigurationsprogramm
 * (scripts/setup-kurspilot.js) - nach Erstinstallation und spaeter erneut
 * fuer Reparatur/Tokenwechsel aufrufbar.
 */
function writeSetupLauncher(payloadDir) {
  const binDir = path.join(payloadDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const launcherPath = path.join(binDir, 'kurspilot-setup');
  const script = [
    '#!/bin/sh',
    '# Startet das Kurspilot-Konfigurationsprogramm (Issue #67/#68).',
    '# Pfade sind relativ zur Installationswurzel, nicht zur Build-Maschine.',
    'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
    'INSTALL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"',
    'exec "$INSTALL_ROOT/runtime/bin/node" "$INSTALL_ROOT/scripts/setup-kurspilot.js" "$@"',
    '',
  ].join('\n');

  fs.writeFileSync(launcherPath, script);
  fs.chmodSync(launcherPath, 0o755);
}

/**
 * Baut per `pkgbuild` ein Komponenten-Paket und wrappt es per `productbuild`
 * mit einer Distribution, die ausschliesslich die `currentUserHome`-Domain
 * erlaubt (`enable_localSystem="false"`). Ohne diese Distribution legt
 * Installer.app ein flaches Komponenten-Paket standardmaessig in der
 * `localSystem`-Domain ab (`/Library/...`, Admin-Passwort noetig) - das
 * widerspricht dem Kollegiums-Installer-Anspruch "kein sudo/Root noetig".
 * Mit `enable_currentUserHome="true"` installiert Installer.app stattdessen
 * ohne Rueckfrage nach `~/Library/Application Support/Kurspilot`.
 */
function buildPkg(payloadDir, outputPkgPath) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-pkg-build-'));
  const componentPkgPath = path.join(workDir, `${PACKAGE_IDENTIFIER}.pkg`);
  const scriptsDir = writePostinstallScript(workDir);

  execFileSync('pkgbuild', [
    '--root', payloadDir,
    '--identifier', PACKAGE_IDENTIFIER,
    '--version', PACKAGE_VERSION,
    '--install-location', INSTALL_LOCATION,
    '--scripts', scriptsDir,
    componentPkgPath,
  ], { stdio: 'inherit' });

  const distributionPath = path.join(workDir, 'Distribution.xml');
  fs.writeFileSync(distributionPath, buildDistributionXml());

  fs.mkdirSync(path.dirname(outputPkgPath), { recursive: true });
  execFileSync('productbuild', [
    '--distribution', distributionPath,
    '--package-path', workDir,
    outputPkgPath,
  ], { stdio: 'inherit' });
}

/**
 * Schreibt ein `postinstall`-Skript fuer `pkgbuild --scripts`. Ohne diesen
 * Hinweis installiert das Paket nur Dateien, ohne dass die Lehrkraft erfaehrt,
 * wie das Kurspilot-Konfigurationsprogramm gestartet wird. Laeuft (dank
 * currentUserHome-Domain) als die installierende Person, nicht als root, kann
 * also osascript-Dialoge zeigen. `$2` ist laut pkgbuild-Konvention der
 * tatsaechliche Installationszielpfad.
 */
function writePostinstallScript(workDir) {
  const scriptsDir = path.join(workDir, 'scripts-payload');
  fs.mkdirSync(scriptsDir, { recursive: true });

  const postinstallPath = path.join(scriptsDir, 'postinstall');
  const script = [
    '#!/bin/sh',
    '# Weist nach der Installation auf das Kurspilot-Konfigurationsprogramm hin',
    '# und bietet an, es direkt zu starten (Issue #68 Folgefix).',
    'TARGET_DIR="$2"',
    'LAUNCHER="$TARGET_DIR/bin/kurspilot-setup"',
    '',
    'BUTTON=$(osascript <<\'OSA\'',
    'display dialog "Kurspilot wurde installiert. Soll das Kurspilot-Konfigurationsprogramm jetzt gestartet werden?" buttons {"Spaeter", "Jetzt einrichten"} default button "Jetzt einrichten"',
    'button returned of result',
    'OSA',
    ')',
    '',
    'if [ "$BUTTON" = "Jetzt einrichten" ]; then',
    '  open -a Terminal "$LAUNCHER"',
    'fi',
    '',
    'exit 0',
    '',
  ].join('\n');

  fs.writeFileSync(postinstallPath, script);
  fs.chmodSync(postinstallPath, 0o755);

  return scriptsDir;
}

function buildDistributionXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<installer-gui-script minSpecVersion="1">',
    '    <title>Kurspilot</title>',
    '    <domains enable_currentUserHome="true" enable_localSystem="false" enable_anywhere="false"/>',
    '    <options customize="never" rootVolumeOnly="false"/>',
    '    <choices-outline>',
    '        <line choice="default">',
    `            <line choice="${PACKAGE_IDENTIFIER}"/>`,
    '        </line>',
    '    </choices-outline>',
    '    <choice id="default"/>',
    `    <choice id="${PACKAGE_IDENTIFIER}" visible="false">`,
    `        <pkg-ref id="${PACKAGE_IDENTIFIER}"/>`,
    '    </choice>',
    `    <pkg-ref id="${PACKAGE_IDENTIFIER}" version="${PACKAGE_VERSION}">${PACKAGE_IDENTIFIER}.pkg</pkg-ref>`,
    '</installer-gui-script>',
    '',
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const outputFlagIndex = args.indexOf('--output');
  const outputDir = outputFlagIndex !== -1
    ? path.resolve(args[outputFlagIndex + 1])
    : path.join(REPO_ROOT, 'dist', 'macos-installer');

  const payloadDir = path.join(outputDir, 'payload');
  if (fs.existsSync(payloadDir)) {
    fs.rmSync(payloadDir, { recursive: true, force: true });
  }

  const { bundledLibs } = buildPayload(payloadDir);

  const pkgPath = path.join(outputDir, 'Kurspilot.pkg');
  buildPkg(payloadDir, pkgPath);

  process.stdout.write(
    `Erstellt: ${path.relative(process.cwd(), pkgPath)} ` +
    `(${bundledLibs.length} gebuendelte Laufzeit-Bibliotheken)\n`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  buildPayload,
  buildPkg,
  PACKAGE_IDENTIFIER,
  INSTALL_LOCATION,
  PAYLOAD_FILES,
  PAYLOAD_DIRS,
};
