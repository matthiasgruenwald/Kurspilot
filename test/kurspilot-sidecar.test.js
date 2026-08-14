'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPersonenSidecar } = require('../lib/kurspilot-sidecar');
const { readFrontmatterFile } = require('../lib/kurspilot-frontmatter');

function makeMainFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-sidecar-test-'));
  const filePath = path.join(dir, 'CONTEXT.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

const MAIN_CONTENT = [
  '---',
  'type: fach',
  'title: Naturwissenschaften',
  'tags: []',
  'status: aktiv',
  'created: 2026-08-14',
  'updated: 2026-08-14',
  'about: naturwissenschaften',
  'gradeLevel: 7',
  'kurspilot:',
  '  personenbezug: false',
  '  weitergabe: offen',
  '---',
  '',
  '# Fachprofil',
].join('\n');

test('createPersonenSidecar legt eine gleichnamige .personen.md mit personenbezug: true an', () => {
  const mainFilePath = makeMainFile(MAIN_CONTENT);

  const result = createPersonenSidecar(mainFilePath, { inhalt: 'Beobachtung zu einzelnen Lernenden.' });

  assert.ok(fs.existsSync(result.sidecarPath));
  assert.strictEqual(path.basename(result.sidecarPath), 'CONTEXT.personen.md');

  const sidecar = readFrontmatterFile(result.sidecarPath);
  assert.strictEqual(sidecar.data.kurspilot.personenbezug, true);
  assert.match(sidecar.body, /Beobachtung zu einzelnen Lernenden\./);
});

test('createPersonenSidecar macht das Sidecar von der Sachdatei referenzierbar', () => {
  const mainFilePath = makeMainFile(MAIN_CONTENT);

  createPersonenSidecar(mainFilePath, { inhalt: 'Vertraulich.' });

  const updatedMainContent = fs.readFileSync(mainFilePath, 'utf8');
  assert.match(updatedMainContent, /CONTEXT\.personen\.md/);
});

test('createPersonenSidecar ist idempotent bei der Referenz in der Sachdatei', () => {
  const mainFilePath = makeMainFile(MAIN_CONTENT);

  createPersonenSidecar(mainFilePath, { inhalt: 'Erster Sidecar-Versuch scheitert an vorhandener Datei.' });
  const contentAfterFirst = fs.readFileSync(mainFilePath, 'utf8');

  assert.throws(
    () => createPersonenSidecar(mainFilePath, { inhalt: 'Zweiter Versuch.' }),
    /existiert bereits/
  );
  assert.strictEqual(fs.readFileSync(mainFilePath, 'utf8'), contentAfterFirst);
});

test('createPersonenSidecar wirft, wenn die Sachdatei fehlt', () => {
  const missingMain = path.join(os.tmpdir(), 'kurspilot-sidecar-missing', 'CONTEXT.md');
  assert.throws(() => createPersonenSidecar(missingMain, { inhalt: 'x' }), /nicht gefunden/);
});
