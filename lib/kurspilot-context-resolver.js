'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getLerngruppenContextFile,
  getFachprofilContextFile,
  getUnterrichtsvorhabenPath,
} = require('./local-context-paths');

function requireNonEmptyText(value, label) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} darf nicht leer sein.`);
  }
  return trimmed;
}

function normalizeOptionalSegment(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

function buildContextCandidates(fields) {
  const schuljahr = requireNonEmptyText(fields && fields.schuljahr, 'Schuljahr');
  const klasseOderLerngruppe = requireNonEmptyText(
    fields && fields.klasseOderLerngruppe,
    'Klasse/Lerngruppe'
  );
  const unterrichtsordner = requireNonEmptyText(
    fields && fields.unterrichtsordner,
    'Unterrichtsordner'
  );
  const unterrichtsvorhaben = normalizeOptionalSegment(fields && fields.unterrichtsvorhaben);

  const candidates = [];

  if (unterrichtsvorhaben) {
    candidates.push({
      kind: 'unterrichtsvorhaben',
      precedence: 0,
      optional: true,
      relativePath: path.join(
        getUnterrichtsvorhabenPath(
          schuljahr,
          klasseOderLerngruppe,
          unterrichtsordner,
          unterrichtsvorhaben
        ),
        'CONTEXT.md'
      ),
    });
  }

  candidates.push({
    kind: 'unterrichtsordner',
    precedence: candidates.length,
    optional: true,
    relativePath: getFachprofilContextFile(schuljahr, klasseOderLerngruppe, unterrichtsordner),
  });

  candidates.push({
    kind: 'lerngruppenprofil',
    precedence: candidates.length,
    optional: false,
    relativePath: getLerngruppenContextFile(schuljahr, klasseOderLerngruppe),
  });

  return {
    requested: {
      schuljahr,
      klasseOderLerngruppe,
      unterrichtsordner,
      unterrichtsvorhaben,
    },
    resolutionPolicy:
      'Dokumente sind von spezifisch nach allgemein sortiert; kleinere precedence-Werte haben Vorrang vor groesseren.',
    candidates,
  };
}

function resolveKurspilotContextDocuments(baseDir, fields) {
  const root = requireNonEmptyText(baseDir, 'contextRoot');
  const { requested, resolutionPolicy, candidates } = buildContextCandidates(fields);

  const documents = candidates.map((candidate) => {
    const absolutePath = path.join(root, candidate.relativePath);
    const exists = fs.existsSync(absolutePath);

    return {
      ...candidate,
      absolutePath,
      exists,
    };
  });

  return {
    contextRoot: root,
    requested,
    resolutionPolicy,
    documents,
    availableDocuments: documents.filter((document) => document.exists),
    missingDocuments: documents.filter((document) => !document.exists),
  };
}

function readKurspilotContextDocuments(baseDir, fields) {
  const resolved = resolveKurspilotContextDocuments(baseDir, fields);
  const documents = resolved.availableDocuments.map((document) => ({
    ...document,
    content: fs.readFileSync(document.absolutePath, 'utf8'),
  }));

  return {
    contextRoot: resolved.contextRoot,
    requested: resolved.requested,
    resolutionPolicy: resolved.resolutionPolicy,
    documents,
    missingDocuments: resolved.missingDocuments,
  };
}

module.exports = {
  resolveKurspilotContextDocuments,
  readKurspilotContextDocuments,
};
