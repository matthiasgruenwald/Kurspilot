#!/usr/bin/env node
/**
 * Baut local_coursepilot.zip aus Plugin/src/local_coursepilot/
 *
 * Optionale Argumente:
 *   --output <verzeichnis>  Zielverzeichnis der ZIP (Standard: Plugin/)
 *
 * macOS-Metadaten (.DS_Store) werden aus dem Archiv ausgeschlossen.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseOutputDir(argv) {
  const index = argv.indexOf('--output');
  if (index === -1) {
    return path.join(__dirname, '..', 'Plugin');
  }
  const value = argv[index + 1];
  if (!value) {
    process.stderr.write('--output erwartet ein Verzeichnis\n');
    process.exit(1);
  }
  return path.resolve(value);
}

const pluginDir = path.join(__dirname, '..', 'Plugin');
const srcDir = path.join(pluginDir, 'src');
const outputDir = parseOutputDir(process.argv.slice(2));
const zipPath = path.join(outputDir, 'local_coursepilot.zip');

if (!fs.existsSync(path.join(srcDir, 'local_coursepilot'))) {
  process.stderr.write(`Quellverzeichnis fehlt: ${srcDir}/local_coursepilot\n`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

execFileSync('zip', ['-r', '-X', zipPath, 'local_coursepilot', '-x', '*.DS_Store'], {
  cwd: srcDir,
  stdio: 'inherit',
});

process.stdout.write(`Erstellt: ${path.relative(process.cwd(), zipPath)}\n`);
