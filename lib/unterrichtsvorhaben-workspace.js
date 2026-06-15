'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  getUnterrichtsvorhabenPath,
} = require('./local-context-paths');
const {
  renderUnterrichtsvorhabenStatus: renderUnterrichtsvorhabenStatusMarkdown,
  parseUnterrichtsvorhabenStatus,
  transitionUnterrichtsvorhabenStatus,
  getApprovedPlanEditNotice,
} = require('./unterrichtsvorhaben-status');

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
      `Pfad: ${relativePath}`,
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
    `Pfad: ${relativePath}`,
    'Geplant werden genau diese Arbeitsdateien:',
    '- plan.md',
    '- status.md',
    'Die Anlage erfolgt erst nach Bestaetigung.',
  ].join('\n');
}

function setupUnterrichtsvorhabenWorkspace(baseDir, fields, options = {}) {
  const relativePath = getUnterrichtsvorhabenPath(
    fields.schuljahr,
    fields.klasseOderLerngruppe,
    fields.unterrichtsordner,
    fields.unterrichtsvorhaben
  );
  const workspacePath = path.join(baseDir, relativePath);
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
        relativePath,
        existingFiles,
      }),
    };
  }

  if (!options.confirmed) {
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
        relativePath,
        existingFiles: [],
      }),
    };
  }

  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(planPath, renderUnterrichtsvorhabenPlan(fields), 'utf8');
  fs.writeFileSync(statusPath, renderUnterrichtsvorhabenStatus(fields, options), 'utf8');

  return {
    status: 'created',
    mode: 'confirmed',
    workspaceRoot: workspacePath,
    planFile: planPath,
    statusFile: statusPath,
    createdFiles: [planPath, statusPath],
    existingFiles: [],
    decisionOptions: ['Zusammenfassen', 'Fortsetzen', 'Ueberarbeiten'],
    teacherFacingText: [
      'Unterrichtsvorhaben angelegt.',
      `Pfad: ${relativePath}`,
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
