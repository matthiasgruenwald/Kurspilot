'use strict';

/**
 * Lesbare Fragenvorschau fuer Multiple-Choice-Fragen (Issue #14).
 *
 * - previewMcQuestion: wandelt die Rohdaten einer MC-Frage (wie sie
 *   local_aicoursecreator_get_question/create_mc_question liefern bzw.
 *   entgegennehmen: { questiontext, answers: [{answer, fraction}],
 *   correctindex, generalfeedback, ... }) in eine lesbare
 *   Vorschau-Datenstruktur fuer die Lehrkraft-Freigabe um.
 * - DIAGNOSTIC_LANGUAGE_PATTERNS: Vermeidungsliste fuer diagnostisch-labelnde
 *   Formulierungen im Antwortfeedback (siehe CONTEXT.md, "Antwortfeedback").
 *
 * Reine Funktionen, keine Seiteneffekte, immutabel (gibt neue Objekte zurueck).
 */

// Formulierungen, die Antwortfeedback fuer Lernende NICHT enthalten soll:
// diagnostisch/labelnd statt konstruktiv-fachlich (CONTEXT.md "Antwortfeedback").
// Bewusst einfach gehalten (kleine Wortliste, keine NLP-Heuristik).
const DIAGNOSTIC_LANGUAGE_PATTERNS = [
  /du hast (das|dieses|den|die) thema nicht (gelernt|verstanden)/i,
  /du hast nicht (verstanden|gelernt|aufgepasst)/i,
  /du verstehst .* (nicht|falsch)/i,
  /du kannst .* nicht/i,
];

/**
 * Versucht, eine Bezugsaktivitaet (Materialverweis im Feedback) aus dem
 * Feedback-Text zu extrahieren, falls Anfuehrungszeichen einen Aktivitaets-
 * oder Seitennamen markieren (z.B. Textseite "Stoffe und ihre Formeln").
 * Liefert null, wenn nichts erkennbar ist.
 */
function extractReferencedActivity(feedbackText) {
  if (typeof feedbackText !== 'string') {
    return null;
  }
  const match = feedbackText.match(/["“”']([^"“”']+)["“”']/);
  return match ? match[1] : null;
}

function buildOption(answer, index, correctindex) {
  const fraction = Number(answer.fraction);
  const isCorrect = fraction >= 1 || index === correctindex;

  const option = {
    text: answer.answer,
    isCorrect,
  };

  const distractorReason = answer.distractorreason ?? answer.distractorReason;
  if (distractorReason !== undefined) {
    option.distractorReason = distractorReason;
  }

  return option;
}

/**
 * Erzeugt aus MC-Frage-Daten eine lesbare Vorschau fuer die Lehrkraft-Freigabe.
 *
 * @param {object} questionData - { name?, questiontext, answers, correctindex,
 *   generalfeedback?, referencedactivity? }
 * @returns {{
 *   name: (string|undefined),
 *   questiontext: string,
 *   options: Array<{text: string, isCorrect: boolean, distractorReason?: string}>,
 *   feedback: {text: string, referencedActivity: (string|null)},
 * }}
 */
function previewMcQuestion(questionData) {
  if (!questionData || typeof questionData !== 'object') {
    throw new Error('Fragedaten fehlen.');
  }
  if (!Array.isArray(questionData.answers) || questionData.answers.length < 1) {
    throw new Error('Fragedaten benoetigen Antwortoptionen (answers[]).');
  }

  const { correctindex } = questionData;
  const options = questionData.answers.map(
    (answer, index) => buildOption(answer, index, correctindex)
  );

  const feedbackText = questionData.generalfeedback ?? '';
  const referencedActivity = questionData.referencedactivity
    ?? extractReferencedActivity(feedbackText);

  return {
    name: questionData.name,
    questiontext: questionData.questiontext,
    options,
    feedback: {
      text: feedbackText,
      referencedActivity,
    },
  };
}

module.exports = {
  previewMcQuestion,
  DIAGNOSTIC_LANGUAGE_PATTERNS,
};
