/**
 * kurspilot-arbeitsbereich.js
 *
 * Schmales Modul fuer den Kurspilot-Arbeitsbereich (siehe CONTEXT.md,
 * "Kurspilot-Arbeitsbereich", "Arbeitsbereich-Einstellung", Issue #149).
 *
 * Buendelt 5 bestehende Module als interne Implementation hinter einer
 * kleinen, einheitlichen Funktionsmenge, statt dass Skills/Aufrufer sie
 * einzeln importieren muessen:
 *   - lib/local-context-paths.js (Pfadberechnung, Arbeitsbereich-Aufloesung)
 *   - lib/kurspilot-context-resolver.js (Kontextdokumente von spezifisch nach
 *     allgemein)
 *   - lib/kurspilot-workspace-config.js (gespeicherte Arbeitsbereich-Einstellung)
 *   - lib/journal.js (Journal-Ablage, Umsetzungsbericht-Formatierung)
 *   - lib/unterrichtsvorhaben-workspace.js (plan.md/status.md-Ablage)
 *
 * Alle drei oeffentlichen Funktionen liefern dieselbe Rueckgabeform:
 * `{ ok: boolean, ...Nutzdaten }` bei Erfolg, `{ ok: false, message }` bei
 * bekannten Fehlern (z.B. fehlende Arbeitsbereich-Einstellung). Das ersetzt
 * die drei bisher unterschiedlichen Formen (roher String, Dokumentenliste
 * mit Policy-Feldern, Workspace-Objekt mit status/mode).
 *
 * Keine Facade-Klasse: einfache Funktionen reichen (ponytail).
 */

'use strict';

const path = require('node:path');

const {
  resolveKurspilotContextRoot,
} = require('./local-context-paths');
const {
  readKurspilotContextDocuments,
} = require('./kurspilot-context-resolver');
const {
  setupUnterrichtsvorhabenWorkspace,
} = require('./unterrichtsvorhaben-workspace');
const {
  journalPath,
  appendJournalEntry,
  formatUmsetzungsbericht,
} = require('./journal');

/**
 * Laedt den konfigurierten Kurspilot-Arbeitsbereich (lokaler Grundordner
 * (lokaler Grundordner, siehe CONTEXT.md "Arbeitsbereich-Ort").
 *
 * @param {object} [options]
 * @param {string} [options.contextRoot] expliziter Arbeitsbereich (z.B. fuer Tests)
 * @param {Function} [options.readWorkspaceSetting] Override fuer die gespeicherte Einstellung
 * @param {object} [options.workspaceConfigOptions] an readKurspilotWorkspaceSetting durchgereicht
 * @returns {{ok: true, contextRoot: string}|{ok: false, message: string}}
 */
function ladeArbeitsbereich(options = {}) {
  try {
    const contextRoot = resolveKurspilotContextRoot(options);
    return { ok: true, contextRoot };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

/**
 * Liest die Kontextdokumente (Unterrichtsvorhaben, Unterrichtsordner,
 * Lerngruppenprofil) fuer eine Klasse/Lerngruppe, von spezifisch nach
 * allgemein sortiert (siehe CONTEXT.md, Reihenfolge "spezifischer Kontext hat
 * Vorrang").
 *
 * @param {object} fields siehe kurspilot-context-resolver.js#buildContextCandidates
 * @param {string} fields.schuljahr
 * @param {string} fields.klasseOderLerngruppe
 * @param {string} fields.unterrichtsordner
 * @param {string} [fields.unterrichtsvorhaben]
 * @param {object} [options] siehe ladeArbeitsbereich
 * @returns {{ok: true, contextRoot: string, resolutionPolicy: string, documents: object[], availableDocuments: object[], missingDocuments: object[]}|{ok: false, message: string}}
 */
function leseKontextdokumente(fields, options = {}) {
  try {
    const resolved = readKurspilotContextDocuments(fields, options);
    return {
      ok: true,
      contextRoot: resolved.contextRoot,
      requested: resolved.requested,
      resolutionPolicy: resolved.resolutionPolicy,
      documents: resolved.documents,
      // availableDocuments ist Alias auf documents: readKurspilotContextDocuments()
      // liefert ohnehin nur bereits vorhandene (inhaltsgeladene) Dokumente.
      availableDocuments: resolved.documents,
      missingDocuments: resolved.missingDocuments,
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

/**
 * Legt den Arbeitsbereich (plan.md/status.md) fuer ein Unterrichtsvorhaben an
 * oder liefert den vorhandenen Stand. Duenner Wrapper um
 * setupUnterrichtsvorhabenWorkspace mit vereinheitlichter Rueckgabeform.
 *
 * @param {object} fields siehe unterrichtsvorhaben-workspace.js#setupUnterrichtsvorhabenWorkspace
 * @param {object} [options]
 * @returns {{ok: true, workspaceRoot: string, planFile: string, statusFile: string, status: string, [key: string]: *}|{ok: false, message: string}}
 */
function ladeUnterrichtsvorhabenWorkspace(fields, options = {}) {
  try {
    const result = setupUnterrichtsvorhabenWorkspace(fields, options);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

/**
 * Formatiert das Ergebnis eines umgesetzten Plans (Form von applyPlan() aus
 * lib/implementation-plan.js) als Umsetzungsbericht und haengt ihn append-only
 * an das passende Journal an (Unterrichtsordner-Journal, siehe CONTEXT.md
 * "Journal", "Umsetzungsbericht").
 *
 * @param {object} input
 * @param {string} input.schuljahr
 * @param {string} input.klasse
 * @param {string} input.unterrichtsordner
 * @param {object} input.planResult siehe journal.js#formatUmsetzungsbericht
 * @param {string|Date} [input.date] Datum des Journal-Eintrags (default: heute UTC)
 * @param {object} [options] siehe ladeArbeitsbereich
 * @returns {{ok: true, journalPath: string, entryMarkdown: string, contextRoot: string}|{ok: false, message: string}}
 */
function schreibeUmsetzungsbericht(input, options = {}) {
  try {
    const { schuljahr, klasse, unterrichtsordner, planResult, date } = input || {};
    const contextRoot = resolveKurspilotContextRoot(options);
    const entryDate = date || new Date();

    const entryMarkdown = formatUmsetzungsbericht(planResult);
    const relJournalPath = journalPath({ schuljahr, klasse, unterrichtsordner }, 'unterrichtsordner', entryDate);
    const absJournalPath = path.join(contextRoot, relJournalPath);

    appendJournalEntry(absJournalPath, entryMarkdown, { contextRoot });

    return {
      ok: true,
      journalPath: absJournalPath,
      entryMarkdown,
      contextRoot,
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

module.exports = {
  ladeArbeitsbereich,
  leseKontextdokumente,
  ladeUnterrichtsvorhabenWorkspace,
  schreibeUmsetzungsbericht,
};
