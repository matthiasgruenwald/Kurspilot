'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getUnterrichtsvorhabenPath,
  resolveLocalContextPath,
} = require('./local-context-paths');
const {
  renderUnterrichtsvorhabenStatus: renderUnterrichtsvorhabenStatusMarkdown,
  parseUnterrichtsvorhabenStatus,
  transitionUnterrichtsvorhabenStatus,
  getApprovedPlanEditNotice,
} = require('./unterrichtsvorhaben-status');
const { formatKurspilotDiffHint } = require('./kurspilot-diff-hint');

function markdownEscaped(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '_(noch nicht erfasst)_';
}

function renderUnterrichtsvorhabenPlan(fields) {
  return [
    `# Unterrichtsvorhaben: ${markdownEscaped(fields.unterrichtsvorhaben)}`,
    '',
    '## Thema',
    markdownEscaped(fields.thema),
    '',
    '## Ziel',
    markdownEscaped(fields.ziel),
    '',
    '## Plan',
    '- _(noch nicht erfasst)_',
    '',
    '## Hinweise',
    '- Dieser Plan ist die aktive Arbeitsfassung fuer die Lehrkraft.',
  ].join('\n');
}

function renderUnterrichtsvorhabenStatus(fields, options = {}) {
  const statusEvent = options.statusEvent || 'new_plan';
  const status = transitionUnterrichtsvorhabenStatus(options.currentStatus || null, statusEvent) || 'in_planung';
  const date = options.lastUpdateDate || new Date().toISOString().slice(0, 10);

  let planState = 'plan.md angelegt';
  let nextRecommendedStep = 'Vorhaben mit der Lehrkraft bestaetigen oder ueberarbeiten.';

  if (status === 'freigegeben') {
    planState = 'Freigegebener Implementierungsplan';
    nextRecommendedStep = 'Mit der Umsetzung in Moodle beginnen.';
  } else if (status === 'teilweise_umgesetzt') {
    planState = 'Teilweise umgesetzt';
    nextRecommendedStep = 'Offene Punkte aus der Teilumsetzung abarbeiten.';
  } else if (status === 'umgesetzt') {
    planState = 'Umsetzung abgeschlossen';
    nextRecommendedStep = 'Nur noch dokumentieren oder beenden.';
  } else if (status === 'blockiert') {
    planState = 'Durch Blocker angehalten';
    nextRecommendedStep = 'Blocker klaeren und dann neu einordnen.';
  }

  return renderUnterrichtsvorhabenStatusMarkdown({
    unterrichtsvorhaben: fields.unterrichtsvorhaben,
    status,
    lastUpdateDate: date,
    updatingSkill: options.updatingSkill || 'Kurspilot',
    planState,
    moodleTarget: fields.ziel,
    openPoints: options.openPoints || ['_(noch nicht erfasst)_'],
    nextRecommendedStep,
  });
}

function summarizeExistingMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  const excerpt = content.split(/\r?\n/).slice(0, 8).join('\n');

  return {
    filePath,
    excerpt,
  };
}

