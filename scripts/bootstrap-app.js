#!/usr/bin/env node
/**
 * bootstrap-app.js
 *
 * Letzter Node-seitiger Schritt des curl/PowerShell-Bootstraps (Issue #125,
 * siehe docs/adr/0008-curl-bootstrap-vertrieb.md). Wird von setup.sh/
 * setup.ps1 aufgerufen, NACHDEM eine ausfuehrbare Node-Binary sichergestellt
 * ist (System-Node oder von setup.sh/setup.ps1 selbst beschafftes
 * Kurspilot-Node - siehe dort fuer den Henne-Ei-Teil, der noch kein Node
 * voraussetzen darf).
 *
 * Ablauf:
 *   1. lib/app-provision.js: App-Tarball von GitHub holen/entpacken
 *      (idempotent - siehe dort).
 *   2. scripts/setup-kurspilot.js IM ENTPACKTEN APP-VERZEICHNIS starten -
 *      das oeffnet die lokale Konfigurations-Seite (siehe dort).
 *
 * Bewusst kein eigener Code fuer Schritt 2 ueber Modul-Grenzen hinweg: dieses
 * Script ist duenne Verkabelung (DI-Funktionen echt befuellen, Folgeprozess
 * starten), die eigentliche Logik bleibt in lib/.
 *
 * `fetch` ist Node-global (>=18, siehe lib/node-provision.js
 * NODE_MIN_MAJOR_VERSION). Fuer `extract` wird System-`tar` (macOS/Linux) und
 * PowerShell `Expand-Archive` (nicht benoetigt - der App-Tarball ist immer
 * .tar.gz, auch unter Windows, da `tar` seit Windows 10 1803 systemeigen ist)
 * per execFileSync aufgerufen - keine npm-Laufzeit-Dependency.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { provisionApp } = require('../lib/app-provision');

/**
 * Entpackt einen .tar.gz-Buffer nach destDir per System-`tar`
 * (`tar -xzf - -C destDir`, Inhalt ueber stdin). Auf macOS/Linux/Windows
 * gleich aufrufbar (Windows seit 10 1803 mit eingebautem bsdtar).
 *
 * @param {Buffer} buffer
 * @param {string} destDir
 */
function extractTarGz(buffer, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['-xzf', '-', '-C', destDir, '--strip-components=1'], {
    input: buffer,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

/**
 * @param {object} [options] austauschbar fuer Tests (DI wie lib/app-provision.js)
 * @returns {Promise<{appDir: string}>}
 */
async function bootstrapApp(options = {}) {
  const {
    homeDir = os.homedir(),
    platform = process.platform,
    localAppData,
    fetch: fetchFn = (url) => fetch(url).then(toBuffer),
    extract: extractFn = extractTarGz,
    existsSync,
    readFile,
    writeFile,
    mkdirSync,
    spawnSetup = defaultSpawnSetup,
  } = options;

  process.stdout.write('Richte das Tool ein...\n');

  const { appDir } = await provisionApp({
    homeDir,
    platform,
    localAppData,
    fetch: fetchFn,
    extract: extractFn,
    existsSync,
    readFile,
    writeFile,
    mkdirSync,
  });

  spawnSetup(appDir);

  return { appDir };
}

async function toBuffer(response) {
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen: HTTP ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function defaultSpawnSetup(appDir) {
  const setupScript = path.join(appDir, 'scripts', 'setup-kurspilot.js');
  const args = process.argv.includes('--after-install') ? [setupScript, '--after-install'] : [setupScript];
  execFileSync(process.execPath, args, { stdio: 'inherit' });
}

if (require.main === module) {
  bootstrapApp().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  bootstrapApp,
  extractTarGz,
};
