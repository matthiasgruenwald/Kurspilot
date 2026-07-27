#!/usr/bin/env node
/**
 * Baut Plugin/local_coursepilot.zip aus Plugin/src/local_coursepilot/
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pluginDir = path.join(__dirname, '..', 'Plugin');
const srcDir = path.join(pluginDir, 'src');
const zipPath = path.join(pluginDir, 'local_coursepilot.zip');

if (!fs.existsSync(path.join(srcDir, 'local_coursepilot'))) {
  process.stderr.write(`Quellverzeichnis fehlt: ${srcDir}/local_coursepilot\n`);
  process.exit(1);
}

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

execFileSync('zip', ['-r', '-X', zipPath, 'local_coursepilot'], {
  cwd: srcDir,
  stdio: 'inherit',
});

process.stdout.write(`Erstellt: ${path.relative(process.cwd(), zipPath)}\n`);
