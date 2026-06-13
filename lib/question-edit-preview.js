'use strict';

/**
 * Vergleichsdarstellung fuer Fragen-Edits (Issue #18, baut auf #9/#14 auf).
 *
 * previewQuestionEdit(oldData, newData) liefert eine Wort-Diff-Vorschau fuer
 * questiontext sowie ein Eskalations-Flag: kleine Korrekturen (CONTEXT.md
 * "ein bis zwei Woerter") sind direkt freigebbar, groessere Aenderungen am
 * Fragetext oder an den Antwortoptionen (veraenderte Distraktor-Logik)
 * loesen einen erneuten KI-Revisionsvorschlag mit neuer Vorschau aus.
 *
 * Reine Funktion, keine Seiteneffekte.
 */

// "ein bis zwei Woerter" (Issue #18) entspricht hoechstens 2 ersetzten
// Woertern = max. 4 geaenderten Tokens (je 1 entfernt + 1 hinzugefuegt).
const SMALL_CHANGE_TOKEN_THRESHOLD = 4;

function splitWords(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

/**
 * Wort-Diff via LCS (Longest Common Subsequence) auf Wortebene.
 * Liefert zusammengefasste Segmente {type: 'equal'|'removed'|'added', text}
 * sowie die Anzahl der geaenderten Tokens (alles, was nicht 'equal' ist).
 */
function diffWords(oldText, newText) {
  const oldWords = splitWords(oldText);
  const newWords = splitWords(newText);
  const m = oldWords.length;
  const n = newWords.length;

  const lcs = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = oldWords[i] === newWords[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const tokens = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldWords[i] === newWords[j]) {
      tokens.push({ type: 'equal', text: oldWords[i] });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      tokens.push({ type: 'removed', text: oldWords[i] });
      i++;
    } else {
      tokens.push({ type: 'added', text: newWords[j] });
      j++;
    }
  }
  while (i < m) { tokens.push({ type: 'removed', text: oldWords[i] }); i++; }
  while (j < n) { tokens.push({ type: 'added', text: newWords[j] }); j++; }

  const segments = [];
  for (const token of tokens) {
    const last = segments[segments.length - 1];
    if (last && last.type === token.type) {
      last.text += ` ${token.text}`;
    } else {
      segments.push({ type: token.type, text: token.text });
    }
  }

  const changedTokenCount = tokens.filter((t) => t.type !== 'equal').length;

  return { segments, changedTokenCount };
}

/**
 * Vergleicht Antwortoptionen zweier Fragedaten-Objekte (Text, Bewertung,
 * Distraktor-Begruendung) sowie das korrekte Index. Jede Aenderung hier
 * gilt als "veraenderte Distraktor-Logik" (Issue #18) und eskaliert immer,
 * unabhaengig vom Fragetext-Diff.
 */
function answersChanged(oldData, newData) {
  const normalize = (data) => ({
    correctindex: data.correctindex,
    answers: (data.answers || []).map((a) => ({
      answer: a.answer,
      fraction: Number(a.fraction),
      distractorreason: a.distractorreason ?? a.distractorReason ?? null,
    })),
  });

  return JSON.stringify(normalize(oldData)) !== JSON.stringify(normalize(newData));
}

/**
 * Erzeugt eine Vergleichsdarstellung fuer ein Fragen-Edit.
 *
 * @param {object} oldData bisherige Fragedaten ({ questiontext, answers, correctindex, generalfeedback? })
 * @param {object} newData vorgeschlagene neue Fragedaten (gleiche Form)
 * @returns {{
 *   questiontext: { diff: Array<{type: string, text: string}>, sideBySideFallback: boolean },
 *   answersChanged: boolean,
 *   escalate: boolean,
 * }}
 */
function previewQuestionEdit(oldData, newData) {
  if (!oldData || typeof oldData !== 'object' || !newData || typeof newData !== 'object') {
    throw new Error('Alte und neue Fragedaten sind erforderlich.');
  }
  if (typeof oldData.questiontext !== 'string' || typeof newData.questiontext !== 'string') {
    throw new Error('Fragedaten benoetigen questiontext (string).');
  }

  const { segments, changedTokenCount } = diffWords(oldData.questiontext, newData.questiontext);
  const sideBySideFallback = changedTokenCount > SMALL_CHANGE_TOKEN_THRESHOLD;
  const answersDiffer = answersChanged(oldData, newData);

  return {
    questiontext: {
      diff: segments,
      sideBySideFallback,
    },
    answersChanged: answersDiffer,
    escalate: sideBySideFallback || answersDiffer,
  };
}

module.exports = {
  SMALL_CHANGE_TOKEN_THRESHOLD,
  previewQuestionEdit,
};
