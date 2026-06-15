'use strict';

const path = require('node:path');

const DIFF_HINT_PREFIX = 'Kurspilot-Diff-Pruefhinweis';

function normalizeChangedFile(item) {
  if (typeof item === 'string') {
    return {
      fileName: path.basename(item),
      kind: null,
    };
  }

  if (!item || typeof item !== 'object') {
    return {
      fileName: '',
      kind: null,
    };
  }

  const fileName = item.fileName || item.path || item.file || '';
  return {
    fileName: path.basename(fileName),
    kind: typeof item.kind === 'string' ? item.kind : null,
  };
}

function formatPlanDiffHint(includeApprovalHint) {
  return [
    `${DIFF_HINT_PREFIX} fuer plan.md`,
    `Im Codex/Claude-Code-Diff pruefen: Planinhalt, Moodle-Ziel und Aktivitaetsreihenfolge.${includeApprovalHint ? ' Bei freigegebenem Plan auch die Freigabe neu absichern.' : ''}`,
  ].join('\n');
}

function formatStatusDiffHint() {
  return [
    `${DIFF_HINT_PREFIX} fuer status.md`,
    'Im Codex/Claude-Code-Diff pruefen: Statuswert, Moodle-Ziel, offene Punkte, Wiederaufsetzpunkt und naechsten empfohlenen Schritt.',
  ].join('\n');
}

function formatKurspilotDiffHint(changedFiles, options = {}) {
  const entries = Array.isArray(changedFiles) ? changedFiles : [changedFiles];
  const normalized = entries.map(normalizeChangedFile);
  const fileNames = new Set(normalized.map((entry) => entry.fileName));
  const kinds = new Set(normalized.map((entry) => entry.kind).filter(Boolean));
  const includeApprovalHint = Boolean(options.planApproved || kinds.has('approved'));
  const hints = [];

  if (fileNames.has('plan.md') || kinds.has('plan')) {
    hints.push(formatPlanDiffHint(includeApprovalHint));
  }

  if (fileNames.has('status.md') || kinds.has('status')) {
    hints.push(formatStatusDiffHint());
  }

  if (hints.length === 0) {
    hints.push([
      DIFF_HINT_PREFIX,
      'Im Codex/Claude-Code-Diff die geaenderten Kurspilot-Dateien pruefen.',
    ].join('\n'));
  }

  return hints.join('\n\n');
}

module.exports = {
  formatKurspilotDiffHint,
};
