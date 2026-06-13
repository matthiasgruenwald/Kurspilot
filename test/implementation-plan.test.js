const { test } = require('node:test');
const assert = require('node:assert');

const {
  createPlan,
  addSection,
  addActivity,
  addQuiz,
  addQuestion,
  getOverview,
  getActivityDetail,
  applyPlan,
} = require('../lib/implementation-plan');
const { generateAltText } = require('../lib/alt-text');

test('createPlan liefert leeren Plan mit Planungsgrundsaetzen', () => {
  const plan = createPlan({ courseId: 42 });

  assert.strictEqual(plan.courseId, 42);
  assert.deepStrictEqual(plan.sections, []);
  assert.deepStrictEqual(plan.deviations, []);
  assert.ok(plan.principles.length >= 3);
  assert.ok(plan.principles.some(p => /Aufgabe ohne Abgabe/.test(p)));
  assert.ok(plan.principles.some(p => /digitale[r]? Abgabe/.test(p)));
  assert.ok(plan.principles.some(p => /Textseite/.test(p)));
});

test('addSection fuegt Abschnitt hinzu, ohne den Ursprungsplan zu veraendern', () => {
  const plan = createPlan({ courseId: 42 });
  const next = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  assert.deepStrictEqual(plan.sections, []); // Original unveraendert (Immutability)
  assert.strictEqual(next.sections.length, 1);
  assert.strictEqual(next.sections[0].sectionnum, 1);
  assert.strictEqual(next.sections[0].name, 'Unterthema A');
  assert.deepStrictEqual(next.sections[0].activities, []);
});

test('addActivity: Aufgabe ohne Abgabe als Gate -> manueller Schueler-Abschluss (kein Planabweichung)', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  plan = addActivity(plan, 1, {
    type: 'assign',
    name: 'Reflexionsauftrag',
    description: '<p>Beschreibe deine Beobachtungen.</p>',
    isGate: true,
    hasDigitalSubmission: false,
  });

  const activity = plan.sections[0].activities[0];
  assert.strictEqual(activity.type, 'assign');
  assert.strictEqual(activity.completion.completion, 1); // manueller Abschluss
  assert.strictEqual(activity.completion.completionsubmit, undefined);
  assert.deepStrictEqual(plan.deviations, []);
});

test('addActivity: Aufgabe mit digitaler Abgabe als Gate -> Abgabe-Completion (kein Planabweichung)', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  plan = addActivity(plan, 1, {
    type: 'assign',
    name: 'Arbeitsblatt hochladen',
    description: '<p>Lade dein ausgefuelltes Arbeitsblatt hoch.</p>',
    isGate: true,
    hasDigitalSubmission: true,
  });

  const activity = plan.sections[0].activities[0];
  assert.strictEqual(activity.completion.completion, 2);
  assert.strictEqual(activity.completion.completionsubmit, 1);
  assert.deepStrictEqual(plan.deviations, []);
});

test('addActivity: Textseite ohne Gate per Default (kein Planabweichung)', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Infoseite zum Thema',
    content: '<p>Hier steht ganz viel Text ueber das Thema ...</p>',
  });

  const activity = plan.sections[0].activities[0];
  assert.strictEqual(activity.completion.completion, 0);
  assert.deepStrictEqual(plan.deviations, []);
});

test('addActivity: Textseite mit explizitem Pflichtlektuere-Gate -> manueller Abschluss + Planabweichung mit Begruendung', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Pflichtlektuere: Sicherheitsregeln',
    content: '<p>Wichtige Sicherheitsregeln vor dem Praktikum.</p>',
    isGate: true,
    deviationReason: 'Pflichtlektuere zu den Sicherheitsregeln vor dem Praktikum, Verstaendnis muss vor Start sichergestellt sein.',
  });

  const activity = plan.sections[0].activities[0];
  assert.strictEqual(activity.completion.completion, 1);

  assert.strictEqual(plan.deviations.length, 1);
  const deviation = plan.deviations[0];
  assert.strictEqual(deviation.activityName, 'Pflichtlektuere: Sicherheitsregeln');
  assert.match(deviation.principle, /Textseite/);
  assert.match(deviation.reason, /Sicherheitsregeln/);
});

test('addActivity: Planabweichung ohne Begruendung wirft Fehler', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  assert.throws(() => {
    addActivity(plan, 1, {
      type: 'page',
      name: 'Pflichtlektuere ohne Begruendung',
      content: '<p>Text</p>',
      isGate: true,
      // deviationReason fehlt
    });
  }, /Begruendung/);
});

