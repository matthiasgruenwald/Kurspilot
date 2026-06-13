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

const { previewMcQuestion } = require('./mc-question-preview');

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
  QUIZ_PASS_COMPLETION_DEFAULT:
    'Testaktivitaet -> Bestehensabschluss (completion=2, completionpassgrade=1).',
  QUIZ_LERNCHECK_MODE_DEFAULT:
    'Testaktivitaet ohne Modusangabe -> Lerncheck-Modus (mode="lerncheck", unbegrenzte Versuche, beste Bewertung).',
  QUESTION_REQUIRES_REFERENCE_ACTIVITY:
    'Jede MC-Frage braucht eine Bezugsaktivitaet; ohne aufloesbare Bezugsaktivitaet wird die Frage als Materialluecke markiert und nicht nach Moodle geschrieben.',
});

const DEFAULT_PRINCIPLES = Object.freeze(Object.values(PRINCIPLES));

let nextActivityId = 1;
let nextQuestionId = 1;

function generateActivityId() {
  const id = `activity-${nextActivityId}`;
  nextActivityId += 1;
  return id;
}

function generateQuestionId() {
  const id = `question-${nextQuestionId}`;
  nextQuestionId += 1;
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
    materialGaps: [],
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

  if (type === 'quiz') {
    const defaultCompletion = { completion: 2, completionpassgrade: 1 };
    const requested = input.completion;
    const matchesDefault = requested
      && requested.completion === defaultCompletion.completion
      && requested.completionpassgrade === defaultCompletion.completionpassgrade;

    if (requested && !matchesDefault) {
      return {
        completion: requested,
        principle: PRINCIPLES.QUIZ_PASS_COMPLETION_DEFAULT,
        isDeviation: true,
      };
    }
    return { completion: defaultCompletion, principle: null };
  }

  // label, url und sonstige Typen: keine Abschlussverfolgung als Default
  return { completion: { completion: 0 }, principle: null };
}

/**
 * Leitet den Quiz-Modus ab (CONTEXT.md "Lerncheck-Modus", "Bewertungsmodus",
 * "Intensiv-Ueben-Modus"). Default ist "lerncheck"; jeder andere Modus ist
 * eine Planabweichung vom Lerncheck-Default (Issue #11).
 */
