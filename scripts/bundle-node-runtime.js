'use strict';

/**
 * Buendelt die auf der Build-Maschine vorhandene lokale Node-Laufzeit
 * (arm64, z.B. Homebrew unter /opt/homebrew/bin/node) als eigenstaendige
 * "Gebundene Kurspilot-Laufzeit" (siehe CONTEXT.md) fuer das macOS-Installer-
 * Artefakt (Issue #68).
 *
 * Bewusst kein eigener Node-Build und kein Download von nodejs.org in diesem
 * Slice (YAGNI) - die Build-Maschine hat bereits ein arm64-Node-Binary.
 * Stattdessen wird das Binary per `lipo -thin arm64` auf den arm64-Slice
 * reduziert (falls Fat-Binary) und die rekursive Closure seiner
 * Homebrew-`.dylib`-Abhaengigkeiten (otool -L) wird mitkopiert und per
 * `install_name_tool` auf `@executable_path/../lib/<name>` umgeschrieben,
 * damit das Ergebnis ohne Homebrew/`/opt/homebrew` am Zielsystem laeuft.
 * System-Bibliotheken (`/usr/lib/*`, `/System/Library/Frameworks/*`) bleiben
 * unveraendert - die sind Teil von macOS, nicht von Homebrew.
 *
 * Risiko/Folgearbeit (siehe Bericht zu Issue #68): das gebuendelte Binary
 * stammt vom Homebrew-Paket der Build-Maschine, nicht vom offiziellen
 * nodejs.org-Tarball. Funktional aequivalent fuer diesen Slice, aber ein
 * spaeterer Wechsel auf ein offizielles Apple-Silicon-Node-Tarball waere
 * die robustere langfristige Loesung (kein Abhaengen von der jeweiligen
 * Build-Maschine, klar dokumentierte Lizenzbasis).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const HOMEBREW_PREFIXES = ['/opt/homebrew/', '/usr/local/Cellar/', '/usr/local/opt/'];

function isHomebrewPath(libPath) {
  return HOMEBREW_PREFIXES.some(prefix => libPath.startsWith(prefix));
}

function otoolDeps(filePath) {
  const output = execFileSync('otool', ['-L', filePath], { encoding: 'utf8' });
  return output
    .split('\n')
    .slice(1)
    .map(line => line.trim().split(' ')[0])
    .filter(Boolean);
}

/**
 * Liest den Mach-O "install name" (LC_ID_DYLIB) einer dylib, z.B.
 * `/opt/homebrew/opt/llhttp/lib/libllhttp.9.4.dylib`. Das ist der kanonische
 * Name, unter dem andere Binaries die Bibliothek referenzieren - er kann vom
 * realpath-Dateinamen abweichen (Versions-Symlinks wie `libllhttp.9.4.dylib`
 * -> `libllhttp.9.4.1.dylib`). Faellt auf den realpath-Basename zurueck, wenn
 * keine LC_ID_DYLIB vorhanden ist (z.B. bei Executables).
 */
function installNameBasenameOf(filePath) {
  const output = execFileSync('otool', ['-D', filePath], { encoding: 'utf8' });
  const lines = output.split('\n').map(line => line.trim()).filter(Boolean);
  const installName = lines[1];
  if (!installName) {
    return path.basename(filePath);
  }
  return path.basename(installName);
}

/**
 * Loest `@rpath/...`- und `@loader_path/...`-Abhaengigkeiten eines Mach-O-
 * Files relativ zu dessen eigenem Verzeichnis und dessen eigenen
 * LC_RPATH-Eintraegen auf einen echten Dateisystempfad auf.
 */