test('addActivity: Restriction abweichend vom Default (require_cmids gesetzt) -> Planabweichung', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  plan = addActivity(plan, 1, {
    type: 'assign',
    name: 'Vertiefungsaufgabe',
    description: '<p>Nur fuer schnelle Lerngruppen.</p>',
    restriction: { require_cmids: [1001], show_locked: 1 },
    deviationReason: 'Nur sichtbar fuer Lerngruppen, die die vorherige Aufgabe bereits abgeschlossen haben.',
  });

  const activity = plan.sections[0].activities[0];
  assert.deepStrictEqual(activity.restriction, { require_cmids: [1001], show_locked: 1, operator: 'AND' });

  const deviation = plan.deviations.find(d => d.activityName === 'Vertiefungsaufgabe');
  assert.ok(deviation, 'Restriction-Abweichung sollte als Planabweichung erscheinen');
  assert.match(deviation.principle, /Freigabe-Voraussetzung|Restriction/);
  assert.match(deviation.reason, /Lerngruppen/);
});

test('getOverview: Kurzuebersicht zeigt Abschnitte, Aktivitaeten, Reihenfolge, Gates und Planabweichungen ohne Volltext', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Infoseite',
    content: '<p>'.padEnd(500, 'x') + '</p>',
  });
  plan = addActivity(plan, 1, {
    type: 'assign',
    name: 'Reflexionsauftrag',
    description: '<p>Reflektiere</p>',
    isGate: true,
    hasDigitalSubmission: false,
  });

  const overview = getOverview(plan);

  assert.strictEqual(overview.courseId, 42);
  assert.strictEqual(overview.sections.length, 1);
  assert.strictEqual(overview.sections[0].name, 'Unterthema A');
  assert.strictEqual(overview.sections[0].activities.length, 2);

  const [page, assign] = overview.sections[0].activities;
  assert.strictEqual(page.name, 'Infoseite');
  assert.strictEqual(page.type, 'page');
  assert.strictEqual(page.isGate, false);
  assert.strictEqual(assign.name, 'Reflexionsauftrag');
  assert.strictEqual(assign.isGate, true);

  // Volltext darf in der Kurzuebersicht NICHT enthalten sein
  const overviewJson = JSON.stringify(overview);
  assert.ok(!overviewJson.includes('xxxxx'), 'Volltext sollte nicht in der Kurzuebersicht erscheinen');

  assert.ok(Array.isArray(overview.principles));
  assert.ok(Array.isArray(overview.deviations));
});

test('getOverview: Alt-Text-Vorschlaege fuer Fachabbildungen erscheinen vor moodle_create_page', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  const suggestion = generateAltText('materials/bio/herz_querschnitt.png', {
    altText: 'Querschnitt des menschlichen Herzens mit vier Kammern und Klappen.',
  });

  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Infoseite mit Abbildung',
    content: '<p>Hier steht die Abbildung des Herzens.</p>',
    images: [suggestion],
  });

  const overview = getOverview(plan);
  const activity = overview.sections[0].activities[0];

  assert.ok(Array.isArray(activity.images));
  assert.strictEqual(activity.images.length, 1);
  assert.strictEqual(activity.images[0].imagePath, 'materials/bio/herz_querschnitt.png');
  assert.ok(activity.images[0].altText.length > 0);
});

test('getOverview: Aktivitaeten ohne Bilder haben kein images-Feld', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Infoseite ohne Bild',
    content: '<p>Nur Text.</p>',
  });

  const overview = getOverview(plan);
  assert.strictEqual(overview.sections[0].activities[0].images, undefined);
});

test('getActivityDetail: liefert Volltext (z.B. ganze Textseite) erst auf Nachfrage', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Infoseite',
    content: '<p>Ganz viel Inhalt fuer die Textseite ...</p>',
  });

  const activityId = plan.sections[0].activities[0].id;
  const detail = getActivityDetail(plan, activityId);

  assert.strictEqual(detail.name, 'Infoseite');
  assert.strictEqual(detail.content, '<p>Ganz viel Inhalt fuer die Textseite ...</p>');
});

test('getActivityDetail: wirft Fehler bei unbekannter activityId', () => {
  const plan = createPlan({ courseId: 42 });
  assert.throws(() => getActivityDetail(plan, 'unknown-id'), /nicht gefunden/);
});

