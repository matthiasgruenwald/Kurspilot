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
const { formatKurspilotDiffHint } = require('./kurspilot-diff-hint');

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

function parseImplementationPointMoodleId(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim() === PLACEHOLDER) {
    return null;
  }

  const match = value.match(/Moodle-ID\s+(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeCatalogText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function findImplementationPreflightConflicts(plan, client, { implementationPoint } = {}) {
  if (!client || typeof client.moodle_get_course_catalog !== 'function') {
    return [
      'Umsetzungsvorpruefung konnte keine Moodle-Katalogansicht lesen: moodle_get_course_catalog ist im Client nicht verfuegbar.',
    ];
  }

  const catalog = await client.moodle_get_course_catalog({
    courseid: plan.courseId,
    sectionnum: -1,
    detail: 'compact',
  });
  const conflicts = [];

  if (!catalog || Number(catalog.courseid) !== Number(plan.courseId)) {
    conflicts.push(
      `Moodle-Ziel passt nicht zum freigegebenen Plan: erwartet Kurs ${plan.courseId}, Katalog meldet ${catalog && catalog.courseid !== undefined ? catalog.courseid : 'kein Ziel'}.`
    );
    return conflicts;
  }

  const catalogSections = Array.isArray(catalog.sections) ? catalog.sections : [];
  const catalogSectionByNumber = new Map(
    catalogSections.map((section) => [Number(section.sectionnum), section])
  );
  const catalogModulesByCmid = new Map();

  for (const section of plan.sections) {
    const catalogSection = catalogSectionByNumber.get(Number(section.sectionnum));
    if (!catalogSection) {
      conflicts.push(`Abschnitt ${section.sectionnum} fehlt im Moodle-Ziel.`);
      continue;
    }

    for (const module of Array.isArray(catalogSection.modules) ? catalogSection.modules : []) {
      catalogModulesByCmid.set(Number(module.cmid), module);
    }

    const plannedName = normalizeCatalogText(section.name);
    const moodleName = normalizeCatalogText(catalogSection.name);
    if (plannedName && moodleName && plannedName !== moodleName) {
      conflicts.push(
        `Abschnitt ${section.sectionnum} stimmt nicht ueberein: geplant "${plannedName}", aus Moodle gelesen "${moodleName}".`
      );
    }
  }

  const resumeMoodleId = parseImplementationPointMoodleId(implementationPoint);
  if (resumeMoodleId && !catalogModulesByCmid.has(resumeMoodleId)) {
    conflicts.push(
      `Wiederaufsetzpunkt stimmt nicht mit Moodle ueberein: Moodle-ID ${resumeMoodleId} ist im Kurskatalog nicht vorhanden.`
    );
  }

  return conflicts;
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
        diffHint: formatKurspilotDiffHint([{ fileName: 'status.md', kind: 'status' }]),
      };
    }
  }

  const implementationPoint = readUnterrichtsvorhabenStatusField(statusMarkdown, 'Letzter Umsetzungspunkt');
  const preflightConflicts = await findImplementationPreflightConflicts(plan, client, { implementationPoint });
  if (preflightConflicts.length > 0) {
    const nextRecommendedStep =
      'Kursstand-Abgleich mit `kurspilot-planen` durchfuehren, den lokalen Planungsstand pruefen und erst nach erneuter Freigabe `kurspilot-umsetzen` starten.';
    writeStatusFile(statusFile, {
      unterrichtsvorhaben,
      status: 'blockiert',
      lastUpdateDate: date,
      updatingSkill,
      planState: 'Umsetzungsvorpruefung blockiert',
      moodleTarget,
      implementationPoint,
      moodleEntries: existingEntries,
      openPoints: preflightConflicts,
      nextRecommendedStep,
    });

    return {
      outcome: 'blocked',
      error: 'Umsetzungsvorpruefung blockiert Moodle-Schreibzugriffe.',
      conflicts: preflightConflicts,
      nextRecommendedStep,
      diffHint: formatKurspilotDiffHint([{ fileName: 'status.md', kind: 'status' }]),
    };
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
      diffHint: formatKurspilotDiffHint([{ fileName: 'status.md', kind: 'status' }]),
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
      diffHint: formatKurspilotDiffHint([{ fileName: 'status.md', kind: 'status' }]),
    };
  }
}

module.exports = {
  runKurspilotUmsetzenGuard,
};