function resolveRpathDep(depPath, machoFilePath) {
  if (!depPath.startsWith('@rpath/') && !depPath.startsWith('@loader_path/')) {
    return depPath;
  }
  const libName = depPath.split('/').pop();
  const loaderDir = path.dirname(machoFilePath);

  if (depPath.startsWith('@loader_path/')) {
    const directCandidate = path.join(loaderDir, libName);
    if (fs.existsSync(directCandidate)) {
      return directCandidate;
    }
  }

  const rpaths = execFileSync('otool', ['-l', machoFilePath], { encoding: 'utf8' })
    .split('\n')
    .reduce((acc, line, idx, lines) => {
      if (line.trim() === 'cmd LC_RPATH') {
        const pathLine = lines[idx + 2];
        const match = pathLine && pathLine.match(/path (.+) \(offset/);
        if (match) acc.push(match[1].replace('@loader_path', loaderDir));
      }
      return acc;
    }, []);
  for (const rpath of rpaths) {
    const candidate = path.join(rpath, libName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return depPath;
}

/**
 * Ermittelt die rekursive Closure aller Homebrew-`.dylib`-Abhaengigkeiten
 * eines Mach-O-Binaries. Gibt eine Map von realpath -> urspruenglichem
 * (von otool gemeldetem) Abhaengigkeitspfad zurueck.
 */
function collectHomebrewDylibClosure(entryBinaryPath) {
  const closure = new Map();
  const queue = [entryBinaryPath];
  const visitedFiles = new Set();

  while (queue.length > 0) {
    const current = queue.pop();
    const realCurrent = fs.realpathSync(current);
    if (visitedFiles.has(realCurrent)) {
      continue;
    }
    visitedFiles.add(realCurrent);

    for (const rawDep of otoolDeps(realCurrent)) {
      const resolved = resolveRpathDep(rawDep, realCurrent);
      if (!isHomebrewPath(resolved) || !fs.existsSync(resolved)) {
        continue;
      }
      const realDep = fs.realpathSync(resolved);
      if (!closure.has(realDep)) {
        closure.set(realDep, resolved);
        queue.push(realDep);
      }
    }
  }

  return closure;
}

/**
 * Kopiert das Node-Binary und seine Homebrew-dylib-Closure nach
 * `targetRuntimeDir/bin/node` bzw. `targetRuntimeDir/lib/*.dylib` und
 * schreibt alle internen Verweise auf `@executable_path/../lib/<name>` um,
 * sodass das Ergebnis ohne `/opt/homebrew` lauffaehig ist.
 *
 * @param {string} sourceNodePath z.B. process.execPath
 * @param {string} targetRuntimeDir Zielordner, erhaelt `bin/` und `lib/`
 * @returns {{ nodeBinaryPath: string, bundledLibs: string[] }}
 */
function bundleNodeRuntime(sourceNodePath, targetRuntimeDir) {
  const binDir = path.join(targetRuntimeDir, 'bin');
  const libDir = path.join(targetRuntimeDir, 'lib');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(libDir, { recursive: true });

  const nodeBinaryPath = path.join(binDir, 'node');
  fs.copyFileSync(sourceNodePath, nodeBinaryPath);
  fs.chmodSync(nodeBinaryPath, 0o755);

  ensureArm64Only(nodeBinaryPath);

  const closure = collectHomebrewDylibClosure(sourceNodePath);
  const bundledLibs = [];

  for (const realDep of closure.keys()) {
    const libName = installNameBasenameOf(realDep);
    const targetLibPath = path.join(libDir, libName);
    fs.copyFileSync(realDep, targetLibPath);
    fs.chmodSync(targetLibPath, 0o755);
    ensureArm64Only(targetLibPath);
    bundledLibs.push(libName);

    execFileSync('install_name_tool', ['-id', `@rpath/${libName}`, targetLibPath]);

    rewriteHomebrewDepsToRpath(targetLibPath);
  }

  rewriteHomebrewDepsToRpath(nodeBinaryPath);
  addRpathIfMissing(nodeBinaryPath, '@executable_path/../lib');

  return { nodeBinaryPath, bundledLibs };
}

function rewriteHomebrewDepsToRpath(machoFilePath) {
  for (const rawDep of otoolDeps(machoFilePath)) {
    const resolved = resolveRpathDep(rawDep, machoFilePath);
    if (!isHomebrewPath(resolved)) {
      continue;
    }
    const libName = installNameBasenameOf(resolved);
    execFileSync('install_name_tool', ['-change', rawDep, `@rpath/${libName}`, machoFilePath]);
  }
}

function addRpathIfMissing(machoFilePath, rpath) {
  const info = execFileSync('otool', ['-l', machoFilePath], { encoding: 'utf8' });
  if (info.includes(rpath)) {
    return;
  }
  execFileSync('install_name_tool', ['-add_rpath', rpath, machoFilePath]);
}

/**
 * Stellt sicher, dass die Datei ein reines arm64 Mach-O ist. Falls es ein
 * Fat-Binary mit mehreren Slices ist, wird per `lipo -thin arm64` nur der
 * arm64-Slice extrahiert. Wirft, falls kein arm64-Slice vorhanden ist.
 */
function ensureArm64Only(machoFilePath) {
  const lipoInfo = execFileSync('lipo', ['-info', machoFilePath], { encoding: 'utf8' });

  if (lipoInfo.includes('Non-fat file') && lipoInfo.includes('arm64')) {
    return;
  }

  if (!lipoInfo.includes('arm64')) {
    throw new Error(`Keine arm64-Architektur in ${machoFilePath} gefunden: ${lipoInfo.trim()}`);
  }

  const thinnedPath = `${machoFilePath}.arm64-thin`;
  execFileSync('lipo', [machoFilePath, '-thin', 'arm64', '-output', thinnedPath]);
  fs.renameSync(thinnedPath, machoFilePath);
  fs.chmodSync(machoFilePath, 0o755);
}

module.exports = {
  bundleNodeRuntime,
  collectHomebrewDylibClosure,
  ensureArm64Only,
  isHomebrewPath,
};
