'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  OCR_DRAFT_STATUS,
  createOcrDraft,
  approveOcrDraft,
  assertApprovedForMoodle,
} = require('../lib/ocr-review');

// ─────────────────────────────────────────────────────────────
// Fixture: synthetischer "Vision-Read" eines Scans
// ─────────────────────────────────────────────────────────────
//
// Die echte Bildanalyse (Agent liest die Bilddatei via Read-Tool) kann in
// einem isolierten Test nicht ausgefuehrt werden. Stattdessen wird das
// Ergebnis dieses Schritts simuliert: ein synthetischer, nicht
// urheberrechtlich geschuetzter Text, wie er aus einem Tafelbild-Scan
// entstehen koennte (inkl. typischem OCR-Fehler "Amplitvde").
const SOURCE_SCAN_PATH = 'materials/wellen/original/tafelbild_amplitude.jpg';
const VISION_EXTRACTED_TEXT = 'Die Amplitvde ist die maximale Auslenkung einer Welle.';
const CORRECTED_TEXT = 'Die Amplitude ist die maximale Auslenkung einer Welle.';

// ─────────────────────────────────────────────────────────────
// createOcrDraft
// ─────────────────────────────────────────────────────────────

test('createOcrDraft: liefert Draft mit Status pending_review und unveraendertem sourcePath', () => {
  const draft = createOcrDraft({
    sourcePath: SOURCE_SCAN_PATH,
    extractedText: VISION_EXTRACTED_TEXT,
  });

  assert.strictEqual(draft.status, OCR_DRAFT_STATUS.PENDING_REVIEW);
  assert.strictEqual(draft.sourcePath, SOURCE_SCAN_PATH);
  assert.strictEqual(draft.extractedText, VISION_EXTRACTED_TEXT);
  assert.strictEqual(draft.finalText, undefined);
  assert.strictEqual(draft.approvedBy, undefined);
});

test('createOcrDraft: sourcePath und extractedText sind Pflichtfelder', () => {
  assert.throws(() => createOcrDraft({ extractedText: VISION_EXTRACTED_TEXT }), /sourcePath/);
  assert.throws(() => createOcrDraft({ sourcePath: SOURCE_SCAN_PATH }), /extractedText/);
});

// ─────────────────────────────────────────────────────────────
// approveOcrDraft
// ─────────────────────────────────────────────────────────────

test('approveOcrDraft: setzt Status approved und finalText auf korrigierten Text', () => {
  const draft = createOcrDraft({
    sourcePath: SOURCE_SCAN_PATH,
    extractedText: VISION_EXTRACTED_TEXT,
  });

  const approved = approveOcrDraft(draft, {
    correctedText: CORRECTED_TEXT,
    approvedBy: 'Lehrkraft',
  });

  assert.strictEqual(approved.status, OCR_DRAFT_STATUS.APPROVED);
  assert.strictEqual(approved.finalText, CORRECTED_TEXT);
  assert.strictEqual(approved.approvedBy, 'Lehrkraft');
  // Original-Entwurf bleibt unveraendert (Immutability)
  assert.strictEqual(draft.status, OCR_DRAFT_STATUS.PENDING_REVIEW);
});

test('approveOcrDraft: ohne correctedText wird extractedText unveraendert als finalText uebernommen', () => {
  const draft = createOcrDraft({
    sourcePath: SOURCE_SCAN_PATH,
    extractedText: CORRECTED_TEXT,
  });

  const approved = approveOcrDraft(draft, { approvedBy: 'Lehrkraft' });

  assert.strictEqual(approved.finalText, CORRECTED_TEXT);
});

test('approveOcrDraft: approvedBy ist Pflichtfeld (Kontroll-Gate verlangt Lehrkraft-OK)', () => {
  const draft = createOcrDraft({
    sourcePath: SOURCE_SCAN_PATH,
    extractedText: VISION_EXTRACTED_TEXT,
  });

  assert.throws(
    () => approveOcrDraft(draft, { correctedText: CORRECTED_TEXT }),
    /approvedBy/
  );
});

test('approveOcrDraft: bereits freigegebener Draft kann nicht erneut freigegeben werden', () => {
  const draft = createOcrDraft({
    sourcePath: SOURCE_SCAN_PATH,
    extractedText: VISION_EXTRACTED_TEXT,
  });
  const approved = approveOcrDraft(draft, {
    correctedText: CORRECTED_TEXT,
    approvedBy: 'Lehrkraft',
  });

  assert.throws(
    () => approveOcrDraft(approved, { correctedText: CORRECTED_TEXT, approvedBy: 'Lehrkraft' }),
    /pending_review/
  );
});

// ─────────────────────────────────────────────────────────────
// assertApprovedForMoodle (Kontroll-Gate)
// ─────────────────────────────────────────────────────────────

test('assertApprovedForMoodle: wirft bei pending_review-Draft (kein moodle_create_page ohne OK)', () => {
  const draft = createOcrDraft({
    sourcePath: SOURCE_SCAN_PATH,
    extractedText: VISION_EXTRACTED_TEXT,
  });

  assert.throws(() => assertApprovedForMoodle(draft), /OCR-Kontrolle/);
});

test('assertApprovedForMoodle: gibt finalText zurueck, wenn Draft approved ist', () => {
  const draft = createOcrDraft({
    sourcePath: SOURCE_SCAN_PATH,
    extractedText: VISION_EXTRACTED_TEXT,
  });
  const approved = approveOcrDraft(draft, {
    correctedText: CORRECTED_TEXT,
    approvedBy: 'Lehrkraft',
  });

  assert.strictEqual(assertApprovedForMoodle(approved), CORRECTED_TEXT);
});

// ─────────────────────────────────────────────────────────────
// End-to-End-Workflow (synthetische Fixture)
// ─────────────────────────────────────────────────────────────

test('Workflow: Scan -> Vision-Draft -> Kontrolle -> Freigabe -> Moodle-Text', () => {
  // 1) Material wurde bereits gespeichert (#12), Originalscan bleibt erhalten
  //    unter materials/<thema>/original/...
  // 2) Agent liest die Bilddatei via Vision (hier simuliert) und erzeugt Draft
  const draft = createOcrDraft({
    sourcePath: SOURCE_SCAN_PATH,
    extractedText: VISION_EXTRACTED_TEXT,
  });
  assert.strictEqual(draft.status, OCR_DRAFT_STATUS.PENDING_REVIEW);

  // Kontroll-Gate: vor Freigabe darf nicht nach Moodle geschrieben werden
  assert.throws(() => assertApprovedForMoodle(draft), /OCR-Kontrolle/);

  // 3) Lehrkraft korrigiert OCR-Fehler ("Amplitvde" -> "Amplitude") und gibt frei
  const approved = approveOcrDraft(draft, {
    correctedText: CORRECTED_TEXT,
    approvedBy: 'Lehrkraft',
  });

  // 4) Kontroll-Gate liefert nun den finalen Text fuer moodle_create_page
  const moodleText = assertApprovedForMoodle(approved);
  assert.strictEqual(moodleText, CORRECTED_TEXT);

  // Originalscan-Pfad bleibt im Draft nachvollziehbar erhalten
  assert.strictEqual(approved.sourcePath, SOURCE_SCAN_PATH);
});
