'use strict';

const STATUS_VALUES = [
  'in_planung',
  'freigegeben',
  'teilweise_umgesetzt',
  'umgesetzt',
  'blockiert',
];

const STATUS_TRANSITIONS = {
  new_plan: 'in_planung',
  approval: 'freigegeben',
  approved_plan_edit: 'in_planung',
  partial_implementation: 'teilweise_umgesetzt',
  completion: 'umgesetzt',
  blocker: 'blockiert',
};

function markdownOrPlaceholder(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '_(noch nicht erfasst)_';
}

function normalizeStatus(value) {
  return STATUS_VALUES.includes(value) ? value : null;
}

function renderListItems(items) {
  if (!items || items.length === 0) {
    return '- _(noch nicht erfasst)_';
  }

  return items.map((item) => `- ${markdownOrPlaceholder(item)}`).join('\n');
}

function renderUnterrichtsvorhabenStatus(fields) {
  const status = normalizeStatus(fields.status) || 'in_planung';
  const lastUpdateDate = markdownOrPlaceholder(fields.lastUpdateDate);
  const updatingSkill = markdownOrPlaceholder(fields.updatingSkill);
  const planState = markdownOrPlaceholder(fields.planState);
  const moodleTarget = markdownOrPlaceholder(fields.moodleTarget);
  const openPoints = renderListItems(fields.openPoints);
  const nextRecommendedStep = markdownOrPlaceholder(fields.nextRecommendedStep);

  return [
    `# Status zum Unterrichtsvorhaben: ${markdownOrPlaceholder(fields.unterrichtsvorhaben)}`,
    '',
    '## Aktueller Status',
    '| Feld | Wert |',
    '| --- | --- |',
    `| Aktueller Status | ${status} |`,
    `| Letzte Aktualisierung | ${lastUpdateDate} |`,
    `| Aktualisierender Skill | ${updatingSkill} |`,
    `| Planstand | ${planState} |`,
    `| Moodle-Ziel | ${moodleTarget} |`,
    '',
    '## Offene Punkte',
    openPoints,
    '',
    '## Naechster empfohlener Schritt',
    `- ${nextRecommendedStep}`,
  ].join('\n');
}

function parseUnterrichtsvorhabenStatus(markdown) {
  if (typeof markdown !== 'string') {
    return null;
  }

  const statusMatch =
    markdown.match(/\|\s*Aktueller Status\s*\|\s*(in_planung|freigegeben|teilweise_umgesetzt|umgesetzt|blockiert)\s*\|/m) ||
    markdown.match(/^[-*]\s*Aktueller Status:\s*(in_planung|freigegeben|teilweise_umgesetzt|umgesetzt|blockiert)\s*$/m);

  return statusMatch ? statusMatch[1] : null;
}

function transitionUnterrichtsvorhabenStatus(_currentStatus, event) {
  return STATUS_TRANSITIONS[event] || null;
}

function getApprovedPlanEditNotice() {
  return [
    'Achtung: Der freigegebene Plan wird vor der Aenderung wieder zu `in_planung`.',
    'Die bisherige Freigabe verlaesst den Plan; nach der Aenderung ist eine neue Freigabe noetig.',
  ].join(' ');
}

module.exports = {
  STATUS_VALUES,
  renderUnterrichtsvorhabenStatus,
  parseUnterrichtsvorhabenStatus,
  transitionUnterrichtsvorhabenStatus,
  getApprovedPlanEditNotice,
};
