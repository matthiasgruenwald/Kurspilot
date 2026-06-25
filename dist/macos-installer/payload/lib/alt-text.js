/**
 * alt-text.js
 *
 * Modul fuer "Alt-Text"-Vorschlaege zu "Fachabbildungen" (siehe Issue #16,
 * CONTEXT.md "Alt-Text", "Fachabbildung", "KI-Qualitaetsroutine").
 *
 * "Vision" bedeutet hier: der Agent liest die Bilddatei selbst per Read-Tool
 * und formuliert einen Alt-Text-Vorschlag. Dieses Modul ruft KEINE Bild-API
 * auf, sondern validiert/normalisiert den vom Agenten erzeugten Vorschlag und
 * verpackt ihn in eine Datenform, die in die Implementierungsplan-Vorschau
 * (lib/implementation-plan.js) passt.
 *
 * Reine Validierungs-/Datenlogik, kein Moodle- oder Dateizugriff.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Konstanten
// ─────────────────────────────────────────────────────────────

/** Maximale Laenge eines Alt-Texts (Zeichen) - kurz und praezise. */
const MAX_ALT_TEXT_LENGTH = 200;

/**
 * Generische Platzhaltertexte, die als Alt-Text abgelehnt werden, weil sie
 * keine fachliche Information transportieren (siehe CONTEXT.md "Alt-Text",
 * _Avoid_: "Bild ohne Beschreibung, Alt-Text als optionale Luxusarbeit").
 */
const GENERIC_PLACEHOLDERS = Object.freeze([
  'bild',
  'abbildung',
  'foto',
  'grafik',
  'image',
  'picture',
  'photo',
  'screenshot',
]);

// ─────────────────────────────────────────────────────────────
// Validierung
// ─────────────────────────────────────────────────────────────

/**
 * Prueft, ob ein Alt-Text-Vorschlag nur aus einem generischen Platzhalter
 * besteht (z.B. "Bild", "Abbildung", optional mit Satzzeichen).
 *
 * @param {string} trimmed bereits getrimmter Alt-Text
 * @returns {boolean}
 */
function isGenericPlaceholder(trimmed) {
  const normalized = trimmed.toLowerCase().replace(/[.!?]+$/, '').trim();
  return GENERIC_PLACEHOLDERS.includes(normalized);
}

// ─────────────────────────────────────────────────────────────
// generateAltText
// ─────────────────────────────────────────────────────────────

/**
 * Validiert und normalisiert einen vom Agenten (per Vision-Lesen der
 * Bilddatei) erzeugten Alt-Text-Vorschlag und verpackt ihn als
 * "Alt-Text-Vorschlag"-Objekt fuer die Implementierungsplan-Vorschau.
 *
 * Wirft einen Fehler, wenn der Vorschlag leer ist, nur aus einem
 * generischen Platzhalter besteht oder die Maximallaenge ueberschreitet.
 *
 * @param {string} imagePath Pfad zur Fachabbildung (z.B. gezielter Bildausschnitt)
 * @param {object} context
 * @param {string} context.altText vom Agenten per Vision erzeugter Alt-Text-Vorschlag
 * @returns {{ imagePath: string, altText: string }} Alt-Text-Vorschlag
 */
function generateAltText(imagePath, context) {
  if (!imagePath || typeof imagePath !== 'string' || !imagePath.trim()) {
    throw new Error('imagePath darf nicht leer sein.');
  }

  const ctx = context || {};
  const raw = typeof ctx.altText === 'string' ? ctx.altText : '';
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('altText darf nicht leer sein.');
  }

  if (isGenericPlaceholder(trimmed)) {
    throw new Error(
      `altText "${trimmed}" ist ein generischer Platzhalter. ` +
      'Alt-Text muss fachlich praezise beschreiben, was auf der Fachabbildung zu sehen ist.',
    );
  }

  if (trimmed.length > MAX_ALT_TEXT_LENGTH) {
    throw new Error(
      `altText ist zu lang (${trimmed.length} Zeichen, erlaubt sind maximal ${MAX_ALT_TEXT_LENGTH}).`,
    );
  }

  return {
    imagePath: imagePath.trim(),
    altText: trimmed,
  };
}

module.exports = {
  MAX_ALT_TEXT_LENGTH,
  GENERIC_PLACEHOLDERS,
  generateAltText,
};