test('applyPlan: ohne Freigabe werden KEINE schreibenden Tool-Aufrufe ausgeloest', async () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Infoseite',
    content: '<p>Inhalt</p>',
  });

  const calls = [];
  const mockClient = {
    moodle_create_page: async (args) => { calls.push(['moodle_create_page', args]); return { cmid: 1 }; },
    moodle_create_assign: async (args) => { calls.push(['moodle_create_assign', args]); return { cmid: 2 }; },
    moodle_set_completion: async (args) => { calls.push(['moodle_set_completion', args]); },
    moodle_set_restriction: async (args) => { calls.push(['moodle_set_restriction', args]); },
  };

  await assert.rejects(
    () => applyPlan(plan, { approved: false, client: mockClient }),
    /Freigabe/,
  );

  assert.deepStrictEqual(calls, []);
});

test('applyPlan: nach Freigabe werden die geplanten Aktivitaeten ueber den Client erstellt', async () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Infoseite',
    content: '<p>Inhalt</p>',
  });
  plan = addActivity(plan, 1, {
    type: 'assign',
    name: 'Reflexionsauftrag',
    description: '<p>Reflektiere</p>',
    isGate: true,
    hasDigitalSubmission: false,
  });

  const calls = [];
  const mockClient = {
    moodle_create_page: async (args) => { calls.push(['moodle_create_page', args]); return { cmid: 1 }; },
    moodle_create_assign: async (args) => { calls.push(['moodle_create_assign', args]); return { cmid: 2 }; },
    moodle_set_completion: async (args) => { calls.push(['moodle_set_completion', args]); },
    moodle_set_restriction: async (args) => { calls.push(['moodle_set_restriction', args]); },
  };

  const result = await applyPlan(plan, { approved: true, client: mockClient });

  const calledTools = calls.map(([toolName]) => toolName);
  assert.ok(calledTools.includes('moodle_create_page'));
  assert.ok(calledTools.includes('moodle_create_assign'));
  assert.ok(calledTools.includes('moodle_set_completion'));
  assert.strictEqual(result.created.length, 2);
});

// ─────────────────────────────────────────────────────────────
// addQuiz / addQuestion / Materialluecken (Issue #20)
// ─────────────────────────────────────────────────────────────

const SAMPLE_QUESTION = {
  name: 'Hauptstadt Frankreich',
  questiontext: 'Was ist die Hauptstadt von Frankreich?',
  answers: [
    { answer: 'Paris', fraction: 1.0 },
    { answer: 'Berlin', fraction: 0.0 },
  ],
  correctindex: 0,
  generalfeedback: 'Schau nochmal in die Textseite "Hauptstaedte Europas".',
};

test('addQuiz: Default ist Lerncheck-Modus + Bestehensabschluss, keine Planabweichung', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addQuiz(plan, 1, { name: 'Lerncheck Hauptstaedte' });

  const quiz = plan.sections[0].activities[0];
  assert.strictEqual(quiz.type, 'quiz');
  assert.strictEqual(quiz.mode, 'lerncheck');
  assert.deepStrictEqual(quiz.completion, { completion: 2, completionpassgrade: 1 });
  assert.deepStrictEqual(quiz.questions, []);
  assert.deepStrictEqual(plan.deviations, []);
});

test('addQuiz: abweichender Modus (Bewertungsmodus) ohne deviationReason wirft Fehler', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });

  assert.throws(
    () => addQuiz(plan, 1, { name: 'Bewertungstest', mode: 'bewertung' }),
    /Planabweichung/,
  );
});

test('addQuiz: abweichender Modus (Bewertungsmodus) mit deviationReason -> Planabweichung mit Lerncheck-Default-Begruendung', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addQuiz(plan, 1, {
    name: 'Bewertungstest',
    mode: 'bewertung',
    deviationReason: 'Notenrelevanter Test, ein Versuch.',
  });

  const quiz = plan.sections[0].activities[0];
  assert.strictEqual(quiz.mode, 'bewertung');
  assert.strictEqual(plan.deviations.length, 1);
  assert.match(plan.deviations[0].principle, /Lerncheck-Modus/);
  assert.strictEqual(plan.deviations[0].reason, 'Notenrelevanter Test, ein Versuch.');
});

