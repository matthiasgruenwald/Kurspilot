'use strict';

/**
 * Hilfen fuer Multiple-Choice-Frage-Tools (Issue #9).
 *
 * - optionsToFormParams: serialisiert ein options-Array zu options[0],
 *   options[1], ... wie Moodles Webservice-Endpoint es fuer Array-Parameter
 *   per x-www-form-urlencoded erwartet.
 * - validateMcQuestionInput: pre-flight Input-Validierung fuer
 *   create/update_mc_question – wirft Error mit deutscher Lehrkraft-Nachricht.
 *
 * Reine Funktionen, keine Seiteneffekte, immutabel (gibt neues Objekt zurueck).
 */

function optionsToFormParams(options) {
  if (!Array.isArray(options)) {
    return {};
  }
  return Object.fromEntries(
    options.map((opt, i) => [`options[${i}]`, String(opt)])
  );
}

function validateMcQuestionInput(args) {
  if (!args || typeof args !== 'object') {
    throw new Error('MC-Frage-Argumente fehlen.');
  }
  if (!args.name || typeof args.name !== 'string' || args.name.trim() === '') {
    throw new Error('MC-Frage benoetigt einen Namen (name).');
  }
  if (!args.questiontext || typeof args.questiontext !== 'string'
      || args.questiontext.trim() === '') {
    throw new Error('MC-Frage benoetigt einen Fragetext (questiontext).');
  }
  const answers = Array.isArray(args.answers) ? args.answers : args.options;
  if (!Array.isArray(answers) || answers.length < 2) {
    throw new Error('MC-Frage benoetigt mindestens 2 Antwort-Optionen (options[]).');
  }
  if (Array.isArray(args.answers)) {
    if (!['single', 'multiple'].includes(args.selectionmode)) {
      throw new Error('selectionmode muss "single" oder "multiple" sein.');
    }
    return;
  }
  const idx = args.correctindex;
  if (!Number.isInteger(idx) || idx < 0 || idx >= answers.length) {
    throw new Error(
      `correctindex (${idx}) muss ein Index in options[] sein (0..${answers.length - 1}).`
    );
  }
}

function normalizeMcQuestionInput(args) {
  validateMcQuestionInput(args);
  const selectionmode = Array.isArray(args.answers) ? args.selectionmode : 'single';
  const answers = Array.isArray(args.answers)
    ? args.answers.map(answer => {
      const fraction = Number(answer.fraction ?? (answer.correct ? 1 : 0));
      if (!Number.isFinite(fraction) || fraction < -1 || fraction > 1) {
        throw new Error('Antwortgewicht (fraction) muss zwischen -1 und 1 liegen.');
      }
      if (!answer.answer || typeof answer.answer !== 'string') {
        throw new Error('Jede Antwort benoetigt einen Text (answer).');
      }
      const correct = answer.correct ?? fraction > 0;
      if (correct !== (fraction > 0)) {
        throw new Error('Korrektheit und Antwortgewicht (fraction) müssen übereinstimmen.');
      }
      return {
        answer: answer.answer,
        correct,
        fraction,
        feedback: answer.feedback ?? '',
      };
    })
    : args.options.map((answer, index) => ({
      answer, correct: index === args.correctindex, fraction: index === args.correctindex ? 1 : 0, feedback: '',
    }));
  if (selectionmode === 'single' && answers.filter(answer => answer.correct).length !== 1) {
    throw new Error('Eine Einfachauswahl braucht genau eine richtige Antwort.');
  }
  const warnings = [];
  if (selectionmode === 'multiple') {
    const allAnswersFraction = answers.reduce((sum, answer) => sum + answer.fraction, 0);
    if (allAnswersFraction >= 1) {
      warnings.push('Wer alle Antworten auswählt, erhält volle Punktzahl; prüfe die Gewichte der Distraktoren.');
    }
    if (answers.filter(answer => answer.correct).length !== answers.filter(answer => !answer.correct).length) {
      warnings.push('Die Zahl richtiger und nicht richtiger Antworten ist unausgewogen; prüfe die Gewichte für eine faire Bewertung.');
    }
  }
  return { selectionmode, answers, warnings };
}

function answersToFormParams(answers) {
  return Object.fromEntries(answers.flatMap((answer, index) => [
    [`answers[${index}][answer]`, answer.answer],
    [`answers[${index}][correct]`, String(answer.correct ? 1 : 0)],
    [`answers[${index}][fraction]`, String(answer.fraction)],
    [`answers[${index}][feedback]`, answer.feedback],
  ]));
}

module.exports = {
  optionsToFormParams,
  validateMcQuestionInput,
  normalizeMcQuestionInput,
  answersToFormParams,
};
