#!/usr/bin/env node
/**
 * Kurspilot-Uninstaller: entfernt Moodle-Zugangsdaten, Claude-/Codex-Config-
 * Eintraege und installierte Skills - alles in einem Aufruf, statt jeden
 * Schritt manuell zu wiederholen (Folgearbeit zu Issue #68, ausgeloest durch
 * reale Installations-Tests: Rechner muss vor dem naechsten Installations-Test
 * sauber hinterlassbar sein).
 *
 * Entfernt bewusst NICHT den Arbeitsbereich (~/Documents/Kurspilot) - das
 * sind Lehrkraft-Inhalte, kein Installationsartefakt.
 *
 * Override fuer Tests/Sonderfaelle:
 *   --home <dir>  ueberschreibt os.homedir() (Claude-/Codex-Config, Skills)
 *
 * Aufruf:
 *   node scripts/uninstall-kurspilot.js
 */

const os = require('node:os');

const { runUninstallFlow } = require('../lib/uninstall-flow');

function parseArgs(args) {
  const result = { home: null };
  const homeIndex = args.indexOf('--home');
  if (homeIndex !== -1) {
    result.home = args[homeIndex + 1];
  }
  return result;
}

function main() {
  const { home } = parseArgs(process.argv.slice(2));
  const homeDir = home || os.homedir();

  const flowReport = runUninstallFlow({ homeDir });

  const lines = [
    `Moodle-Zugangsdaten aus dem sicheren Zugangsdaten-Speicher entfernt: ja`,
    `Config-Eintraege bereinigt: ${flowReport.configsCleaned.join(', ') || 'keine vorhanden'}`,
    `Skills entfernt: ${flowReport.skillsRemoved.join(', ') || 'keine vorhanden'}`,
  ];

  process.stdout.write(`${lines.join('\n')}\nKurspilot wurde deinstalliert.\n`);
}

main();
