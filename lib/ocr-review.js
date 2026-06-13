/**
 * ocr-review.js
 *
 * Modul fuer "OCR-Extraktion via Agent-Vision + Kontroll-Gate" (siehe
 * Issue #15, CONTEXT.md "OCR-Extraktion", "OCR-Kontrolle", "Originalmaterial").
 *
 * Die eigentliche Bildanalyse ist KEIN Funktionsaufruf in diesem Modul:
 * der Agent liest die Bilddatei direkt ueber sein Vision-Lesevermoegen
 * (Read-Tool) und liefert den erkannten Text als `extractedText`. Dieses
 * Modul modelliert nur den danach folgenden Kontroll-Gate-Zustand:
 *
 *   createOcrDraft({ sourcePath, extractedText })
 *     -> Draft mit status "pending_review"
 *   approveOcrDraft(draft, { correctedText, approvedBy })
 *     -> Draft mit status "approved" und finalem Text
 *   assertApprovedForMoodle(draft)
 *     -> finalText, wenn approved; wirft sonst (Kontroll-Gate)
 *
 * Reine Datenmodell-/Validierungslogik, kein Moodle-Zugriff und kein
 * Bild-/OCR-Library-Aufruf.
 */

'use strict';

/** Erlaubte Status-Werte fuer einen OCR-Entwurf. */
const OCR_DRAFT_STATUS = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
});

/**
 * Pflichtfeld-Pruefung fuer nicht-leere Strings.
 */
function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────
// createOcrDraft
// ─────────────────────────────────────────────────────────────

/**
 * Erzeugt einen neuen OCR-Entwurf im Status "pending_review".
 *
 * @param {object} params
 * @param {string} params.sourcePath Pfad zum Originalscan unter
 *   `materials/<thema>/...` (CONTEXT.md "Originalmaterial", bleibt unveraendert)
 * @param {string} params.extractedText Vom Agent via Vision-Read erkannter Text
 * @returns {{status: string, sourcePath: string, extractedText: string}}
 */
function createOcrDraft({ sourcePath, extractedText } = {}) {
  requireNonEmptyString(sourcePath, 'sourcePath');
  requireNonEmptyString(extractedText, 'extractedText');

  return {
    status: OCR_DRAFT_STATUS.PENDING_REVIEW,
    sourcePath,
    extractedText,
  };
}

// ─────────────────────────────────────────────────────────────
// approveOcrDraft
// ─────────────────────────────────────────────────────────────

/**
 * Gibt einen OCR-Entwurf nach Lehrkraft-Kontrolle frei (CONTEXT.md
 * "OCR-Kontrolle"). Liefert einen NEUEN Draft im Status "approved"
 * (Original bleibt unveraendert, vgl. Immutability-Konvention).
 *
 * @param {object} draft Entwurf im Status "pending_review"
 * @param {object} params
 * @param {string} [params.correctedText] von der Lehrkraft korrigierter Text;
 *   fehlt er, wird `draft.extractedText` unveraendert als `finalText` uebernommen
 * @param {string} params.approvedBy Pflicht: wer die Freigabe erteilt hat
 * @returns {object} neuer Draft mit status "approved" und `finalText`
 */
function approveOcrDraft(draft, { correctedText, approvedBy } = {}) {
  if (!draft || draft.status !== OCR_DRAFT_STATUS.PENDING_REVIEW) {
    throw new Error(
      `Nur Entwuerfe im Status "${OCR_DRAFT_STATUS.PENDING_REVIEW}" koennen freigegeben werden.`
    );
  }
  requireNonEmptyString(approvedBy, 'approvedBy');

  const finalText = correctedText !== undefined ? correctedText : draft.extractedText;
  requireNonEmptyString(finalText, 'finalText');

  return {
    ...draft,
    status: OCR_DRAFT_STATUS.APPROVED,
    finalText,
    approvedBy,
  };
}

// ─────────────────────────────────────────────────────────────
// assertApprovedForMoodle (Kontroll-Gate)
// ─────────────────────────────────────────────────────────────

/**
 * Kontroll-Gate: stellt sicher, dass ein OCR-Entwurf vor jedem
 * Moodle-Schreibzugriff (`moodle_create_page` /
 * `local_aicoursecreator_create_page`) freigegeben wurde.
 *
 * @param {object} draft OCR-Entwurf
 * @returns {string} `finalText`, falls der Draft "approved" ist
 * @throws {Error} wenn der Draft nicht freigegeben ist (keine OCR-Kontrolle)
 */
function assertApprovedForMoodle(draft) {
  if (!draft || draft.status !== OCR_DRAFT_STATUS.APPROVED) {
    throw new Error(
      'OCR-Kontrolle fehlt: moodle_create_page darf erst nach Freigabe ' +
      `des OCR-Entwurfs (Status "${OCR_DRAFT_STATUS.APPROVED}") aufgerufen werden.`
    );
  }
  return draft.finalText;
}

module.exports = {
  OCR_DRAFT_STATUS,
  createOcrDraft,
  approveOcrDraft,
  assertApprovedForMoodle,
};
