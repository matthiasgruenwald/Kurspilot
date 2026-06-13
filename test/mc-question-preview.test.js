'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  previewMcQuestion,
  DIAGNOSTIC_LANGUAGE_PATTERNS,
} = require('../lib/mc-question-preview');

test('previewMcQuestion liefert questiontext, options und feedback', () => {
  const preview = previewMcQuestion({
    name: 'Wasser',
    questiontext: '<p>Was ist die chemische Formel von Wasser?</p>',
    answers: [
      { answer: 'H2O', fraction: 1.0 },
      { answer: 'CO2', fraction: 0.0 },
      { answer: 'O2', fraction: 0.0 },
    ],
    correctindex: 0,
    generalfeedback: '<p>Schau dir die Seite "Stoffe und ihre Formeln" nochmal an.</p>',
  });

  assert.strictEqual(preview.name, 'Wasser');
  assert.strictEqual(preview.questiontext, '<p>Was ist die chemische Formel von Wasser?</p>');

  assert.strictEqual(preview.options.length, 3);
  assert.deepStrictEqual(
    preview.options.map((o) => o.text),
    ['H2O', 'CO2', 'O2']
  );
  assert.deepStrictEqual(
    preview.options.map((o) => o.isCorrect),
    [true, false, false]
  );

  assert.strictEqual(preview.feedback.text, '<p>Schau dir die Seite "Stoffe und ihre Formeln" nochmal an.</p>');
});

test('previewMcQuestion markiert isCorrect ueber fraction>=1, nicht nur correctindex', () => {
  const preview = previewMcQuestion({
    questiontext: 'Frage?',
    answers: [
      { answer: 'A', fraction: 0.0 },
      { answer: 'B', fraction: 1.0 },
    ],
    correctindex: 1,
  });

  assert.deepStrictEqual(
    preview.options.map((o) => o.isCorrect),
    [false, true]
  );
});

test('previewMcQuestion uebernimmt distractorReason aus answers, falls vorhanden', () => {
  const preview = previewMcQuestion({
    questiontext: 'Frage?',
    answers: [
      { answer: 'H2O', fraction: 1.0 },
      { answer: 'CO2', fraction: 0.0, distractorreason: 'Verwechslung mit Atemgas' },
    ],
    correctindex: 0,
  });

  assert.strictEqual(preview.options[0].distractorReason, undefined);
  assert.strictEqual(preview.options[1].distractorReason, 'Verwechslung mit Atemgas');
});

test('previewMcQuestion laesst distractorReason weg, wenn nicht im Input vorhanden', () => {
  const preview = previewMcQuestion({
    questiontext: 'Frage?',
    answers: [
      { answer: 'A', fraction: 1.0 },
      { answer: 'B', fraction: 0.0 },
    ],
    correctindex: 0,
  });

  assert.ok(!('distractorReason' in preview.options[0]));
  assert.ok(!('distractorReason' in preview.options[1]));
});

test('previewMcQuestion extrahiert referencedActivity aus optionalem Input-Feld', () => {
  const preview = previewMcQuestion({
    questiontext: 'Frage?',
    answers: [
      { answer: 'A', fraction: 1.0 },
      { answer: 'B', fraction: 0.0 },
    ],
    correctindex: 0,
    generalfeedback: 'Schau nochmal in die Textseite "Stoffe und ihre Formeln".',
    referencedactivity: 'Stoffe und ihre Formeln',
  });

  assert.strictEqual(preview.feedback.referencedActivity, 'Stoffe und ihre Formeln');
});

test('previewMcQuestion liefert referencedActivity null, wenn nichts erkennbar', () => {
  const preview = previewMcQuestion({
    questiontext: 'Frage?',
    answers: [
      { answer: 'A', fraction: 1.0 },
      { answer: 'B', fraction: 0.0 },
    ],
    correctindex: 0,
    generalfeedback: 'Allgemeines Feedback ohne Materialverweis.',
  });

  assert.strictEqual(preview.feedback.referencedActivity, null);
});

test('previewMcQuestion liefert leeren Feedback-Text, wenn generalfeedback fehlt', () => {
  const preview = previewMcQuestion({
    questiontext: 'Frage?',
    answers: [
      { answer: 'A', fraction: 1.0 },
      { answer: 'B', fraction: 0.0 },
    ],
    correctindex: 0,
  });

  assert.strictEqual(preview.feedback.text, '');
  assert.strictEqual(preview.feedback.referencedActivity, null);
});

test('previewMcQuestion wirft fuer fehlende/ungueltige Eingabe', () => {
  assert.throws(() => previewMcQuestion(null), /Frage/);
  assert.throws(() => previewMcQuestion({}), /answers/);
  assert.throws(() => previewMcQuestion({ questiontext: 'Frage?', answers: [] }), /answers/);
});

// Vermeidungsliste diagnostischer Sprache (Issue #14): Feedback-Texte sollen
// konstruktiv auf Wiederholung verweisen, nicht Fehlvorstellungen der
// Lernenden direkt benennen/labeln.
test('DIAGNOSTIC_LANGUAGE_PATTERNS erkennt labelnde Formulierungen', () => {
  const badExamples = [
    'Du hast nicht verstanden, wie Photosynthese funktioniert.',
    'Du hast das Thema nicht gelernt.',
    'Du verstehst die Aufgabe leider falsch.',
  ];
  for (const text of badExamples) {
    const hit = DIAGNOSTIC_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));
    assert.ok(hit, `Erwartete Treffer fuer: "${text}"`);
  }
});

test('DIAGNOSTIC_LANGUAGE_PATTERNS schlaegt bei konstruktivem Feedback nicht an', () => {
  const goodExamples = [
    'Schau dir nochmal die Seite "Stoffe und ihre Formeln" an.',
    'Wiederhole das Kapitel zur Photosynthese, dort findest du die Antwort.',
  ];
  for (const text of goodExamples) {
    const hit = DIAGNOSTIC_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));
    assert.ok(!hit, `Erwartete keinen Treffer fuer: "${text}"`);
  }
});