function buildTeacherFacingText({ mode, relativePath, existingFiles }) {
  if (mode === 'existing') {
    const fileList = existingFiles.map((file) => `- ${path.basename(file)}`).join('\n');
    const statusFile = existingFiles.find((file) => path.basename(file) === 'status.md');
    const statusContent = statusFile && fs.existsSync(statusFile) ? fs.readFileSync(statusFile, 'utf8') : '';
    const status = parseUnterrichtsvorhabenStatus(statusContent);
    const lines = [
      'Ein Unterrichtsvorhaben existiert bereits.',
      `Ablage im Kurspilot-Arbeitsbereich: ${relativePath}`,
      'Vorhandene Dateien:',
      fileList,
      'Du kannst den Stand zusammenfassen, fortsetzen oder ueberarbeiten.',
    ];

    if (status === 'freigegeben') {
      lines.push(getApprovedPlanEditNotice());
    }

    return lines.join('\n');
  }

  return [
    'Vorschau fuer neues Unterrichtsvorhaben:',
    `Ablage im Kurspilot-Arbeitsbereich: ${relativePath}`,
    'Geplant werden genau diese Arbeitsdateien:',
    '- plan.md',
    '- status.md',
    'Die Anlage erfolgt erst nach Bestaetigung.',
  ].join('\n');
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

function setupUnterrichtsvorhabenWorkspace(baseDirOrFields, fieldsOrOptions, maybeOptions) {
  const invocation = resolveWorkspaceInvocation(baseDirOrFields, fieldsOrOptions, maybeOptions);
  const relativePath = getUnterrichtsvorhabenPath(
    invocation.fields.schuljahr,
    invocation.fields.klasseOderLerngruppe,
    invocation.fields.unterrichtsordner,
    invocation.fields.unterrichtsvorhaben
  );
  const resolvedWorkspacePath = resolveLocalContextPath(relativePath, {
    contextRoot: invocation.contextRoot,
    readWorkspaceSetting: invocation.options.readWorkspaceSetting,
    workspaceConfigOptions: invocation.options.workspaceConfigOptions,
  });
  const workspacePath = resolvedWorkspacePath.absolutePath;
  const planPath = path.join(workspacePath, 'plan.md');
  const statusPath = path.join(workspacePath, 'status.md');
  const existingFiles = [planPath, statusPath].filter((filePath) => fs.existsSync(filePath));

  if (existingFiles.length > 0) {
    return {
      status: 'existing',
      mode: 'existing',
      workspaceRoot: workspacePath,
      planFile: planPath,
      statusFile: statusPath,
      createdFiles: [],
      existingFiles,
      existingSummaries: existingFiles.map(summarizeExistingMarkdown),
      decisionOptions: ['Zusammenfassen', 'Fortsetzen', 'Ueberarbeiten'],
      teacherFacingText: buildTeacherFacingText({
        mode: 'existing',
        relativePath: workspacePath,
        existingFiles,
      }),
    };
  }

  if (!invocation.options.confirmed) {
    return {
      status: 'preview',
      mode: 'preview',
      workspaceRoot: workspacePath,
      planFile: planPath,
      statusFile: statusPath,
      createdFiles: [],
      existingFiles: [],
      decisionOptions: ['Anlegen bestaetigen', 'Spaeter weiter'],
      teacherFacingText: buildTeacherFacingText({
        mode: 'preview',
        relativePath: workspacePath,
        existingFiles: [],
      }),
    };
  }

  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(planPath, renderUnterrichtsvorhabenPlan(invocation.fields), 'utf8');
  fs.writeFileSync(
    statusPath,
    renderUnterrichtsvorhabenStatus(invocation.fields, invocation.options),
    'utf8'
  );
  const planApproved =
    invocation.options.statusEvent === 'approval'
    || invocation.options.currentStatus === 'freigegeben';

  return {
    status: 'created',
    mode: 'confirmed',
    workspaceRoot: workspacePath,
    planFile: planPath,
    statusFile: statusPath,
    createdFiles: [planPath, statusPath],
    existingFiles: [],
    decisionOptions: ['Zusammenfassen', 'Fortsetzen', 'Ueberarbeiten'],
    diffHint: formatKurspilotDiffHint(
      [
        { fileName: 'plan.md', kind: 'plan' },
        { fileName: 'status.md', kind: 'status' },
      ],
      { planApproved }
    ),
    teacherFacingText: [
      'Unterrichtsvorhaben angelegt.',
      `Ablage im Kurspilot-Arbeitsbereich: ${workspacePath}`,
      '- plan.md',
      '- status.md',
    ].join('\n'),
  };
}

module.exports = {
  renderUnterrichtsvorhabenPlan,
  renderUnterrichtsvorhabenStatus,
  setupUnterrichtsvorhabenWorkspace,
};
