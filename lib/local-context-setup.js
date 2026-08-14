'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getLerngruppenContextFile,
  getFachprofilContextFile,
  getUnterrichtsvorhabenContextFile,
  resolveLocalContextPath,
} = require('./local-context-paths');
const {
  buildFrontmatterBlock,
  todayIso,
  NOT_YET_PROVIDED,
} = require('./kurspilot-frontmatter');
const { updateIndexEntry } = require('./kurspilot-index');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'local-context');
const LERNGRUPPENPROFIL_TEMPLATE = path.join(TEMPLATE_DIR, 'lerngruppenprofil.CONTEXT.md');
const FACHPROFIL_TEMPLATE = path.join(TEMPLATE_DIR, 'fachprofil.CONTEXT.md');
const VORHABEN_CONTEXT_TEMPLATE = path.join(TEMPLATE_DIR, 'vorhaben.CONTEXT.md');

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
 * Baut den Frontmatter-Block fuer eine neu angelegte Kontextdatei
 * (Lerngruppe/Fach/Vorhaben). Buendelt die drei render*-Funktionen
 * unten, die sich nur in type/title/about/kurspilot unterscheiden.
 * `fields.tags`/`fields.gradeLevel`/`fields.status` werden uebernommen,
 * wenn die Lehrkraft sie beim Anlegen mitgibt (Spec 0011, User Story 4);
 * `fields.frontmatter` erlaubt zusaetzlich einen vollstaendigen Override
 * einzelner Felder.
 *
 * @param {{type: string, title: string, about: string, kurspilot: object, forcedPersonenbezug?: boolean}} defaults
 * @param {object} fields Aufrufer-Felder (siehe render*-Funktionen)
 * @returns {string} "---"-begrenzter Frontmatter-Block
 */
