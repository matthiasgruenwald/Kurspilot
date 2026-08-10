'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  optionsToFormParams,
  validateMcQuestionInput,
  normalizeMcQuestionInput,
  answersToFormParams,
} = require('../lib/mc-question');

test('optionsToFormParams serialisiert Array als options[i]-Form-Felder', () => {
  const result = optionsToFormParams(['A', 'B', 'C']);
  assert.deepStrictEqual(result, {
    'options[0]': 'A',
    'options[1]': 'B',
    'options[2]': 'C',
  });
});

test('optionsToFormParams gibt leeres Objekt fuer Nicht-Arrays zurueck', () => {
  assert.deepStrictEqual(optionsToFormParams(undefined), {});
  assert.deepStrictEqual(optionsToFormParams(null), {});
  assert.deepStrictEqual(optionsToFormParams('A'), {});
});

test('optionsToFormParams stringifiziert Werte (defensive)', () => {
  const result = optionsToFormParams([1, true, 'X']);
  assert.strictEqual(result['options[0]'], '1');
  assert.strictEqual(result['options[1]'], 'true');
  assert.strictEqual(result['options[2]'], 'X');
});

test('validateMcQuestionInput akzeptiert gueltige Eingabe', () => {
  assert.doesNotThrow(() => {
    validateMcQuestionInput({
      name: 'Frage 1',
      questiontext: '<p>Was ist H2O?</p>',
      options: ['Wasser', 'Sauerstoff'],
      correctindex: 0,
    });
  });
});

test('validateMcQuestionInput verlangt name', () => {
  assert.throws(
    () => validateMcQuestionInput({
      questiontext: '?', options: ['A', 'B'], correctindex: 0,
    }),
    /Namen/
  );
  assert.throws(
    () => validateMcQuestionInput({
      name: '   ', questiontext: '?', options: ['A', 'B'], correctindex: 0,
    }),
    /Namen/
  );
});

test('validateMcQuestionInput verlangt questiontext', () => {
  assert.throws(
    () => validateMcQuestionInput({
      name: 'X', options: ['A', 'B'], correctindex: 0,
    }),
    /Fragetext/
  );
});

test('validateMcQuestionInput verlangt mind. 2 Optionen', () => {
  assert.throws(
    () => validateMcQuestionInput({
      name: 'X', questiontext: '?', options: ['A'], correctindex: 0,
    }),
    /mindestens 2/
  );
  assert.throws(
    () => validateMcQuestionInput({
      name: 'X', questiontext: '?', options: [], correctindex: 0,
    }),
    /mindestens 2/
  );
  assert.throws(
    () => validateMcQuestionInput({
      name: 'X', questiontext: '?', correctindex: 0,
    }),
    /mindestens 2/
  );
});

test('validateMcQuestionInput prueft correctindex-Range', () => {
  assert.throws(
    () => validateMcQuestionInput({
      name: 'X', questiontext: '?', options: ['A', 'B'], correctindex: -1,
    }),
    /correctindex/
  );
  assert.throws(
    () => validateMcQuestionInput({
      name: 'X', questiontext: '?', options: ['A', 'B'], correctindex: 2,
    }),
    /correctindex/
  );
  assert.throws(
    () => validateMcQuestionInput({
      name: 'X', questiontext: '?', options: ['A', 'B'], correctindex: 1.5,
    }),
    /correctindex/
  );
});

test('validateMcQuestionInput wirft fuer fehlende args', () => {
  assert.throws(() => validateMcQuestionInput(null), /Argumente/);
  assert.throws(() => validateMcQuestionInput(undefined), /Argumente/);
});

test('normalizeMcQuestionInput macht bestehende correctindex-Aufrufe zur Einfachauswahl', () => {
  const normalized = normalizeMcQuestionInput({
    name: 'Wasser', questiontext: 'Was ist H2O?', options: ['Wasser', 'Sauerstoff'], correctindex: 0,
  });

  assert.strictEqual(normalized.selectionmode, 'single');
  assert.deepStrictEqual(normalized.answers, [
    { answer: 'Wasser', correct: true, fraction: 1, feedback: '' },
    { answer: 'Sauerstoff', correct: false, fraction: 0, feedback: '' },
  ]);
});

test('normalizeMcQuestionInput normalisiert Mehrfachauswahl, Feedback und negative Fractions', () => {
  const normalized = normalizeMcQuestionInput({
    name: 'Elemente', questiontext: 'Waehle alle Elemente.', selectionmode: 'multiple',
    answers: [
      { answer: 'Sauerstoff', correct: true, feedback: 'Richtig.', fraction: 0.5 },
      { answer: 'Stickstoff', correct: true, feedback: 'Richtig.', fraction: 0.5 },
      { answer: 'Wasser', correct: false, feedback: 'Eine Verbindung.', fraction: -0.5 },
    ],
  });

  assert.strictEqual(normalized.selectionmode, 'multiple');
  assert.deepStrictEqual(normalized.answers[2], {
    answer: 'Wasser', correct: false, fraction: -0.5, feedback: 'Eine Verbindung.',
  });
});

test('normalizeMcQuestionInput warnt konkret, wenn alles Auswaehlen volle Punktzahl gibt', () => {
  const normalized = normalizeMcQuestionInput({
    name: 'Warnung', questiontext: 'Frage?', selectionmode: 'multiple',
    answers: [
      { answer: 'A', correct: true, fraction: 1 },
      { answer: 'B', correct: false, fraction: 0 },
    ],
  });

  assert.match(normalized.warnings[0], /alle Antworten.*volle Punktzahl/i);
});

test('normalizeMcQuestionInput lehnt widersprüchliche Korrektheit und Fraction ab', () => {
  assert.throws(() => normalizeMcQuestionInput({
    name: 'Widerspruch', questiontext: 'Frage?', selectionmode: 'single',
    answers: [{ answer: 'A', correct: true, fraction: 0 }, { answer: 'B', correct: false, fraction: 1 }],
  }), /übereinstimmen/);
});

test('normalizeMcQuestionInput empfiehlt bei ungleicher Antwortanzahl die Gewichtungsprüfung', () => {
  const normalized = normalizeMcQuestionInput({
    name: 'Unausgewogen', questiontext: 'Frage?', selectionmode: 'multiple',
    answers: [
      { answer: 'A', correct: true, fraction: 0.5 },
      { answer: 'B', correct: true, fraction: 0.5 },
      { answer: 'C', correct: false, fraction: -0.5 },
    ],
  });
  assert.match(normalized.warnings.at(-1), /unausgewogen/);
});

test('answersToFormParams serialisiert Antwortfeedback und negative Fractions', () => {
  assert.deepStrictEqual(answersToFormParams([
    { answer: 'Wasser', correct: false, fraction: -0.5, feedback: 'Eine Verbindung.' },
  ]), {
    'answers[0][answer]': 'Wasser',
    'answers[0][correct]': '0',
    'answers[0][fraction]': '-0.5',
    'answers[0][feedback]': 'Eine Verbindung.',
  });
});