function resolveQuizMode(input) {
  const mode = input.mode || 'lerncheck';
  if (mode !== 'lerncheck') {
    return { mode, principle: PRINCIPLES.QUIZ_LERNCHECK_MODE_DEFAULT, isDeviation: true };
  }
  return { mode, principle: null, isDeviation: false };
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
  const isQuiz = activityInput.type === 'quiz';
  const modeResult = isQuiz ? resolveQuizMode(activityInput) : null;
  const modeIsDeviation = Boolean(modeResult && modeResult.isDeviation);

  const isAnyDeviation = Boolean(completionIsDeviation) || restrictionIsDeviation || modeIsDeviation;

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
  // "Alt-Text-Vorschlaege" fuer Fachabbildungen (siehe lib/alt-text.js, Issue #16):
  // Array von { imagePath, altText }, je ein Eintrag pro Bild-Embed der Aktivitaet.
  if (activityInput.images !== undefined) activity.images = activityInput.images;

  // Quiz-spezifische Felder (Issue #20, baut auf #6/#10/#11/#13 auf):
  // mode (Lerncheck/Intensiv-Ueben/Bewertung), Bestehensgrenze, Zeitlimit,
  // Fragenbank-Kategorie und die geplanten Fragen (addQuestion).
  if (isQuiz) {
    activity.mode = modeResult.mode;
    if (activityInput.gradepass !== undefined) activity.gradepass = activityInput.gradepass;
    if (activityInput.timelimit !== undefined) activity.timelimit = activityInput.timelimit;
    if (activityInput.categoryid !== undefined) activity.categoryid = activityInput.categoryid;
    activity.questions = [];
  }

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

  if (modeIsDeviation) {
    newDeviations.push({
      activityName: activityInput.name,
      principle: modeResult.principle,
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

/**
 * Fuegt eine Testaktivitaet (mod_quiz) hinzu. Duenner Wrapper um `addActivity`
 * mit `type: 'quiz'` (siehe Planungsgrundsaetze QUIZ_PASS_COMPLETION_DEFAULT
 * und QUIZ_LERNCHECK_MODE_DEFAULT).
 *
 * @param {object} plan
 * @param {number} sectionnum
 * @param {object} quizInput - { name, mode?, gradepass?, timelimit?, categoryid?, isGate?, restriction?, deviationReason? }
 */
function addQuiz(plan, sectionnum, quizInput) {
  return addActivity(plan, sectionnum, { ...quizInput, type: 'quiz' });
}

/**
 * Sucht eine Aktivitaet ueber alle Abschnitte hinweg per id.
 * @returns {object|null}
 */
function findActivityById(plan, activityId) {
  for (const section of plan.sections) {
    const activity = section.activities.find(a => a.id === activityId);
    if (activity) return activity;
  }
  return null;
}

/**
 * Fuegt eine MC-Frage zu einem geplanten Quiz hinzu (Issue #20, baut auf
 * #9/#13/#14/#18 auf).
 *
 * Jede Frage braucht eine **Bezugsaktivitaet** (CONTEXT.md "Bezugsaktivitaet"):
 * `questionInput.referencedActivityId` muss auf eine bereits im Plan
 * vorhandene Aktivitaet zeigen. Ist keine aufloesbare Bezugsaktivitaet
 * angegeben, wird die Frage als **Materialluecke** markiert
 * (`plan.materialGaps`) und beim Anwenden des Plans NICHT nach Moodle
 * geschrieben (CONTEXT.md "Materialluecke").
 *
 * @param {object} plan
 * @param {string} quizActivityId id der Quiz-Aktivitaet (aus addQuiz)
 * @param {object} questionInput - { name, questiontext, answers, correctindex, generalfeedback?, referencedActivityId? }
 */
function addQuestion(plan, quizActivityId, questionInput) {
  let sectionIndex = -1;
  let activityIndex = -1;

  plan.sections.forEach((section, si) => {
    const ai = section.activities.findIndex(a => a.id === quizActivityId);
    if (ai !== -1) {
      sectionIndex = si;
      activityIndex = ai;
    }
  });

  if (sectionIndex === -1) {
    throw new Error(`Quiz-Aktivitaet "${quizActivityId}" nicht im Plan gefunden.`);
  }

  const quizActivity = plan.sections[sectionIndex].activities[activityIndex];
  if (quizActivity.type !== 'quiz') {
    throw new Error(`Aktivitaet "${quizActivityId}" ist kein Quiz (type="${quizActivity.type}").`);
  }

  const referencedActivityId = questionInput.referencedActivityId || null;
  const referencedActivity = referencedActivityId ? findActivityById(plan, referencedActivityId) : null;
  const materialGap = !referencedActivity;

  const question = {
    id: generateQuestionId(),
    name: questionInput.name,
    questiontext: questionInput.questiontext,
    answers: questionInput.answers,
    correctindex: questionInput.correctindex,
    generalfeedback: questionInput.generalfeedback ?? '',
    referencedActivityId: referencedActivity ? referencedActivityId : null,
    materialGap,
    preview: previewMcQuestion(questionInput),
  };

  const newSections = plan.sections.map((section, si) => {
    if (si !== sectionIndex) return section;
    return {
      ...section,
      activities: section.activities.map((activity, ai) => {
        if (ai !== activityIndex) return activity;
        return { ...activity, questions: [...activity.questions, question] };
      }),
    };
  });

  const newMaterialGaps = materialGap
    ? [...plan.materialGaps, {
        quizActivityId,
        quizName: quizActivity.name,
        questionId: question.id,
        questionName: question.name,
        principle: PRINCIPLES.QUESTION_REQUIRES_REFERENCE_ACTIVITY,
      }]
    : plan.materialGaps;

  return {
    ...plan,
    sections: newSections,
    materialGaps: newMaterialGaps,
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
        ...(activity.images !== undefined ? { images: activity.images } : {}),
        ...(activity.type === 'quiz' ? {
          mode: activity.mode,
          questions: activity.questions.map(q => ({
            id: q.id,
            name: q.name,
            materialGap: q.materialGap,
            referencedActivityId: q.referencedActivityId,
            preview: q.preview,
          })),
        } : {}),
      })),
    })),
    principles: [...plan.principles],
    deviations: [...plan.deviations],
    materialGaps: [...plan.materialGaps],
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
  quiz: 'moodle_create_quiz',
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
      if (activity.type === 'quiz') {
        createArgs.mode = activity.mode;
        if (activity.gradepass !== undefined) createArgs.gradepass = activity.gradepass;
        if (activity.timelimit !== undefined) createArgs.timelimit = activity.timelimit;
      }

      const result = await client[toolName](createArgs);
      const cmid = result && result.cmid;

      if (activity.completion && activity.completion.completion > 0) {
        await client.moodle_set_completion({ cmid, ...activity.completion });
      }

      if (activity.restriction) {
        await client.moodle_set_restriction({ cmid, ...activity.restriction });
      }

      // Fragen einer Testaktivitaet (Issue #20): Fragen mit Materialluecke
      // (keine aufloesbare Bezugsaktivitaet) werden NICHT angelegt und NICHT
      // zum Quiz hinzugefuegt (CONTEXT.md "Materialluecke").
      if (activity.type === 'quiz' && activity.questions.length > 0) {
        const resolvableQuestions = activity.questions.filter(q => !q.materialGap);

        if (resolvableQuestions.length > 0) {
          const questionids = [];
          for (const question of resolvableQuestions) {
            const questionResult = await client.moodle_create_mc_question({
              categoryid: activity.categoryid,
              name: question.name,
              questiontext: question.questiontext,
              options: question.answers.map(a => a.answer),
              correctindex: question.correctindex,
              generalfeedback: question.generalfeedback,
            });
            questionids.push(questionResult && questionResult.questionid);
          }

          await client.moodle_add_questions_to_quiz({ cmid, questionids });
        }
      }

      created.push({ activityId: activity.id, name: activity.name, cmid });
    }
  }

  return { created, materialGaps: plan.materialGaps };
}

module.exports = {
  PRINCIPLES,
  DEFAULT_PRINCIPLES,
  createPlan,
  addSection,
  addActivity,
  addQuiz,
  addQuestion,
  getOverview,
  getActivityDetail,
  applyPlan,
};
