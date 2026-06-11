'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getLerngruppenContextFile,
  getFachprofilContextFile,
} = require('./local-context-paths');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'local-context');
const LERNGRUPPENPROFIL_TEMPLATE = path.join(TEMPLATE_DIR, 'lerngruppenprofil.CONTEXT.md');
const FACHPROFIL_TEMPLATE = path.join(TEMPLATE_DIR, 'fachprofil.CONTEXT.md');

/** Platzhaltertext fuer noch nicht erfasste optionale Felder. */
const NOT_YET_PROVIDED = '_(noch nicht erfasst)_';

/**
 * Ersetzt {{TOKEN}}-Platzhalter in einer Vorlage durch Werte aus `values`.
 * Fehlende Werte werden durch NOT_YET_PROVIDED ersetzt.
 *
 * @param {string} template Vorlagentext mit {{TOKEN}}-Platzhaltern
 * @param {Record<string, string>} values Token -> Wert
 * @returns {string} gerenderter Text
 */
function renderTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, token) => {
    const value = values[token];
    return value && value.trim() ? value.trim() : NOT_YET_PROVIDED;
  });
}

/**
 * Rendert ein Lerngruppenprofil aus der Vorlage.
 *
 * @param {object} fields
 * @param {string} fields.schuljahr Pflicht: Schuljahr, z.B. "2025-26"
 * @param {string} fields.klasseOderLerngruppe Pflicht: Klasse oder Lerngruppe, z.B. "7a"
 * @param {string} [fields.verwandterKontext] Optional: leichte Referenz auf verwandten Kontext
 * @param {string} [fields.beobachtungen] Optional: faecheruebergreifende Beobachtungen
 * @param {object} [fields.optionalContext] Optionaler Planungskontext
 * @param {string} [fields.optionalContext.leistungsstand]
 * @param {string} [fields.optionalContext.lernbedarfe]
 * @param {string} [fields.optionalContext.gruppendynamik]
 * @param {string} [fields.optionalContext.sprachstand]
 * @param {string} [fields.optionalContext.technischeRahmenbedingungen]
 * @returns {string} gerenderte CONTEXT.md
 */
function renderLerngruppenprofil(fields) {
  const template = fs.readFileSync(LERNGRUPPENPROFIL_TEMPLATE, 'utf8');
  const optional = fields.optionalContext || {};

  return renderTemplate(template, {
    SCHULJAHR: fields.schuljahr,
    KLASSE_ODER_LERNGRUPPE: fields.klasseOderLerngruppe,
    VERWANDTER_KONTEXT: fields.verwandterKontext,
    BEOBACHTUNGEN: fields.beobachtungen,
    LEISTUNGSSTAND: optional.leistungsstand,
    LERNBEDARFE: optional.lernbedarfe,
    GRUPPENDYNAMIK: optional.gruppendynamik,
    SPRACHSTAND: optional.sprachstand,
    TECHNISCHE_RAHMENBEDINGUNGEN: optional.technischeRahmenbedingungen,
  });
}

/**
 * Rendert ein Fachprofil aus der Vorlage.
 *
 * @param {object} fields
 * @param {string} fields.schuljahr Pflicht: Schuljahr, z.B. "2025-26"
 * @param {string} fields.klasseOderLerngruppe Pflicht: Klasse oder Lerngruppe, z.B. "7a"
 * @param {string} fields.unterrichtsordner Pflicht: Fach/Unterrichtsordner, z.B. "naturwissenschaften"
 * @param {string} [fields.verwandterKontext] Optional: leichte Referenz auf verwandten Kontext
 * @param {string} [fields.besonderheiten] Optional: fachliche Besonderheiten
 * @param {object} [fields.optionalContext] Optionaler Planungskontext
 * @param {string} [fields.optionalContext.kompetenzstand]
 * @param {string} [fields.optionalContext.arbeitsweisen]
 * @param {string} [fields.optionalContext.laufendeThemen]
 * @param {string} [fields.optionalContext.teststand]
 * @returns {string} gerenderte CONTEXT.md
 */
function renderFachprofil(fields) {
  const template = fs.readFileSync(FACHPROFIL_TEMPLATE, 'utf8');
  const optional = fields.optionalContext || {};

  return renderTemplate(template, {
    SCHULJAHR: fields.schuljahr,
    KLASSE_ODER_LERNGRUPPE: fields.klasseOderLerngruppe,
    UNTERRICHTSORDNER: fields.unterrichtsordner,
    VERWANDTER_KONTEXT: fields.verwandterKontext,
    BESONDERHEITEN: fields.besonderheiten,
    KOMPETENZSTAND: optional.kompetenzstand,
    ARBEITSWEISEN: optional.arbeitsweisen,
    LAUFENDE_THEMEN: optional.laufendeThemen,
    TESTSTAND: optional.teststand,
  });
}

/**
 * Legt ein Lerngruppenprofil unter `<baseDir>/local-context/<schuljahr>/<klasse>/CONTEXT.md` an.
 * Legt fehlende Ordner an. Ueberschreibt eine bestehende Datei nicht.
 *
 * @param {string} baseDir Basisverzeichnis (z.B. Repo-Root oder Test-Tempdir)
 * @param {object} fields siehe renderLerngruppenprofil
 * @returns {string} absoluter Pfad zur angelegten CONTEXT.md
 */
function createLerngruppenprofil(baseDir, fields) {
  const relativeFile = getLerngruppenContextFile(fields.schuljahr, fields.klasseOderLerngruppe);
  const filePath = path.join(baseDir, relativeFile);

  if (fs.existsSync(filePath)) {
    throw new Error(`CONTEXT.md existiert bereits: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderLerngruppenprofil(fields), 'utf8');

  return filePath;
}

/**
 * Legt ein Fachprofil unter
 * `<baseDir>/local-context/<schuljahr>/<klasse>/<unterrichtsordner>/CONTEXT.md` an.
 * Legt fehlende Ordner an. Ueberschreibt eine bestehende Datei nicht.
 *
 * @param {string} baseDir Basisverzeichnis (z.B. Repo-Root oder Test-Tempdir)
 * @param {object} fields siehe renderFachprofil
 * @returns {string} absoluter Pfad zur angelegten CONTEXT.md
 */
function createFachprofil(baseDir, fields) {
  const relativeFile = getFachprofilContextFile(
    fields.schuljahr,
    fields.klasseOderLerngruppe,
    fields.unterrichtsordner
  );
  const filePath = path.join(baseDir, relativeFile);

  if (fs.existsSync(filePath)) {
    throw new Error(`CONTEXT.md existiert bereits: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderFachprofil(fields), 'utf8');

  return filePath;
}

module.exports = {
  NOT_YET_PROVIDED,
  renderLerngruppenprofil,
  renderFachprofil,
  createLerngruppenprofil,
  createFachprofil,
};
