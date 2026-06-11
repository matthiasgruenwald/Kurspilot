/**
 * implementation-plan.js
 *
 * Datenstruktur und gestufte Vorschau fuer den "Freigegebenen Implementierungsplan"
 * (siehe CONTEXT.md). Reine Planungslogik, kein Moodle-Zugriff.
 *
 * Alle Funktionen sind unveraenderlich (immutable): sie geben neue Plan-Objekte
 * zurueck statt den uebergebenen Plan zu mutieren.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Planungsgrundsaetze
// ─────────────────────────────────────────────────────────────

const PRINCIPLES = Object.freeze({
  ASSIGN_NO_SUBMISSION_GATE:
    'Aufgabe ohne Abgabe als Gate -> manuelle Schueler-Abschlussmarkierung (completion=1).',
  ASSIGN_DIGITAL_SUBMISSION_GATE:
    'Aufgabe mit digitaler Abgabe als Gate -> Abgabe-Completion (completion=2, completionsubmit=1).',
  PAGE_NO_GATE_DEFAULT:
    'Textseite ohne Gate per Default; manuelle Abschlussmarkierung nur wenn explizit als Pflichtlektuere geplant.',
  RESTRICTION_ONLY_IF_PLANNED:
    'Freigabe-Voraussetzung (Restriction) wird nur gesetzt, wenn sie im Plan ausdruecklich geplant und begruendet ist.',
});

const DEFAULT_PRINCIPLES = Object.freeze(Object.values(PRINCIPLES));

let nextActivityId = 1;

function generateActivityId() {
  const id = `activity-${nextActivityId}`;
  nextActivityId += 1;
  return id;
}

// ─────────────────────────────────────────────────────────────
// Plan erstellen / Abschnitte hinzufuegen
// ─────────────────────────────────────────────────────────────

/**
 * Erstellt einen leeren Implementierungsplan fuer einen Kurs.
 * @param {{ courseId: number }} options
 */
function createPlan({ courseId }) {
  return {
    courseId,
    sections: [],
    principles: [...DEFAULT_PRINCIPLES],
    deviations: [],
  };
}

/**
 * Fuegt einen neuen Abschnitt zum Plan hinzu (immutable).
 * @param {object} plan
 * @param {{ sectionnum: number, name: string }} section
 */
function addSection(plan, { sectionnum, name }) {
  return {
    ...plan,
    sections: [
      ...plan.sections,
      { sectionnum, name, activities: [] },
    ],
  };
}

function findSectionIndex(plan, sectionnum) {
  const index = plan.sections.findIndex(s => s.sectionnum === sectionnum);
  if (index === -1) {
    throw new Error(`Abschnitt ${sectionnum} nicht im Plan gefunden. Erst addSection aufrufen.`);
  }
  return index;
}

// ─────────────────────────────────────────────────────────────
// Aktivitaeten hinzufuegen + Defaults/Planabweichungen ableiten
// ─────────────────────────────────────────────────────────────

/**
 * Leitet Completion-Defaults fuer eine Aktivitaet anhand der Planungsgrundsaetze ab.
 * Gibt zusaetzlich an, ob die uebergebene/abgeleitete Konfiguration vom Default abweicht.
 */
function resolveCompletion(input) {
  const { type, isGate = false, hasDigitalSubmission = false } = input;

  if (type === 'assign') {
    if (!isGate) {
      return { completion: { completion: 0 }, principle: null };
    }
    if (hasDigitalSubmission) {
      return {
        completion: { completion: 2, completionsubmit: 1 },
        principle: PRINCIPLES.ASSIGN_DIGITAL_SUBMISSION_GATE,
      };
    }
    return {
      completion: { completion: 1 },
      principle: PRINCIPLES.ASSIGN_NO_SUBMISSION_GATE,
    };
  }

  if (type === 'page') {
    if (isGate) {
      return {
        completion: { completion: 1 },
        principle: PRINCIPLES.PAGE_NO_GATE_DEFAULT,
        isDeviation: true,
      };
    }
    return { completion: { completion: 0 }, principle: PRINCIPLES.PAGE_NO_GATE_DEFAULT };
  }

  // label, url und sonstige Typen: keine Abschlussverfolgung als Default
  return { completion: { completion: 0 }, principle: null };
}

/**
 * Normalisiert eine Restriction-Angabe und prueft, ob sie eine Planabweichung ist.
 * Default ist "keine Restriction".
 */
function resolveRestriction(input) {
  if (!input.restriction) {
    return { restriction: null, isDeviation: false };
  }

  const { require_cmids = [], show_locked = 1, operator = 'AND' } = input.restriction;

  if (!Array.isArray(require_cmids) || require_cmids.length === 0) {
    return { restriction: null, isDeviation: false };
  }

  return {
    restriction: { require_cmids, show_locked, operator },
    isDeviation: true,
  };
}

/**
 * Fuegt eine Aktivitaet zu einem Abschnitt hinzu (immutable).
 *
 * Erkennt anhand der Planungsgrundsaetze die passenden Completion-/Restriction-
 * Defaults. Weicht die Eingabe von einem Grundsatz ab, muss `deviationReason`
 * gesetzt sein - sonst wirft die Funktion einen Fehler.
 *
 * @param {object} plan
 * @param {number} sectionnum
 * @param {object} activityInput
 */