function buildContextFrontmatter(defaults, fields) {
  const today = todayIso();
  const merged = {
    type: defaults.type,
    title: defaults.title,
    tags: fields.tags || [],
    status: fields.status || 'aktiv',
    created: today,
    updated: today,
    about: defaults.about,
    gradeLevel: fields.gradeLevel || NOT_YET_PROVIDED,
    kurspilot: defaults.kurspilot,
    ...(fields.frontmatter || {}),
  };

  if (defaults.forcedPersonenbezug !== undefined) {
    // Sicherheitsnetz: ein Override darf den Personenbezug-Grundsatz des
    // Dateityps nicht kippen (hier: Lerngruppenprofile duerfen laut
    // docs/adr/0003 echte Schuelernamen enthalten und sind daher immer
    // personenbezogen, unabhaengig von fields.frontmatter).
    merged.kurspilot = { ...merged.kurspilot, personenbezug: defaults.forcedPersonenbezug };
  }

  return buildFrontmatterBlock(merged);
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

  const body = renderTemplate(template, {
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

  const frontmatter = buildContextFrontmatter(
    {
      type: 'lerngruppe',
      title: fields.klasseOderLerngruppe,
      about: fields.klasseOderLerngruppe,
      // Lerngruppenprofile duerfen echte Schuelernamen enthalten (siehe
      // docs/adr/0003) und bleiben deshalb schulintern, nicht offen teilbar.
      kurspilot: { personenbezug: true, weitergabe: 'schulintern' },
      forcedPersonenbezug: true,
    },
    fields
  );

  return `${frontmatter}\n\n${body}`;
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

  const body = renderTemplate(template, {
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

  const frontmatter = buildContextFrontmatter(
    {
      type: 'fach',
      title: `${fields.unterrichtsordner} – ${fields.klasseOderLerngruppe}`,
      about: fields.unterrichtsordner,
      kurspilot: { personenbezug: false, weitergabe: 'schulintern' },
    },
    fields
  );

  return `${frontmatter}\n\n${body}`;
}

/**
 * Rendert die CONTEXT.md eines Unterrichtsvorhabens (Auffindbarkeit,
 * Frontmatter). Der eigentliche Plan-/Statusinhalt bleibt in plan.md/
 * status.md (siehe unterrichtsvorhaben-workspace.js) und bekommt bewusst
 * kein Frontmatter, um deren bestehendes, geprueftes Format nicht zu
 * vermischen.
 *
 * @param {object} fields
 * @param {string} fields.schuljahr
 * @param {string} fields.klasseOderLerngruppe
 * @param {string} fields.unterrichtsordner
 * @param {string} fields.unterrichtsvorhaben
 * @param {string} [fields.kurzbeschreibung]
 * @param {string} [fields.verwandterKontext]
 * @returns {string} gerenderte CONTEXT.md
 */
function renderVorhabenContext(fields) {
  const template = fs.readFileSync(VORHABEN_CONTEXT_TEMPLATE, 'utf8');

  const body = renderTemplate(template, {
    SCHULJAHR: fields.schuljahr,
    KLASSE_ODER_LERNGRUPPE: fields.klasseOderLerngruppe,
    UNTERRICHTSORDNER: fields.unterrichtsordner,
    UNTERRICHTSVORHABEN: fields.unterrichtsvorhaben,
    KURZBESCHREIBUNG: fields.kurzbeschreibung,
    VERWANDTER_KONTEXT: fields.verwandterKontext,
  });

  const frontmatter = buildContextFrontmatter(
    {
      type: 'vorhaben',
      title: fields.unterrichtsvorhaben,
      about: fields.unterrichtsordner,
      kurspilot: { personenbezug: false, weitergabe: 'schulintern' },
    },
    fields
  );

  return `${frontmatter}\n\n${body}`;
}

/**
 * Beschreibt den minimalen Kurspilot-Setup-Flow fuer die Lehrkraft.
 *
 * @returns {object} Prompt- und Abschlussweichenbeschreibung
 */
function getKurspilotSetupFlow() {
  return {
    requiredPrompts: [
      { key: 'schuljahr', label: 'Schuljahr', required: true },
      { key: 'klasseOderLerngruppe', label: 'Klasse oder Lerngruppe', required: true },
      { key: 'unterrichtsordner', label: 'Unterrichtsordner', required: true },
    ],
    optionalPlanningPrompts: [
      { key: 'leistungsstand', label: 'Leistungsstand', answerMode: 'frei oder skip' },
      { key: 'sprachstand', label: 'Sprachstand', answerMode: 'frei oder skip' },
      { key: 'lernbedarfe', label: 'Besondere Lernbedarfe', answerMode: 'frei oder skip' },
      { key: 'gruppendynamik', label: 'Gruppendynamik', answerMode: 'frei oder skip' },
      { key: 'technischeRahmenbedingungen', label: 'Technische Bedingungen', answerMode: 'frei oder skip' },
    ],
    setupAbschlussweiche: [
      'Plan jetzt',
      'Freigegebenen Plan umsetzen',
      'Spaeter weiter',
    ],
  };
}

function resolveWorkspaceInvocation(baseDirOrFields, fieldsOrOptions, maybeOptions) {
  if (typeof baseDirOrFields === 'string') {
    return {
      contextRoot: baseDirOrFields,
      fields: fieldsOrOptions || {},
      options: maybeOptions || {},
    };
  }

  return {
    contextRoot: (fieldsOrOptions && fieldsOrOptions.contextRoot) || null,
    fields: baseDirOrFields || {},
    options: fieldsOrOptions || {},
  };
}

/**
 * Legt ein Lerngruppenprofil unter `<baseDir>/<schuljahr>/<klasse>/CONTEXT.md` an.
 * Legt fehlende Ordner an. Ueberschreibt eine bestehende Datei nicht.
 *
 * @param {string|object} baseDirOrFields expliziter Arbeitsbereich oder direkt die Felder
 * @param {object} fields siehe renderLerngruppenprofil
 * @returns {string} absoluter Pfad zur angelegten CONTEXT.md
 */
function createLerngruppenprofil(baseDirOrFields, fieldsOrOptions, maybeOptions) {
  const invocation = resolveWorkspaceInvocation(baseDirOrFields, fieldsOrOptions, maybeOptions);
  const relativeFile = getLerngruppenContextFile(
    invocation.fields.schuljahr,
    invocation.fields.klasseOderLerngruppe
  );
  const filePath = resolveLocalContextPath(relativeFile, {
    contextRoot: invocation.contextRoot,
    readWorkspaceSetting: invocation.options.readWorkspaceSetting,
    workspaceConfigOptions: invocation.options.workspaceConfigOptions,
  }).absolutePath;

  if (fs.existsSync(filePath)) {
    throw new Error(`CONTEXT.md existiert bereits: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderLerngruppenprofil(invocation.fields), 'utf8');

  return filePath;
}

/**
 * Legt ein Fachprofil unter
 * `<baseDir>/<schuljahr>/<klasse>/<unterrichtsordner>/CONTEXT.md` an.
 * Legt fehlende Ordner an. Ueberschreibt eine bestehende Datei nicht.
 *
 * @param {string|object} baseDirOrFields expliziter Arbeitsbereich oder direkt die Felder
 * @param {object} fields siehe renderFachprofil
 * @returns {string} absoluter Pfad zur angelegten CONTEXT.md
 */
function createFachprofil(baseDirOrFields, fieldsOrOptions, maybeOptions) {
  const invocation = resolveWorkspaceInvocation(baseDirOrFields, fieldsOrOptions, maybeOptions);
  const relativeFile = getFachprofilContextFile(
    invocation.fields.schuljahr,
    invocation.fields.klasseOderLerngruppe,
    invocation.fields.unterrichtsordner
  );
  const filePath = resolveLocalContextPath(relativeFile, {
    contextRoot: invocation.contextRoot,
    readWorkspaceSetting: invocation.options.readWorkspaceSetting,
    workspaceConfigOptions: invocation.options.workspaceConfigOptions,
  }).absolutePath;

  if (fs.existsSync(filePath)) {
    throw new Error(`CONTEXT.md existiert bereits: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderFachprofil(invocation.fields), 'utf8');

  return filePath;
}

/**
 * Legt die CONTEXT.md eines Unterrichtsvorhabens unter
 * `<baseDir>/<schuljahr>/<klasse>/<unterrichtsordner>/<unterrichtsvorhaben>/CONTEXT.md`
 * an. Legt fehlende Ordner an. Ueberschreibt eine bestehende Datei nicht.
 *
 * @param {string|object} baseDirOrFields expliziter Arbeitsbereich oder direkt die Felder
 * @param {object} fields siehe renderVorhabenContext
 * @returns {string} absoluter Pfad zur angelegten CONTEXT.md
 */
function createVorhabenContext(baseDirOrFields, fieldsOrOptions, maybeOptions) {
  const invocation = resolveWorkspaceInvocation(baseDirOrFields, fieldsOrOptions, maybeOptions);
  const relativeFile = getUnterrichtsvorhabenContextFile(
    invocation.fields.schuljahr,
    invocation.fields.klasseOderLerngruppe,
    invocation.fields.unterrichtsordner,
    invocation.fields.unterrichtsvorhaben
  );
  const resolution = resolveLocalContextPath(relativeFile, {
    contextRoot: invocation.contextRoot,
    readWorkspaceSetting: invocation.options.readWorkspaceSetting,
    workspaceConfigOptions: invocation.options.workspaceConfigOptions,
  });
  const filePath = resolution.absolutePath;

  if (fs.existsSync(filePath)) {
    throw new Error(`CONTEXT.md existiert bereits: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, renderVorhabenContext(invocation.fields), 'utf8');

  // best-effort (siehe kurspilot-index.js): ein unlesbarer/konfligierender
  // Index darf das Anlegen des Vorhabens selbst nicht verhindern, die
  // Warnung muss aber sichtbar werden statt zu verschwinden.
  const indexResult = updateIndexEntry(filePath, { contextRoot: resolution.contextRoot });
  if (!indexResult.ok) {
    console.warn(`[kurspilot] ${indexResult.message}`);
  }

  return filePath;
}

/**
 * Richtet den Kurspilot-Arbeitsbereich ein oder bestaetigt den vorhandenen Stand.
 *
 * Erstellt fehlende Lerngruppen- und Fachprofile unter
 * `<schuljahr>/<klasse>/<unterrichtsordner>/`.
 * Vorhandene Dateien bleiben unangetastet.
 *
 * @param {string|object} baseDirOrFields expliziter Arbeitsbereich oder direkt die Felder
 * @param {object} fields siehe renderFachprofil
 * @returns {object} Setup-Ergebnis mit Pfaden, Status und Lehrertext
 */
function setupKurspilotWorkspace(baseDirOrFields, fieldsOrOptions, maybeOptions) {
  const invocation = resolveWorkspaceInvocation(baseDirOrFields, fieldsOrOptions, maybeOptions);
  const lerngruppenRelativeFile = getLerngruppenContextFile(
    invocation.fields.schuljahr,
    invocation.fields.klasseOderLerngruppe
  );
  const fachprofilRelativeFile = getFachprofilContextFile(
    invocation.fields.schuljahr,
    invocation.fields.klasseOderLerngruppe,
    invocation.fields.unterrichtsordner
  );
  const lerngruppenResolution = resolveLocalContextPath(lerngruppenRelativeFile, {
    contextRoot: invocation.contextRoot,
    readWorkspaceSetting: invocation.options.readWorkspaceSetting,
    workspaceConfigOptions: invocation.options.workspaceConfigOptions,
  });
  const fachprofilResolution = resolveLocalContextPath(fachprofilRelativeFile, {
    contextRoot: invocation.contextRoot,
    readWorkspaceSetting: invocation.options.readWorkspaceSetting,
    workspaceConfigOptions: invocation.options.workspaceConfigOptions,
  });
  const lerngruppenFilePath = lerngruppenResolution.absolutePath;
  const fachprofilFilePath = fachprofilResolution.absolutePath;
  const createdFiles = [];
  const existingFiles = [];

  if (fs.existsSync(lerngruppenFilePath)) {
    existingFiles.push(lerngruppenFilePath);
  } else {
    createLerngruppenprofil(invocation.fields, {
      contextRoot: lerngruppenResolution.contextRoot,
    });
    createdFiles.push(lerngruppenFilePath);
  }

  if (fs.existsSync(fachprofilFilePath)) {
    existingFiles.push(fachprofilFilePath);
  } else {
    createFachprofil(invocation.fields, {
      contextRoot: fachprofilResolution.contextRoot,
    });
    createdFiles.push(fachprofilFilePath);
  }

  const flow = getKurspilotSetupFlow();
  const teacherFacingText = [
    'Kurspilot richtet deinen Arbeitsbereich ein:',
    `- Kurspilot-Arbeitsbereich: ${lerngruppenResolution.contextRoot}`,
    `- Schuljahr: ${invocation.fields.schuljahr}`,
    `- Klasse/Lerngruppe: ${invocation.fields.klasseOderLerngruppe}`,
    `- Unterrichtsordner: ${invocation.fields.unterrichtsordner}`,
    `- Lerngruppenprofil: ${lerngruppenFilePath}`,
    `- Fachprofil: ${fachprofilFilePath}`,
    'Optionaler Planungskontext kannst du jetzt oder spaeter ergaenzen.',
    `Setup-Abschlussweiche: ${flow.setupAbschlussweiche.join(' | ')}`,
  ].join('\n');

  return {
    workspaceRoot: path.dirname(fachprofilFilePath),
    lerngruppenContextFile: lerngruppenFilePath,
    fachprofilContextFile: fachprofilFilePath,
    status: createdFiles.length > 0 ? 'created' : 'confirmed',
    createdFiles,
    existingFiles,
    teacherFacingText,
    flow,
  };
}

module.exports = {
  NOT_YET_PROVIDED,
  renderLerngruppenprofil,
  renderFachprofil,
  renderVorhabenContext,
  createLerngruppenprofil,
  createFachprofil,
  createVorhabenContext,
  getKurspilotSetupFlow,
  setupKurspilotWorkspace,
};
