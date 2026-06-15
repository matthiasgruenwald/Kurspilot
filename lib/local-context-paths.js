'use strict';

const path = require('node:path');

/**
 * Wurzelordner fuer lokalen, nicht versionierten Lehrkraft-Kontext.
 * Siehe ADR 0003 und CONTEXT.md ("Lokaler Kontextordner").
 */
const LOCAL_CONTEXT_ROOT = 'local-context';

/**
 * Erlaubte Zeichen fuer einzelne Pfadsegmente (Schuljahr, Klasse/Lerngruppe,
 * Unterrichtsordner): Buchstaben, Ziffern, Bindestrich, Unterstrich.
 * Verhindert Pfadtraversierung (z.B. "..") und Pfadtrenner.
 */
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Prueft ein Pflichtfeld (Schuljahr, Klasse/Lerngruppe, Unterrichtsordner)
 * auf Vorhandensein und gueltige Zeichen.
 *
 * @param {string} value Wert des Feldes
 * @param {string} label Bezeichnung fuer Fehlermeldungen
 * @returns {string} getrimmter Wert
 */
function requireValidSegment(value, label) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    throw new Error(`${label} darf nicht leer sein.`);
  }

  if (!SEGMENT_PATTERN.test(trimmed)) {
    throw new Error(
      `${label} "${value}" ist ungueltig: nur Buchstaben, Ziffern, "-" und "_" sind erlaubt.`
    );
  }

  return trimmed;
}

/**
 * Berechnet den Ordnerpfad fuer ein Lerngruppenprofil.
 *
 * Eigenstaendige Teilgruppen (z.B. "7a-e-kurs-nawi") werden genauso wie
 * Stammklassen direkt unter dem Schuljahr gefuehrt, nicht verschachtelt.
 *
 * @param {string} schuljahr z.B. "2025-26"
 * @param {string} klasseOderLerngruppe z.B. "7a" oder "7a-e-kurs-nawi"
 * @returns {string} relativer Pfad, z.B. "local-context/2025-26/7a"
 */
function getLerngruppenPath(schuljahr, klasseOderLerngruppe) {
  const jahr = requireValidSegment(schuljahr, 'Schuljahr');
  const gruppe = requireValidSegment(klasseOderLerngruppe, 'Klasse/Lerngruppe');

  return path.join(LOCAL_CONTEXT_ROOT, jahr, gruppe);
}

/**
 * Berechnet den Pfad zur CONTEXT.md eines Lerngruppenprofils.
 *
 * @param {string} schuljahr z.B. "2025-26"
 * @param {string} klasseOderLerngruppe z.B. "7a"
 * @returns {string} relativer Pfad zur CONTEXT.md
 */
function getLerngruppenContextFile(schuljahr, klasseOderLerngruppe) {
  return path.join(getLerngruppenPath(schuljahr, klasseOderLerngruppe), 'CONTEXT.md');
}

/**
 * Berechnet den Ordnerpfad fuer ein Fachprofil (Unterrichtsordner)
 * innerhalb einer Lerngruppe.
 *
 * @param {string} schuljahr z.B. "2025-26"
 * @param {string} klasseOderLerngruppe z.B. "7a" oder "7a-e-kurs-nawi"
 * @param {string} unterrichtsordner z.B. "naturwissenschaften"
 * @returns {string} relativer Pfad, z.B. "local-context/2025-26/7a/naturwissenschaften"
 */
function getFachprofilPath(schuljahr, klasseOderLerngruppe, unterrichtsordner) {
  const fach = requireValidSegment(unterrichtsordner, 'Unterrichtsordner/Fach');

  return path.join(getLerngruppenPath(schuljahr, klasseOderLerngruppe), fach);
}

/**
 * Berechnet den Pfad zur CONTEXT.md eines Fachprofils.
 *
 * @param {string} schuljahr z.B. "2025-26"
 * @param {string} klasseOderLerngruppe z.B. "7a"
 * @param {string} unterrichtsordner z.B. "naturwissenschaften"
 * @returns {string} relativer Pfad zur CONTEXT.md
 */
function getFachprofilContextFile(schuljahr, klasseOderLerngruppe, unterrichtsordner) {
  return path.join(
    getFachprofilPath(schuljahr, klasseOderLerngruppe, unterrichtsordner),
    'CONTEXT.md'
  );
}

/**
 * Berechnet den Ordnerpfad fuer ein Unterrichtsvorhaben direkt unterhalb des
 * Unterrichtsordners.
 *
 * @param {string} schuljahr z.B. "2025-26"
 * @param {string} klasseOderLerngruppe z.B. "7a"
 * @param {string} unterrichtsordner z.B. "naturwissenschaften"
 * @param {string} unterrichtsvorhaben z.B. "photosynthese"
 * @returns {string} relativer Pfad, z.B. "local-context/2025-26/7a/naturwissenschaften/photosynthese"
 */
function getUnterrichtsvorhabenPath(
  schuljahr,
  klasseOderLerngruppe,
  unterrichtsordner,
  unterrichtsvorhaben
) {
  const vorhaben = requireValidSegment(unterrichtsvorhaben, 'Unterrichtsvorhaben');

  return path.join(getFachprofilPath(schuljahr, klasseOderLerngruppe, unterrichtsordner), vorhaben);
}

module.exports = {
  LOCAL_CONTEXT_ROOT,
  getLerngruppenPath,
  getLerngruppenContextFile,
  getFachprofilPath,
  getFachprofilContextFile,
  getUnterrichtsvorhabenPath,
};
