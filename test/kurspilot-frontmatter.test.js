'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildFrontmatterBlock,
  parseFrontmatter,
  validateFrontmatterData,
  readFrontmatterFile,
  prependFrontmatter,
  ALLOWED_TYPES,
  ALLOWED_STATUS,
  ALLOWED_WEITERGABE,
} = require('../lib/kurspilot-frontmatter');

function makeTmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-frontmatter-test-'));
  const filePath = path.join(dir, 'CONTEXT.md');
  if (content !== undefined) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return filePath;
}

function validData(overrides = {}) {
  return {
    type: 'lerngruppe',
    title: '7a',
    tags: ['nawi'],
    status: 'aktiv',
    created: '2026-08-14',
    updated: '2026-08-14',
    about: '7a',
    gradeLevel: '7',
    kurspilot: { personenbezug: true, weitergabe: 'schulintern' },
    ...overrides,
  };
}

test('ALLOWED_* enthalten die in Spezifikation 0010 festgelegten Werte', () => {
  assert.deepStrictEqual(
    ALLOWED_TYPES.sort(),
    ['fach', 'journal', 'lerngruppe', 'material', 'plan', 'status', 'vorhaben', 'wegweiser'].sort()
  );
  assert.deepStrictEqual(ALLOWED_STATUS.sort(), ['abgeschlossen', 'aktiv', 'archiviert'].sort());
  assert.deepStrictEqual(ALLOWED_WEITERGABE.sort(), ['nicht_weitergeben', 'offen', 'schulintern'].sort());
});

test('buildFrontmatterBlock/parseFrontmatter: Round-Trip erhaelt alle Pflichtfelder', () => {
  const data = validData();
  const block = buildFrontmatterBlock(data);

  assert.match(block, /^---\n/);
  assert.match(block, /\n---$/);

  const { data: parsed, body } = parseFrontmatter(`${block}\n\nInhalt.`);

  assert.strictEqual(parsed.type, 'lerngruppe');
  assert.strictEqual(parsed.title, '7a');
  assert.deepStrictEqual(parsed.tags, ['nawi']);
  assert.strictEqual(parsed.status, 'aktiv');
  assert.strictEqual(parsed.created, '2026-08-14');
  assert.strictEqual(parsed.about, '7a');
  assert.strictEqual(parsed.gradeLevel, '7');
  assert.deepStrictEqual(parsed.kurspilot, { personenbezug: true, weitergabe: 'schulintern' });
  assert.strictEqual(body, 'Inhalt.');
});

test('buildFrontmatterBlock erhaelt unbekannte optionale Felder', () => {
  const block = buildFrontmatterBlock(validData({ license: 'CC BY-SA 4.0', derivedFrom: 'alter-pfad' }));
  const { data } = parseFrontmatter(`${block}\n\nInhalt.`);

  assert.strictEqual(data.license, 'CC BY-SA 4.0');
  assert.strictEqual(data.derivedFrom, 'alter-pfad');
});

test('validateFrontmatterData wirft bei fehlendem Pflichtfeld', () => {
  const data = validData();
  delete data.gradeLevel;
  assert.throws(() => validateFrontmatterData(data), /gradeLevel/);
});

test('validateFrontmatterData wirft bei unerlaubtem Statuswert', () => {
  assert.throws(() => validateFrontmatterData(validData({ status: 'in-arbeit' })), /status/);
});

test('validateFrontmatterData wirft bei unerlaubtem Weitergabewert', () => {
  assert.throws(
    () => validateFrontmatterData(validData({ kurspilot: { personenbezug: false, weitergabe: 'irgendwie' } })),
    /weitergabe/
  );
});

test('validateFrontmatterData wirft bei nicht-booleschem personenbezug', () => {
  assert.throws(
    () => validateFrontmatterData(validData({ kurspilot: { personenbezug: 'ja', weitergabe: 'offen' } })),
    /personenbezug/
  );
});

test('parseFrontmatter wirft bei fehlendem Frontmatter (sichtbarer Fehler statt stiller Verlust)', () => {
  assert.throws(() => parseFrontmatter('# Kein Frontmatter\n\nText.'), /Frontmatter/);
});

test('parseFrontmatter wirft bei nicht abgeschlossenem Frontmatter-Block', () => {
  assert.throws(() => parseFrontmatter('---\ntype: fach\n\nText ohne schliessendes Dreistrich.'), /---/);
});

test('readFrontmatterFile liest eine gueltige Datei', () => {
  const block = buildFrontmatterBlock(validData({ type: 'fach', about: 'naturwissenschaften' }));
  const filePath = makeTmpFile(`${block}\n\n# Fachprofil\n`);

  const result = readFrontmatterFile(filePath);

  assert.strictEqual(result.data.type, 'fach');
  assert.strictEqual(result.filePath, filePath);
  assert.match(result.body, /# Fachprofil/);
});

test('readFrontmatterFile wirft sichtbaren Fehler bei fehlender Datei, ohne etwas zu schreiben', () => {
  const missingPath = path.join(os.tmpdir(), 'kurspilot-frontmatter-does-not-exist', 'CONTEXT.md');
  assert.throws(() => readFrontmatterFile(missingPath), /nicht gefunden/);
  assert.ok(!fs.existsSync(missingPath));
});

test('readFrontmatterFile wirft sichtbaren Fehler bei unlesbarem Frontmatter und laesst die Datei unveraendert', () => {
  const originalContent = '# Datei ohne Frontmatter\n\nBestehender Inhalt.';
  const filePath = makeTmpFile(originalContent);

  assert.throws(() => readFrontmatterFile(filePath), /Frontmatter/);
  assert.strictEqual(fs.readFileSync(filePath, 'utf8'), originalContent);
});

test('readFrontmatterFile wirft sichtbaren Fehler bei ungueltigen Werten und laesst die Datei unveraendert', () => {
  const block = buildFrontmatterBlock(validData());
  const invalidBlock = block.replace('status: aktiv', 'status: irgendwas');
  const originalContent = `${invalidBlock}\n\nInhalt.`;
  const filePath = makeTmpFile(originalContent);

  assert.throws(() => readFrontmatterFile(filePath), /ung(ü|ue)ltig/i);
  assert.strictEqual(fs.readFileSync(filePath, 'utf8'), originalContent);
});

test('prependFrontmatter kombiniert Frontmatter-Block und Body', () => {
  const combined = prependFrontmatter(validData(), '# Inhalt\n');
  assert.match(combined, /^---\n/);
  assert.match(combined, /# Inhalt/);
});
