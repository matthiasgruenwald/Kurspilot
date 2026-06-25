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
  if (!Array.isArray(args.options) || args.options.length < 2) {
    throw new Error('MC-Frage benoetigt mindestens 2 Antwort-Optionen (options[]).');
  }
  const idx = args.correctindex;
  if (!Number.isInteger(idx) || idx < 0 || idx >= args.options.length) {
    throw new Error(
      `correctindex (${idx}) muss ein Index in options[] sein (0..${args.options.length - 1}).`
    );
  }
}

module.exports = {
  optionsToFormParams,
  validateMcQuestionInput,
};
