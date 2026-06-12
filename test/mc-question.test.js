'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  optionsToFormParams,
  validateMcQuestionInput,
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
