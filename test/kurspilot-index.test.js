'use strict';

/**
 * Tests fuer lib/kurspilot-index.js (Issue #275): best-effort Pflege von
 * `<arbeitsbereich>/index.md` beim Anlegen/Aendern eines Vorhabens (siehe
 * docs/specs/0011, Implementation Decisions: "Kurspilot aktualisiert nur
 * den ihm gehoerenden Eintrag ... bei unlesbarem oder manuell
 * konfligierendem Index warnt es und laesst die Arbeitsdatei unveraendert").
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { updateIndexEntry, renderKatalogblatt } = require('../lib/kurspilot-index');
const { readFrontmatterFile } = require('../lib/kurspilot-frontmatter');

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-index-test-'));
}

function writeVorhaben(contextRoot, relDir, fields) {
  const dir = path.join(contextRoot, relDir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'CONTEXT.md');
  const lines = [
    '---',
    'type: vorhaben',
    `title: ${fields.title}`,
    `tags: [${(fields.tags || []).join(', ')}]`,
    `status: ${fields.status || 'aktiv'}`,
    'created: 2026-08-14',
    'updated: 2026-08-14',
    `about: ${fields.about}`,
    `gradeLevel: ${fields.gradeLevel}`,
    'kurspilot:',
    '  personenbezug: false',
    '  weitergabe: schulintern',
    '---',
    '',
    '## Kurzbeschreibung',
    '',
    fields.kurzbeschreibung || 'noch nicht erfasst',
    '',
    '## Verwandter Kontext (optional, leichte Referenz)',
    '',
    '- Fachprofil: `../CONTEXT.md`',
  ];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

test('updateIndexEntry: legt index.md mit deterministischem Eintrag fuer ein neues Vorhaben an', () => {
  const contextRoot = makeWorkspace();
  const filePath = writeVorhaben(contextRoot, '2025-26/7a/naturwissenschaften/photosynthese', {
    title: 'Photosynthese',
    about: 'naturwissenschaften',
    gradeLevel: '7',
    tags: ['fotosynthese', 'biologie'],
    kurzbeschreibung: 'Einstieg in die Fotosynthese.',
  });

  const result = updateIndexEntry(filePath, { contextRoot });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.action, 'angelegt');
  const indexPath = path.join(contextRoot, 'index.md');
  assert.ok(fs.existsSync(indexPath));
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.match(content, /## Aktive Vorhaben/);
  assert.match(content, /## Archivierte Vorhaben/);
  assert.match(content, /### Photosynthese/);
  assert.match(content, /Verweis: `2025-26\/7a\/naturwissenschaften\/photosynthese\/CONTEXT\.md`/);
  assert.match(content, /Fach: naturwissenschaften/);
  assert.match(content, /Jahrgangsstufe: 7/);
  assert.match(content, /Tags: fotosynthese, biologie/);
  assert.match(content, /Kurzbeschreibung: Einstieg in die Fotosynthese\./);

  // Aktive Vorhaben steht vor Archivierte Vorhaben (User Story 9/AC2)
  const aktivIdx = content.indexOf('## Aktive Vorhaben');
  const archivIdx = content.indexOf('## Archivierte Vorhaben');
  const entryIdx = content.indexOf('### Photosynthese');
  assert.ok(aktivIdx < archivIdx);
  assert.ok(entryIdx > aktivIdx && entryIdx < archivIdx);
});

test('updateIndexEntry: ist deterministisch/idempotent bei zweimaligem Aufruf mit gleichen Daten', () => {
  const contextRoot = makeWorkspace();
  const filePath = writeVorhaben(contextRoot, '2025-26/7a/naturwissenschaften/photosynthese', {
    title: 'Photosynthese',
    about: 'naturwissenschaften',
    gradeLevel: '7',
    tags: ['fotosynthese'],
  });

  updateIndexEntry(filePath, { contextRoot });
  const first = fs.readFileSync(path.join(contextRoot, 'index.md'), 'utf8');
  const second = updateIndexEntry(filePath, { contextRoot });
  const after = fs.readFileSync(path.join(contextRoot, 'index.md'), 'utf8');

  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.action, 'aktualisiert');
  assert.strictEqual(first, after);
  // kein doppelter Eintrag
  assert.strictEqual(after.split('### Photosynthese').length - 1, 1);
});

test('updateIndexEntry: aktive Vorhaben stehen vorrangig, archivierte nachrangig und nachvollziehbar', () => {
  const contextRoot = makeWorkspace();
  const aktivFile = writeVorhaben(contextRoot, '2025-26/7a/naturwissenschaften/photosynthese', {
    title: 'Photosynthese',
    about: 'naturwissenschaften',
    gradeLevel: '7',
    status: 'aktiv',
  });
  const archivFile = writeVorhaben(contextRoot, '2024-25/7a/naturwissenschaften/wasserkreislauf', {
    title: 'Wasserkreislauf',
    about: 'naturwissenschaften',
    gradeLevel: '7',
    status: 'archiviert',
  });

  updateIndexEntry(aktivFile, { contextRoot });
  updateIndexEntry(archivFile, { contextRoot });

  const content = fs.readFileSync(path.join(contextRoot, 'index.md'), 'utf8');
  const aktivHeadingIdx = content.indexOf('## Aktive Vorhaben');
  const archivHeadingIdx = content.indexOf('## Archivierte Vorhaben');
  const photosyntheseIdx = content.indexOf('### Photosynthese');
  const wasserkreislaufIdx = content.indexOf('### Wasserkreislauf');

  assert.ok(aktivHeadingIdx < archivHeadingIdx);
  assert.ok(photosyntheseIdx > aktivHeadingIdx && photosyntheseIdx < archivHeadingIdx);
  assert.ok(wasserkreislaufIdx > archivHeadingIdx);
});

test('updateIndexEntry: verschiebt einen Eintrag von aktiv nach archiviert bei Statuswechsel, ohne Duplikat', () => {
  const contextRoot = makeWorkspace();
  const relDir = '2025-26/7a/naturwissenschaften/photosynthese';
  const filePath = writeVorhaben(contextRoot, relDir, {
    title: 'Photosynthese',
    about: 'naturwissenschaften',
    gradeLevel: '7',
    status: 'aktiv',
  });
  updateIndexEntry(filePath, { contextRoot });

  // Vorhaben wird archiviert (geaendertes Vorhaben, AC1)
  writeVorhaben(contextRoot, relDir, {
    title: 'Photosynthese',
    about: 'naturwissenschaften',
    gradeLevel: '7',
    status: 'archiviert',
  });
  const result = updateIndexEntry(filePath, { contextRoot });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.action, 'aktualisiert');
  const content = fs.readFileSync(path.join(contextRoot, 'index.md'), 'utf8');
  const archivHeadingIdx = content.indexOf('## Archivierte Vorhaben');
  const entryIdx = content.indexOf('### Photosynthese');
  assert.ok(entryIdx > archivHeadingIdx);
  assert.strictEqual(content.split('### Photosynthese').length - 1, 1);
});

test('updateIndexEntry: warnt bei unlesbarem/konfliktierendem Index und laesst ihn unveraendert', () => {
  const contextRoot = makeWorkspace();
  const indexPath = path.join(contextRoot, 'index.md');
  const brokenContent = [
    '# Thematischer Index',
    '',
    '## Aktive Vorhaben',
    '',
    '<!-- kurspilot:eintrag 2025-26/7a/naturwissenschaften/anderes-vorhaben -->',
    '### Anderes Vorhaben',
    '- Verweis: `2025-26/7a/naturwissenschaften/anderes-vorhaben/CONTEXT.md`',
    // absichtlich keine schliessende Markierung -> korrupt
    '',
    '## Archivierte Vorhaben',
    '',
  ].join('\n');
  fs.writeFileSync(indexPath, brokenContent, 'utf8');

  const filePath = writeVorhaben(contextRoot, '2025-26/7a/naturwissenschaften/photosynthese', {
    title: 'Photosynthese',
    about: 'naturwissenschaften',
    gradeLevel: '7',
  });

  const result = updateIndexEntry(filePath, { contextRoot });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.warning, true);
  assert.match(result.message, /nicht lesbar|widerspr/i);

  const afterContent = fs.readFileSync(indexPath, 'utf8');
  assert.strictEqual(afterContent, brokenContent);
  // die Arbeitsdatei des Vorhabens bleibt unveraendert
  const vorhabenContentAfter = fs.readFileSync(filePath, 'utf8');
  assert.match(vorhabenContentAfter, /title: Photosynthese/);
});

test('updateIndexEntry: warnt bei doppeltem Eintrag fuer denselben Verweis (Konflikt)', () => {
  const contextRoot = makeWorkspace();
  const indexPath = path.join(contextRoot, 'index.md');
  const relDir = '2025-26/7a/naturwissenschaften/photosynthese';
  const duplicateBlock = [
    `<!-- kurspilot:eintrag ${relDir} -->`,
    '### Photosynthese',
    `- Verweis: \`${relDir}/CONTEXT.md\``,
    '<!-- /kurspilot:eintrag -->',
  ].join('\n');
  const conflictContent = [
    '# Thematischer Index',
    '',
    '## Aktive Vorhaben',
    '',
    duplicateBlock,
    '',
    duplicateBlock,
    '',
    '## Archivierte Vorhaben',
    '',
  ].join('\n');
  fs.writeFileSync(indexPath, conflictContent, 'utf8');

  const filePath = writeVorhaben(contextRoot, relDir, {
    title: 'Photosynthese',
    about: 'naturwissenschaften',
    gradeLevel: '7',
  });

  const result = updateIndexEntry(filePath, { contextRoot });

  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.warning, true);
  assert.strictEqual(fs.readFileSync(indexPath, 'utf8'), conflictContent);
});

test('renderKatalogblatt: baut ein auf das Vorhaben begrenztes Katalogblatt ohne Index-Marker (Issue #276)', () => {
  const contextRoot = makeWorkspace();
  const filePath = writeVorhaben(contextRoot, path.join('2025-26', '7a', 'nawi', 'photosynthese'), {
    title: 'Photosynthese',
    about: 'naturwissenschaften',
    gradeLevel: '7',
    tags: ['bio', 'zellbiologie'],
  });
  const vorhabenContext = readFrontmatterFile(filePath);

  const katalogblatt = renderKatalogblatt(vorhabenContext);

  assert.match(katalogblatt, /^# Katalogblatt/);
  assert.match(katalogblatt, /## Photosynthese/);
  assert.match(katalogblatt, /Fach: naturwissenschaften/);
  assert.match(katalogblatt, /Jahrgangsstufe: 7/);
  assert.match(katalogblatt, /Tags: bio, zellbiologie/);
  assert.doesNotMatch(katalogblatt, /kurspilot:eintrag/);
});