test('addQuestion: mit aufloesbarer Bezugsaktivitaet -> kein Materialluecke, Vorschau (#14) vorhanden', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Hauptstaedte Europas',
    content: '<p>Paris ist die Hauptstadt von Frankreich.</p>',
  });
  const pageId = plan.sections[0].activities[0].id;
  plan = addQuiz(plan, 1, { name: 'Lerncheck Hauptstaedte', categoryid: 7 });
  const quizId = plan.sections[0].activities[1].id;

  plan = addQuestion(plan, quizId, { ...SAMPLE_QUESTION, referencedActivityId: pageId });

  const quiz = plan.sections[0].activities[1];
  assert.strictEqual(quiz.questions.length, 1);
  assert.strictEqual(quiz.questions[0].materialGap, false);
  assert.strictEqual(quiz.questions[0].referencedActivityId, pageId);
  assert.strictEqual(quiz.questions[0].preview.questiontext, SAMPLE_QUESTION.questiontext);
  assert.deepStrictEqual(plan.materialGaps, []);
});

test('addQuestion: ohne aufloesbare Bezugsaktivitaet -> Materialluecke markiert', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addQuiz(plan, 1, { name: 'Lerncheck Hauptstaedte', categoryid: 7 });
  const quizId = plan.sections[0].activities[0].id;

  plan = addQuestion(plan, quizId, SAMPLE_QUESTION);

  const quiz = plan.sections[0].activities[0];
  assert.strictEqual(quiz.questions[0].materialGap, true);
  assert.strictEqual(quiz.questions[0].referencedActivityId, null);
  assert.strictEqual(plan.materialGaps.length, 1);
  assert.strictEqual(plan.materialGaps[0].questionName, SAMPLE_QUESTION.name);
  assert.match(plan.materialGaps[0].principle, /Bezugsaktivitaet/);

  const overview = getOverview(plan);
  assert.strictEqual(overview.materialGaps.length, 1);
  assert.strictEqual(overview.sections[0].activities[0].questions[0].materialGap, true);
});

test('addQuestion: wirft Fehler bei unbekannter oder nicht-Quiz-Aktivitaet', () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addActivity(plan, 1, { type: 'page', name: 'Infoseite', content: '<p>x</p>' });
  const pageId = plan.sections[0].activities[0].id;

  assert.throws(() => addQuestion(plan, 'unbekannt', SAMPLE_QUESTION), /nicht im Plan gefunden/);
  assert.throws(() => addQuestion(plan, pageId, SAMPLE_QUESTION), /ist kein Quiz/);
});

test('applyPlan: Materialluecken-Frage wird NICHT angelegt, aufloesbare Frage wird angelegt und zum Quiz hinzugefuegt', async () => {
  let plan = createPlan({ courseId: 42 });
  plan = addSection(plan, { sectionnum: 1, name: 'Unterthema A' });
  plan = addActivity(plan, 1, {
    type: 'page',
    name: 'Hauptstaedte Europas',
    content: '<p>Paris ist die Hauptstadt von Frankreich.</p>',
  });
  const pageId = plan.sections[0].activities[0].id;
  plan = addQuiz(plan, 1, { name: 'Lerncheck Hauptstaedte', categoryid: 7 });
  const quizId = plan.sections[0].activities[1].id;

  plan = addQuestion(plan, quizId, { ...SAMPLE_QUESTION, referencedActivityId: pageId });
  plan = addQuestion(plan, quizId, {
    ...SAMPLE_QUESTION,
    name: 'Frage ohne Material',
    questiontext: 'Frage ohne Bezugsaktivitaet?',
  });

  const calls = [];
  const mockClient = {
    moodle_create_page: async () => ({ cmid: 1 }),
    moodle_create_quiz: async (args) => { calls.push(['moodle_create_quiz', args]); return { cmid: 2 }; },
    moodle_create_mc_question: async (args) => { calls.push(['moodle_create_mc_question', args]); return { questionid: 99 }; },
    moodle_add_questions_to_quiz: async (args) => { calls.push(['moodle_add_questions_to_quiz', args]); },
    moodle_set_completion: async (args) => { calls.push(['moodle_set_completion', args]); },
    moodle_set_restriction: async () => {},
  };

  const result = await applyPlan(plan, { approved: true, client: mockClient });

  const createCalls = calls.filter(([toolName]) => toolName === 'moodle_create_mc_question');
  assert.strictEqual(createCalls.length, 1);
  assert.strictEqual(createCalls[0][1].name, SAMPLE_QUESTION.name);

  const addCalls = calls.filter(([toolName]) => toolName === 'moodle_add_questions_to_quiz');
  assert.strictEqual(addCalls.length, 1);
  assert.deepStrictEqual(addCalls[0][1].questionids, [99]);

  assert.strictEqual(result.materialGaps.length, 1);
  assert.strictEqual(result.materialGaps[0].questionName, 'Frage ohne Material');
});
