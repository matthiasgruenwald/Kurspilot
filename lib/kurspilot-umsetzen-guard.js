'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { applyPlan } = require('./implementation-plan');
const {
  parseUnterrichtsvorhabenStatus,
  readUnterrichtsvorhabenStatusField,
  readUnterrichtsvorhabenStatusList,
  renderUnterrichtsvorhabenStatus,
} = require('./unterrichtsvorhaben-status');

const PLACEHOLDER = '_(noch nicht erfasst)_';

function requireExistingFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    throw new Error(`Arbeitsdatei ist leer: ${path.basename(filePath)}`);
  }
  return content;
}

function normalizeDate(now) {
  if (typeof now === 'string' && now.trim()) {
    return now.trim();
  }
  return new Date(now || Date.now()).toISOString().slice(0, 10);
}

function formatCreatedEntry(item) {
  const idPart = item.cmid !== undefined ? ` (Moodle-ID ${item.cmid})` : '';
  const linkPart = item.link ? ` - ${item.link}` : '';
  return `${item.name}${idPart}${linkPart}`;
}

function formatImplementationPoint(item) {
  if (!item) {
    return PLACEHOLDER;
  }

  const moodleIdPart = item.cmid !== undefined ? `, Moodle-ID ${item.cmid}` : '';
  return `${item.name} (Plan-ID ${item.activityId}${moodleIdPart})`;
}

function parseImplementationPointActivityId(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim() === PLACEHOLDER) {
    return null;
  }

  const match = value.match(/Plan-ID\s+([^) ,]+)/);
  return match ? match[1] : null;
}

function writeStatusFile(statusFile, fields) {
  fs.writeFileSync(statusFile, renderUnterrichtsvorhabenStatus(fields), 'utf8');
}

async function runKurspilotUmsetzenGuard(workspaceRoot, { plan, client, now, updatingSkill = 'kurspilot-umsetzen' }) {
  const planFile = path.join(workspaceRoot, 'plan.md');
  const statusFile = path.join(workspaceRoot, 'status.md');

  requireExistingFile(planFile);
  const statusMarkdown = requireExistingFile(statusFile);

  const status = parseUnterrichtsvorhabenStatus(statusMarkdown);
  const unterrichtsvorhaben = path.basename(workspaceRoot);
  const moodleTarget = readUnterrichtsvorhabenStatusField(statusMarkdown, 'Moodle-Ziel') || `Moodle-Kurs ${plan.courseId}`;
  const existingEntries = readUnterrichtsvorhabenStatusList(statusMarkdown, 'Moodle-Ergebnisse');
  const date = normalizeDate(now);

  if (status === 'in_planung') {
    return {
      outcome: 'refused',
      nextRecommendedStep:
        'Mit `kurspilot-planen` den Entwurf pruefen, zur Freigabe bringen und erst dann `kurspilot-umsetzen` erneut starten.',
    };
  }

  if (status !== 'freigegeben' && status !== 'teilweise_umgesetzt') {
    throw new Error(`Status "${status || 'unbekannt'}" erlaubt keine Moodle-Umsetzung.`);
  }

  let startAfterActivityId = null;
  if (status === 'teilweise_umgesetzt') {
    startAfterActivityId = parseImplementationPointActivityId(
      readUnterrichtsvorhabenStatusField(statusMarkdown, 'Letzter Umsetzungspunkt')
    );

    if (!startAfterActivityId) {
      const nextRecommendedStep =
        'Mit `kurspilot-planen` den Status pruefen und einen lesbaren Wiederaufsetzpunkt fuer die Restumsetzung festhalten.';
      writeStatusFile(statusFile, {
        unterrichtsvorhaben,
        status: 'blockiert',
        lastUpdateDate: date,
        updatingSkill,
        planState: 'Fortsetzung blockiert',
        moodleTarget,
        implementationPoint: PLACEHOLDER,
        moodleEntries: existingEntries,
        openPoints: ['Wiederaufsetzpunkt fuer die Teilumsetzung fehlt oder ist nicht lesbar.'],
        nextRecommendedStep,
      });

      return {
        outcome: 'blocked',
        nextRecommendedStep,
      };
    }
  }

  try {
    const planResult = await applyPlan(plan, {
      approved: true,
      client,
      startAfterActivityId,
    });
    const moodleEntries = existingEntries.concat(planResult.created.map(formatCreatedEntry));
    const lastCreatedItem = planResult.created[planResult.created.length - 1];
    const implementationPoint = lastCreatedItem
      ? formatImplementationPoint(lastCreatedItem)
      : (readUnterrichtsvorhabenStatusField(statusMarkdown, 'Letzter Umsetzungspunkt') || 'Alle geplanten Aktivitaeten angelegt.');

    const nextRecommendedStep = 'Umsetzung abgeschlossen. Nur noch pruefen oder dokumentieren.';
    writeStatusFile(statusFile, {
      unterrichtsvorhaben,
      status: 'umgesetzt',
      lastUpdateDate: date,
      updatingSkill,
      planState: 'Umsetzung abgeschlossen',
      moodleTarget,
      implementationPoint,
      moodleEntries,
      openPoints: ['Keine'],
      nextRecommendedStep,
    });

    return {
      outcome: 'completed',
      planResult,
      nextRecommendedStep,
    };
  } catch (error) {
    const partialResult = error.partialResult || { created: [] };
    const moodleEntries = existingEntries.concat((partialResult.created || []).map(formatCreatedEntry));
    const lastCreatedItem = partialResult.created && partialResult.created[partialResult.created.length - 1];
    const hasStoppingPoint = Boolean(lastCreatedItem);
    const nextRecommendedStep = hasStoppingPoint
      ? 'Mit `kurspilot-umsetzen` ab dem festgehaltenen Wiederaufsetzpunkt fortsetzen, nachdem der Fehler geprueft wurde.'
      : 'Mit `kurspilot-planen` die fehlgeschlagene Umsetzung pruefen und das weitere Vorgehen festlegen.';

    writeStatusFile(statusFile, {
      unterrichtsvorhaben,
      status: hasStoppingPoint ? 'teilweise_umgesetzt' : 'blockiert',
      lastUpdateDate: date,
      updatingSkill,
      planState: hasStoppingPoint ? 'Teilweise umgesetzt' : 'Umsetzung blockiert',
      moodleTarget,
      implementationPoint: formatImplementationPoint(lastCreatedItem),
      moodleEntries,
      openPoints: [
        `Fehler bei ${partialResult.failedActivity ? partialResult.failedActivity.name : 'der Umsetzung'}: ${error.message}`,
      ],
      nextRecommendedStep,
    });

    return {
      outcome: hasStoppingPoint ? 'partial' : 'blocked',
      error: error.message,
      nextRecommendedStep,
    };
  }
}

module.exports = {
  runKurspilotUmsetzenGuard,
};
