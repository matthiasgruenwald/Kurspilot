'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readKurspilotWorkspaceSetting } = require('./kurspilot-workspace-config');

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

function requireNonEmptyText(value, label) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return trimmed;
}

function resolveKurspilotContextRoot(options = {}) {
  const explicitRoot = typeof options.contextRoot === 'string' ? options.contextRoot.trim() : '';
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  const readWorkspaceSetting = options.readWorkspaceSetting || readKurspilotWorkspaceSetting;
  const setting = readWorkspaceSetting(options.workspaceConfigOptions || {});

  if (!setting || !setting.ok) {
    throw new Error(
      (setting && setting.message)
        || 'Arbeitsbereich-Einstellung fehlt. Bitte das Kurspilot-Konfigurationsprogramm ausfuehren.'
    );
  }

  return path.resolve(requireNonEmptyText(setting.contextRoot, 'contextRoot'));
}

function resolveLocalContextPath(relativePath, options = {}) {
  const normalizedRelativePath = requireNonEmptyText(relativePath, 'relativePath');
  const contextRoot = resolveKurspilotContextRoot(options);
  const absolutePath = path.join(contextRoot, normalizedRelativePath);
  assertInsideLocalContext(absolutePath, contextRoot);

  return {
    contextRoot,
    relativePath: normalizedRelativePath,
    absolutePath,
  };
}

function assertInsideLocalContext(absolutePath, contextRoot) {
  const localContextRoot = path.join(path.resolve(contextRoot), LOCAL_CONTEXT_ROOT);
  const resolvedPath = path.resolve(absolutePath);
  const relative = path.relative(localContextRoot, resolvedPath);

  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }

  throw new Error(
    'Kurspilot darf lokale Arbeitsdateien nur unter dem konfigurierten Kurspilot-Arbeitsbereich local-context/ schreiben.'
  );
}

function findNearestWegweiser(startDir) {
  let currentDir = path.resolve(requireNonEmptyText(startDir, 'materialFolder'));

  while (true) {
    const candidate = path.join(currentDir, 'KURSPILOT.md');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function parseWegweiserStartkontext(content) {
  const match = content.match(/^Startkontext:\s*(.+?)\s*$/im);
  if (!match) {
    throw new Error(
      'KURSPILOT.md enthaelt keinen gueltigen Startkontext. Bitte Kurspilot einrichten oder den Wegweiser mit dem Kurspilot-Konfigurationsprogramm erneuern.'
    );
  }
  return requireNonEmptyText(match[1], 'Startkontext');
}

function requireLocalContextRelativePath(declaredPath) {
  const rawPath = requireNonEmptyText(declaredPath, 'Startkontext');
  const rawSegments = rawPath.split(/[\\/]+/);
  const normalized = path.normalize(rawPath);

  if (
    path.isAbsolute(normalized)
    || normalized === LOCAL_CONTEXT_ROOT
    || !normalized.startsWith(`${LOCAL_CONTEXT_ROOT}${path.sep}`)
    || rawSegments.includes('..')
  ) {
    throw new Error(
      'KURSPILOT.md verweist nicht eindeutig auf den Kurspilot-Arbeitsbereich unter local-context/. Bitte Kurspilot einrichten oder den Wegweiser mit dem Kurspilot-Konfigurationsprogramm erneuern.'
    );
  }

  return normalized;
}

function resolveKurspilotStartkontextFromWegweiser(materialFolder, options = {}) {
  const contextRoot = resolveKurspilotContextRoot(options);
  const wegweiserPath = findNearestWegweiser(materialFolder);

  if (!wegweiserPath) {
    throw new Error(
      'Kein KURSPILOT.md-Wegweiser gefunden. Bitte Kurspilot einrichten statt den Pfad im Chat anzugeben.'
    );
  }

  let wegweiserContent;
  try {
    wegweiserContent = fs.readFileSync(wegweiserPath, 'utf8');
  } catch (error) {
    throw new Error(
      'KURSPILOT.md konnte nicht gelesen werden. Bitte Kurspilot einrichten oder den Wegweiser mit dem Kurspilot-Konfigurationsprogramm erneuern.'
    );
  }

  const declaredPath = parseWegweiserStartkontext(wegweiserContent);
  const relativePath = requireLocalContextRelativePath(declaredPath);
  const absolutePath = path.join(contextRoot, relativePath);

  return {
    contextRoot,
    wegweiserPath,
    relativePath,
    absolutePath,
  };
}

function renderKurspilotWegweiserContent(startkontext) {
  return [
    `Startkontext: ${startkontext}`,
    '',
    '# Kurspilot-Wegweiser',
    '',
    'Kurspilot-Arbeitsdateien liegen im zentralen Kurspilot-Arbeitsbereich unter local-context/.',
    'Lege in diesem Materialordner keine plan.md, status.md oder Journale an.',
    '',
  ].join('\n');
}

function setupKurspilotWegweiser(fields, options = {}) {
  const materialFolder = path.resolve(
    requireNonEmptyText(fields && fields.materialFolder, 'materialFolder')
  );
  const startkontext = requireLocalContextRelativePath(fields && fields.startkontext);
  const contextRoot = resolveKurspilotContextRoot(options);
  const wegweiserPath = path.join(materialFolder, 'KURSPILOT.md');
  const content = renderKurspilotWegweiserContent(startkontext);
  const teacherFacingText = [
    'Vorschau fuer KURSPILOT.md:',
    `Materialordner: ${materialFolder}`,
    `Kurspilot-Arbeitsbereich: ${contextRoot}`,
    `Startkontext: ${startkontext}`,
    'Die Datei wird erst nach ausdruecklicher Bestaetigung geschrieben.',
  ].join('\n');

  if (options.confirmed) {
    const fileExists = fs.existsSync(wegweiserPath);
    fs.writeFileSync(wegweiserPath, content, 'utf8');

    return {
      status: fileExists ? 'updated' : 'written',
      materialFolder,
      contextRoot,
      wegweiserPath,
      startkontext,
      content,
      writtenFiles: [wegweiserPath],
      teacherFacingText: [
        'KURSPILOT.md geschrieben.',
        `Materialordner: ${materialFolder}`,
        `Kurspilot-Arbeitsbereich: ${contextRoot}`,
        `Startkontext: ${startkontext}`,
      ].join('\n'),
    };
  }

  return {
    status: 'preview',
    materialFolder,
    contextRoot,
    wegweiserPath,
    startkontext,
    content,
    writtenFiles: [],
    teacherFacingText,
  };
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
  resolveKurspilotContextRoot,
  resolveKurspilotStartkontextFromWegweiser,
  setupKurspilotWegweiser,
  resolveLocalContextPath,
  assertInsideLocalContext,
};