function addActivity(plan, sectionnum, activityInput) {
  const sectionIndex = findSectionIndex(plan, sectionnum);

  const { completion, principle: completionPrinciple, isDeviation: completionIsDeviation } =
    resolveCompletion(activityInput);
  const { restriction, isDeviation: restrictionIsDeviation } = resolveRestriction(activityInput);

  const isAnyDeviation = Boolean(completionIsDeviation) || restrictionIsDeviation;

  if (isAnyDeviation && !activityInput.deviationReason) {
    throw new Error(
      `Planabweichung fuer Aktivitaet "${activityInput.name}" benoetigt eine Begruendung (deviationReason).`,
    );
  }

  const activity = {
    id: generateActivityId(),
    type: activityInput.type,
    name: activityInput.name,
    isGate: Boolean(activityInput.isGate),
    completion,
    restriction,
  };

  if (activityInput.content !== undefined) activity.content = activityInput.content;
  if (activityInput.description !== undefined) activity.description = activityInput.description;
  if (activityInput.externalurl !== undefined) activity.externalurl = activityInput.externalurl;

  const newDeviations = [...plan.deviations];

  if (completionIsDeviation) {
    newDeviations.push({
      activityName: activityInput.name,
      principle: completionPrinciple,
      reason: activityInput.deviationReason,
    });
  }

  if (restrictionIsDeviation) {
    newDeviations.push({
      activityName: activityInput.name,
      principle: PRINCIPLES.RESTRICTION_ONLY_IF_PLANNED,
      reason: activityInput.deviationReason,
    });
  }

  const newSections = plan.sections.map((section, index) => {
    if (index !== sectionIndex) return section;
    return { ...section, activities: [...section.activities, activity] };
  });

  return {
    ...plan,
    sections: newSections,
    deviations: newDeviations,
  };
}

// ─────────────────────────────────────────────────────────────
// Gestufte Vorschau
// ─────────────────────────────────────────────────────────────

/**
 * Knappe Uebersicht: Abschnitte, Aktivitaeten, Reihenfolge, Gates/Voraussetzungen,
 * Planungsgrundsaetze und Planabweichungen. KEIN Volltext (z.B. ganze Textseiten) -
 * dafuer getActivityDetail verwenden.
 */
function getOverview(plan) {
  return {
    courseId: plan.courseId,
    sections: plan.sections.map(section => ({
      sectionnum: section.sectionnum,
      name: section.name,
      activities: section.activities.map(activity => ({
        id: activity.id,
        type: activity.type,
        name: activity.name,
        isGate: activity.isGate,
        completion: activity.completion,
        restriction: activity.restriction,
      })),
    })),
    principles: [...plan.principles],
    deviations: [...plan.deviations],
  };
}

/**
 * Volltext-Details einer einzelnen Aktivitaet (z.B. ganze Textseiteninhalte) -
 * nur auf explizite Anfrage abrufen.
 */
function getActivityDetail(plan, activityId) {
  for (const section of plan.sections) {
    const activity = section.activities.find(a => a.id === activityId);
    if (activity) {
      return { ...activity, sectionnum: section.sectionnum, sectionName: section.name };
    }
  }
  throw new Error(`Aktivitaet mit id "${activityId}" nicht gefunden.`);
}

// ─────────────────────────────────────────────────────────────
// Plan anwenden (schreibende MCP-Tool-Aufrufe)
// ─────────────────────────────────────────────────────────────

const CREATE_TOOL_BY_TYPE = Object.freeze({
  page: 'moodle_create_page',
  assign: 'moodle_create_assign',
  url: 'moodle_create_url',
  label: 'moodle_create_label',
});

/**
 * Fuehrt den Plan ueber den uebergebenen MCP-Client aus (moodle_create_*,
 * moodle_set_completion, moodle_set_restriction).
 *
 * Wirft einen Fehler, wenn `approved` nicht true ist - es duerfen NIEMALS
 * schreibende Tool-Aufrufe ohne explizite Freigabe der Lehrkraft erfolgen.
 *
 * @param {object} plan
 * @param {{ approved: boolean, client: Record<string, Function> }} options
 */
async function applyPlan(plan, { approved, client }) {
  if (!approved) {
    throw new Error(
      'Fehlende Freigabe: Plan wurde nicht freigegeben, es duerfen keine schreibenden Moodle-Aenderungen ausgefuehrt werden.',
    );
  }

  const created = [];

  for (const section of plan.sections) {
    for (const activity of section.activities) {
      const toolName = CREATE_TOOL_BY_TYPE[activity.type];
      if (!toolName) {
        throw new Error(`Kein Create-Tool fuer Aktivitaetstyp "${activity.type}" bekannt.`);
      }

      const createArgs = {
        courseid: plan.courseId,
        sectionnum: section.sectionnum,
        name: activity.name,
      };
      if (activity.content !== undefined) createArgs.content = activity.content;
      if (activity.description !== undefined) createArgs.description = activity.description;
      if (activity.externalurl !== undefined) createArgs.externalurl = activity.externalurl;

      const result = await client[toolName](createArgs);
      const cmid = result && result.cmid;

      if (activity.completion && activity.completion.completion > 0) {
        await client.moodle_set_completion({ cmid, ...activity.completion });
      }

      if (activity.restriction) {
        await client.moodle_set_restriction({ cmid, ...activity.restriction });
      }

      created.push({ activityId: activity.id, name: activity.name, cmid });
    }
  }

  return { created };
}

module.exports = {
  PRINCIPLES,
  DEFAULT_PRINCIPLES,
  createPlan,
  addSection,
  addActivity,
  getOverview,
  getActivityDetail,
  applyPlan,
};
