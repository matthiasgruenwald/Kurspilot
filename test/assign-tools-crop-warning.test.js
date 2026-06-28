'use strict';

/**
 * Testet den Warnhinweis, den moodle_crop_image (lib/assign-tools.js) in der
 * Tool-Antwort zurueckgibt, wenn cropImage() den sips-Pfad genutzt hat
 * (Issue #135: bekannte Einschraenkungen von sips ggue. ImageMagick bei
 * animierten GIFs und CMYK-JPEGs ohne Farbprofil).
 *
 * Mockt os.platform() und child_process.execFileSync() (gleiches Muster wie
 * test/image-crop.test.js), um cropImage() ueber lib/assign-tools.js sowohl
 * den sips- als auch den ImageMagick-Pfad nehmen zu lassen, unabhaengig vom
 * tatsaechlichen Betriebssystem/den installierten Tools.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

const { executeAssignTool } = require('../lib/assign-tools');

function makeTmpSourceFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assign-tools-crop-warning-'));
  const sourcePath = path.join(dir, 'source.png');
  fs.writeFileSync(sourcePath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // Inhalt irrelevant, execFileSync ist gemockt
  return { dir, sourcePath, destPath: path.join(dir, 'dest.png') };
}

test('moodle_crop_image: Tool-Antwort enthaelt Warnhinweis, wenn cropImage() das sips-Backend nutzt (#135)', async (t) => {
  t.mock.method(os, 'platform', () => 'darwin');
  t.mock.method(childProcess, 'execFileSync', () => {});

  const { sourcePath, destPath } = makeTmpSourceFile();

  const result = await executeAssignTool(async () => {}, 'moodle_crop_image', {
    sourcepath: sourcePath,
    destpath: destPath,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });

  assert.ok(result.warning, 'erwartet Warnhinweis in der Tool-Antwort');
  assert.match(result.warning, /sips/i);
  assert.match(result.warning, /GIF/i);
  assert.match(result.warning, /CMYK/i);
});

test('moodle_crop_image: Tool-Antwort enthaelt KEINEN Warnhinweis, wenn cropImage() das ImageMagick-Backend nutzt (#135)', async (t) => {
  t.mock.method(os, 'platform', () => 'win32');
  t.mock.method(childProcess, 'execFileSync', () => {});

  const { sourcePath, destPath } = makeTmpSourceFile();

  const result = await executeAssignTool(async () => {}, 'moodle_crop_image', {
    sourcepath: sourcePath,
    destpath: destPath,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  });

  assert.strictEqual(result.warning, undefined);
});
