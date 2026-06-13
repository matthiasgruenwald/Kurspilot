'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { previewQuestionEdit, SMALL_CHANGE_TOKEN_THRESHOLD } = require('../lib/question-edit-preview');

const BASE_QUESTION = {
  questiontext: 'Was ist die Hauptstadt von Frankreich?',
  answers: [
    { answer: 'Paris', fraction: 1.0 },
    { answer: 'Berlin', fraction: 0.0 },
  ],
  correctindex: 0,
  generalfeedback: '<p>Schau dir die Seite "Hauptstaedte Europas" nochmal an.</p>',
};

test('previewQuestionEdit liefert Diff-Segmente fuer questiontext (equal/removed/added)', () => {
  const newData = {
    ...BASE_QUESTION,
    questiontext: 'Was ist die Hauptstadt von Deutschland?',
  };

  const preview = previewQuestionEdit(BASE_QUESTION, newData);

  assert.deepStrictEqual(preview.questiontext.diff, [
    { type: 'equal', text: 'Was ist die Hauptstadt von' },
    { type: 'removed', text: 'Frankreich?' },
    { type: 'added', text: 'Deutschland?' },
  ]);
});

test('kleine Aenderung (1 Wort ersetzt) -> kein Eskalations-Flag, kein Side-by-Side-Fallback', () => {
  const newData = {
    ...BASE_QUESTION,
    questiontext: 'Was ist die Hauptstadt von Deutschland?',
  };

  const preview = previewQuestionEdit(BASE_QUESTION, newData);

  assert.strictEqual(preview.questiontext.sideBySideFallback, false);
  assert.strictEqual(preview.answersChanged, false);
  assert.strictEqual(preview.escalate, false);
});

test('grosse Aenderung am Fragetext -> Eskalations-Flag + Side-by-Side-Fallback', () => {
  const newData = {
    ...BASE_QUESTION,
    questiontext: 'Welches Land grenzt im Osten an Frankreich und hat als Hauptstadt Warschau?',
  };

  const preview = previewQuestionEdit(BASE_QUESTION, newData);

  assert.ok(preview.questiontext.diff.some((s) => s.type !== 'equal'));
  assert.strictEqual(preview.questiontext.sideBySideFallback, true);
  assert.strictEqual(preview.escalate, true);
});

test('veraenderte Distraktor-Logik (Antwortoptionen) eskaliert auch bei unveraendertem Fragetext', () => {
  const newData = {
    ...BASE_QUESTION,
    answers: [
      { answer: 'Paris', fraction: 1.0 },
      { answer: 'Madrid', fraction: 0.0 },
    ],
  };

  const preview = previewQuestionEdit(BASE_QUESTION, newData);

  assert.strictEqual(preview.questiontext.sideBySideFallback, false);
  assert.strictEqual(preview.answersChanged, true);
  assert.strictEqual(preview.escalate, true);
});

test('veraendertes correctindex (Distraktor-Logik) eskaliert', () => {
  const newData = {
    ...BASE_QUESTION,
    correctindex: 1,
  };

  const preview = previewQuestionEdit(BASE_QUESTION, newData);

  assert.strictEqual(preview.answersChanged, true);
  assert.strictEqual(preview.escalate, true);
});

test('SMALL_CHANGE_TOKEN_THRESHOLD ist exportiert und dokumentiert die Schwelle', () => {
  assert.strictEqual(typeof SMALL_CHANGE_TOKEN_THRESHOLD, 'number');
  assert.ok(SMALL_CHANGE_TOKEN_THRESHOLD > 0);
});

test('previewQuestionEdit wirft fuer fehlende/ungueltige Eingabe', () => {
  assert.throws(() => previewQuestionEdit(null, BASE_QUESTION), /erforderlich/);
  assert.throws(() => previewQuestionEdit(BASE_QUESTION, null), /erforderlich/);
  assert.throws(() => previewQuestionEdit({}, BASE_QUESTION), /questiontext/);
  assert.throws(() => previewQuestionEdit(BASE_QUESTION, { questiontext: 5, answers: [] }), /questiontext/);
});
