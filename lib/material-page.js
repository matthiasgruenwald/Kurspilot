'use strict';

/**
 * material-page.js
 *
 * Modul fuer "Material zu Moodle-Textseite mit Quellenhinweis/Lehrwerkverweis"
 * (Issue #19, CONTEXT.md "Quellenhinweis", "Lehrwerkverweis", "Fachabbildung").
 *
 * buildMaterialPage(ocrText, sources, context) verpackt den freigegebenen
 * OCR-/Quelltext (siehe lib/ocr-review.js, assertApprovedForMoodle) zusammen
 * mit einem unaufdringlichen, aber sichtbaren Quellenhinweis- bzw.
 * Lehrwerkverweis-Block in den HTML-Inhalt fuer `moodle_create_page`.
 *
 * Fachabbildungen (lib/alt-text.js) werden NICHT in den Fließtext eingebettet,
 * sondern als separates `images`-Array zurueckgegeben (gleiche Form wie
 * `activity.images` in lib/implementation-plan.js) - so wird der Bildtext
 * nicht doppelt als Text und Bild dargestellt (CONTEXT.md "Fachabbildung",
 * _Avoid_: "Textumfeld doppelt als Bild und OCR-Text").
 *
 * Reine Funktion, keine Seiteneffekte, kein Moodle-Zugriff.
 */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return value;
}

/**
 * Baut die Anzeigezeile fuer eine einzelne Quelle.
 *
 * - type "external": "Quelle: <Titel oder URL> (abgerufen am <accessedAt>)",
 *   Titel/URL als Link, sofern eine URL vorhanden ist.
 * - type "lehrwerk": "Quelle: <Werk>, S. <Seite>" (Lehrwerkverweis,
 *   CONTEXT.md "Lehrwerkverweis").
 */
function buildSourceLine(source) {
  if (!source || typeof source !== 'object') {
    throw new Error('Jede Quelle muss ein Objekt sein.');
  }

  if (source.type === 'lehrwerk') {
    requireNonEmptyString(source.title, 'source.title (Lehrwerkverweis)');
    if (source.page === undefined || source.page === null || source.page === '') {
      throw new Error('source.page (Lehrwerkverweis) darf nicht leer sein.');
    }
    return `Quelle: ${escapeHtml(source.title)}, S. ${escapeHtml(source.page)}`;
  }

  if (source.type === 'external') {
    requireNonEmptyString(source.url, 'source.url (externe Quelle)');
    const label = source.title ? escapeHtml(source.title) : escapeHtml(source.url);
    const link = `<a href="${escapeHtml(source.url)}">${label}</a>`;
    const accessedSuffix = source.accessedAt ? ` (abgerufen am ${escapeHtml(source.accessedAt)})` : '';
    return `Quelle: ${link}${accessedSuffix}`;
  }

  throw new Error(`Unbekannter Quellentyp: "${source.type}". Erlaubt sind "external" oder "lehrwerk".`);
}

/**
 * Erzeugt den Seiteninhalt (HTML) und die Bild-Embeds fuer eine
 * Moodle-Textseite (`moodle_create_page`) aus freigegebenem OCR-/Quelltext.
 *
 * @param {string} ocrText freigegebener Text (z.B. `finalText` aus
 *   `assertApprovedForMoodle`, lib/ocr-review.js)
 * @param {Array<object>} [sources] Quellen fuer den Quellenhinweis-/
 *   Lehrwerkverweis-Block; `{ type: 'external', url, title?, accessedAt? }`
 *   oder `{ type: 'lehrwerk', title, page }`
 * @param {object} [context] optionale Zusatzdaten
 * @param {Array<{imagePath: string, altText: string}>} [context.images]
 *   Fachabbildungen (lib/alt-text.js), getrennt vom Fließtext eingebettet
 * @returns {{ content: string, images: Array<{imagePath: string, altText: string}> }}
 */
function buildMaterialPage(ocrText, sources, context) {
  requireNonEmptyString(ocrText, 'ocrText');

  const sourceList = sources ?? [];
  if (!Array.isArray(sourceList)) {
    throw new Error('sources muss ein Array sein.');
  }

  const ctx = context ?? {};
  const images = ctx.images ?? [];
  if (!Array.isArray(images)) {
    throw new Error('context.images muss ein Array sein.');
  }

  let content = `<div>${ocrText}</div>`;

  if (sourceList.length > 0) {
    const lines = sourceList.map(buildSourceLine);
    const items = lines.map((line) => `<p><small>${line}</small></p>`).join('\n');
    content += `\n<div class="quellenhinweis">\n${items}\n</div>`;
  }

  return {
    content,
    images,
  };
}

module.exports = {
  buildMaterialPage,
};
