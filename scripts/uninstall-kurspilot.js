#!/usr/bin/env node
/**
 * Kurspilot-Uninstaller: entfernt Moodle-Zugangsdaten, Claude-/Codex-Config-
 * Eintraege, installierte Skills und das Installer-Payload-Verzeichnis - alles
 * in einem Aufruf, statt jeden Schritt manuell zu wiederholen (Folgearbeit zu
 * Issue #68, ausgeloest durch reale Installations-Tests: Rechner muss vor dem
 * naechsten Installations-Test sauber hinterlassbar sein).
 *
 * Entfernt bewusst NICHT den Arbeitsbereich (~/Documents/Kurspilot) - das
 * sind Lehrkraft-Inhalte, kein Installationsartefakt.
 *
 * Der per `pkgbuild`/`productbuild` registrierte Paket-Receipt
 * (org.igs.kurspilot, siehe scripts/build-macos-installer.js) wird, falls
 * vorhanden, per `pkgutil --forget` entfernt. Schlaegt das fehl (z.B. weil
 * der Receipt root-only ist - aeltere Installationen vor dem Domain-Fix),
 * wird das Problem berichtet statt automatisch sudo zu eskalieren.
 *
 * Override fuer Tests/Sonderfaelle:
 *   --home <dir>  ueberschreibt os.homedir() (Claude-/Codex-Config, Skills, Payload)
 *
 * Aufruf:
 *   node scripts/uninstall-kurspilot.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { runUninstallFlow } = require('../lib/uninstall-flow');
const { PACKAGE_IDENTIFIER, INSTALL_LOCATION } = require('./build-macos-installer');

function parseArgs(args) {
  const result = { home: null };
  const homeIndex = args.indexOf('--home');
  if (homeIndex !== -1) {
    result.home = args[homeIndex + 1];
  }
  return result;
}

function removePayloadDirectory(homeDir) {
  const payloadDir = path.join(homeDir, INSTALL_LOCATION);
  if (!fs.existsSync(payloadDir)) {
    return { removed: false, path: payloadDir };
  }
  fs.rmSync(payloadDir, { recursive: true, force: true });
  return { removed: true, path: payloadDir };
}

function forgetPkgReceipt() {
  try {
    execFileSync('pkgutil', ['--pkg-info', PACKAGE_IDENTIFIER], { stdio: 'ignore' });
  } catch {
    return { found: false, forgotten: false };
  }

  try {
    execFileSync('pkgutil', ['--forget', PACKAGE_IDENTIFIER], { stdio: 'ignore' });
    return { found: true, forgotten: true };
  } catch {
    return { found: true, forgotten: false };
  }
}

function main() {
  const { home } = parseArgs(process.argv.slice(2));
  const homeDir = home || os.homedir();

  const flowReport = runUninstallFlow({ homeDir });
  const payloadResult = removePayloadDirectory(homeDir);
  const receiptResult = forgetPkgReceipt();

  const lines = [
    `Moodle-Zugangsdaten aus Schluesselbund entfernt: ja`,
    `Config-Eintraege bereinigt: ${flowReport.configsCleaned.join(', ') || 'keine vorhanden'}`,
    `Skills entfernt: ${flowReport.skillsRemoved.join(', ') || 'keine vorhanden'}`,
    payloadResult.removed
      ? `Payload-Verzeichnis entfernt: ${payloadResult.path}`
      : `Kein Payload-Verzeichnis gefunden unter ${payloadResult.path}`,
  ];

  if (receiptResult.found) {
    lines.push(
      receiptResult.forgotten
        ? `Paket-Receipt (${PACKAGE_IDENTIFIER}) vergessen.`
        : `Paket-Receipt (${PACKAGE_IDENTIFIER}) gefunden, konnte aber nicht entfernt werden ` +
          `(evtl. root-only - aeltere Installation vor dem Domain-Fix). ` +
          `Manuell pruefen: sudo pkgutil --forget ${PACKAGE_IDENTIFIER}`
    );
  } else {
    lines.push(`Kein Paket-Receipt (${PACKAGE_IDENTIFIER}) gefunden.`);
  }

  process.stdout.write(`${lines.join('\n')}\nKurspilot wurde deinstalliert.\n`);
}

main();
