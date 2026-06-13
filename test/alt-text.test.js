const { test } = require('node:test');
const assert = require('node:assert');

const { generateAltText, MAX_ALT_TEXT_LENGTH } = require('../lib/alt-text');

test('generateAltText: gueltiger Vorschlag liefert { imagePath, altText }', () => {
  const suggestion = generateAltText('materials/biologie/herz_querschnitt.png', {
    altText: 'Querschnitt des menschlichen Herzens mit vier Kammern, Vorhoefen und Klappen.',
  });

  assert.strictEqual(suggestion.imagePath, 'materials/biologie/herz_querschnitt.png');
  assert.strictEqual(
    suggestion.altText,
    'Querschnitt des menschlichen Herzens mit vier Kammern, Vorhoefen und Klappen.',
  );
});

test('generateAltText: trimmt Whitespace um Alt-Text und imagePath', () => {
  const suggestion = generateAltText('  materials/bio/zelle.png  ', {
    altText: '  Tierzelle mit beschrifteten Organellen.  ',
  });

  assert.strictEqual(suggestion.imagePath, 'materials/bio/zelle.png');
  assert.strictEqual(suggestion.altText, 'Tierzelle mit beschrifteten Organellen.');
});

test('generateAltText: leerer Alt-Text wirft Fehler', () => {
  assert.throws(
    () => generateAltText('materials/bio/zelle.png', { altText: '   ' }),
    /altText.*leer/,
  );
});

test('generateAltText: fehlender imagePath wirft Fehler', () => {
  assert.throws(
    () => generateAltText('', { altText: 'Tierzelle mit beschrifteten Organellen.' }),
    /imagePath.*leer/,
  );
});

test('generateAltText: generischer Platzhalter wirft Fehler', () => {
  for (const placeholder of ['Bild', 'Abbildung', 'Screenshot', 'Foto.']) {
    assert.throws(
      () => generateAltText('materials/bio/zelle.png', { altText: placeholder }),
      /Platzhalter/,
      `Platzhalter "${placeholder}" sollte abgelehnt werden`,
    );
  }
});

test('generateAltText: zu langer Alt-Text wirft Fehler', () => {
  const tooLong = 'x'.repeat(MAX_ALT_TEXT_LENGTH + 1);
  assert.throws(
    () => generateAltText('materials/bio/zelle.png', { altText: tooLong }),
    /zu lang/,
  );
});

test('generateAltText: Alt-Text an der Maximallaenge ist erlaubt', () => {
  const exact = 'x'.repeat(MAX_ALT_TEXT_LENGTH);
  const suggestion = generateAltText('materials/bio/zelle.png', { altText: exact });
  assert.strictEqual(suggestion.altText.length, MAX_ALT_TEXT_LENGTH);
});
