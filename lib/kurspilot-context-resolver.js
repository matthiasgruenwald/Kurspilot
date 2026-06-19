'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getLerngruppenContextFile,
  getFachprofilContextFile,
  getUnterrichtsvorhabenPath,
  resolveKurspilotContextRoot,
  resolveLocalContextPath,
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

function resolveResolverInvocation(baseDirOrFields, fieldsOrOptions, maybeOptions) {
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

function resolveKurspilotContextDocuments(baseDirOrFields, fieldsOrOptions, maybeOptions) {
  const invocation = resolveResolverInvocation(baseDirOrFields, fieldsOrOptions, maybeOptions);
  const root = resolveKurspilotContextRoot({
    contextRoot: invocation.contextRoot,
    readWorkspaceSetting: invocation.options.readWorkspaceSetting,
    workspaceConfigOptions: invocation.options.workspaceConfigOptions,
  });
  const { requested, resolutionPolicy, candidates } = buildContextCandidates(invocation.fields);

  const documents = candidates.map((candidate) => {
    const resolvedPath = resolveLocalContextPath(candidate.relativePath, { contextRoot: root });
    const exists = fs.existsSync(resolvedPath.absolutePath);

    return {
      ...candidate,
      absolutePath: resolvedPath.absolutePath,
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

function readKurspilotContextDocuments(baseDirOrFields, fieldsOrOptions, maybeOptions) {
  const resolved = resolveKurspilotContextDocuments(baseDirOrFields, fieldsOrOptions, maybeOptions);
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
