const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');
const skillNames = ['kurspilot', 'kurspilot-einrichten', 'kurspilot-planen', 'kurspilot-umsetzen'];
const providerRoots = ['.agents/skills', '.claude/skills'];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'skill has YAML frontmatter');

  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => line.match(/^([^:]+):\s*(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1].trim(), match[2].trim().replace(/^"|"$/g, '')])
  );
}

test('Kurspilot skill adapters exist for Codex and Claude with teacher-facing names', () => {
  for (const providerRoot of providerRoots) {
    for (const skillName of skillNames) {
      const relativePath = path.join(providerRoot, skillName, 'SKILL.md');
      const markdown = read(relativePath);
      const metadata = frontmatter(markdown);

      assert.equal(metadata.name, skillName);
      assert.match(metadata.description, /Kurspilot/);
      assert.doesNotMatch(metadata.description, new RegExp(skillName));
      assert.match(markdown, /skills\/kurspilot-core\.md/);
    }
  }
});

test('Kurspilot adapter descriptions lead with a Leitbegriff, use real teacher trigger phrases, and match across providers', () => {
  const knownTeacherTriggers = [
    'Setze meine Planung fuer 7a Nawi fort.',
    'Mach mit Bio weiter.',
    'Richte mir den Moodle-Zugang fuer meine 7a in Naturwissenschaften ein.',
    'Ich will Kurspilot zum ersten Mal fuer meine Klasse nutzen.',
    'Baue in Kurs 42 die Unterrichtseinheit zum Thema Stromkreise auf.',
    'Plane den Abschnitt fuer',
    'Erstelle mir einen Implementierungsplan fuer',
    'ja, so umsetzen',
    'Plan ist gut, leg los',
    'freigegeben',
  ];

  for (const skillName of skillNames) {
    const descriptions = providerRoots.map(
      (providerRoot) => frontmatter(read(path.join(providerRoot, skillName, 'SKILL.md'))).description
    );

    assert.equal(
      descriptions[0],
      descriptions[1],
      `${skillName}: Codex- und Claude-Adapter-Description muessen inhaltsgleich sein`
    );

    const description = descriptions[0];
    assert.match(description, /^[A-ZÄÖÜ][\wÄÖÜäöüß-]*[.:]/, `${skillName}: Description beginnt nicht mit einem Leitbegriff`);

    const usedTriggers = knownTeacherTriggers.filter((trigger) => description.includes(trigger));
    assert.ok(usedTriggers.length > 0, `${skillName}: Description enthaelt keine bekannte Lehrkraft-Startformulierung`);
    assert.equal(
      usedTriggers.length,
      new Set(usedTriggers).size,
      `${skillName}: Trigger duerfen nicht doppelt vorkommen`
    );
  }
});

test('Kurspilot core documents routing modes and package boundary, without deployment knowledge', () => {
  const core = read('skills/kurspilot-core.md');
  const readme = read('README.md');

  for (const skillName of skillNames) {
    assert.match(core, new RegExp(`\\\`${skillName}\\\``));
  }

  assert.match(core, /Kanonischer Kurspilot-Kern/);
  assert.match(core, /Anbieter-Adapter/);
  assert.match(core, /kein separates `kurspilot-fortsetzen`/);
  assert.match(core, /kein separates `kurspilot-materialien`/);

  // Deployment-/Paketwissen (MCP-Server-Setup, Token-Ablage, Zusatztool)
  // gehoert in die Repo-Dokumentation, nicht in den Kern.
  assert.doesNotMatch(core, /MCP-Server-Konfiguration/);
  assert.doesNotMatch(core, /Moodle-Token als lokales Geheimnis/);
  assert.match(core, /README\.md/);

  assert.match(readme, /MCP-Server/);
  assert.match(readme, /Moodle-Token/);
  assert.match(readme, /ImageMagick/);
  assert.match(readme, /#5/);
});

test('Kurspilot core keeps planning in the main session and delegates Moodle writes after approval', () => {
  const core = read('skills/kurspilot-core.md');

  assert.match(core, /Hauptsession/);
  assert.match(core, /Schreibzugriffe/);
  assert.match(core, /delegiert/);
  assert.match(core, /freigegebenen Auftrag/);
  assert.match(core, /keine Neuplanung/);
  assert.match(core, /Status\/Journal/);
  assert.match(core, /Vorschau\/Freigabe/);
  assert.match(core, /Tests sind\s+Sicherheitsgurte/);
});

test('Kurspilot core makes Werkzeugluecken explizit und fordert manuelle Moodle-Schritte an', () => {
  const core = read('skills/kurspilot-core.md');

  assert.match(core, /Werkzeugluecke/);
  assert.match(core, /Aktivitaetsregister/);
  assert.match(core, /manuelle Moodle-Schritte|Moodle-Oberflaeche/);
  assert.match(core, /Aktivitaet oder Material anlegen/);
  assert.match(core, /statt zu verschweigen|nicht stillschweigend/);
});

test('Kurspilot entry establishes one adaptive local context permission handoff', () => {
  const core = read('skills/kurspilot-core.md');

  assert.match(core, /Kontextfreigabe/);
  assert.match(core, /einmal pro\s+Arbeitssitzung/);
  assert.match(core, /Unterrichtsvorhaben/);
  assert.match(core, /Unterrichtsordner/);
  assert.match(core, /Lerngruppenprofil/);
  assert.match(core, /relevante Elternkontexte/);
  assert.match(core, /Schreiben bleibt enger/);
  assert.match(core, /Moodle-Schreibfreigabe bleibt getrennt/);
});

test('Kurspilot package docs enforce Planstrenge and remove legacy automatic extras', () => {
  const core = read('skills/kurspilot-core.md');
  const readme = read('README.md');
  const workflow = read('skills/implementierungsplan-workflow.md');
  const htmlVorlagen = read('skills/html-vorlagen.md');

  assert.match(core, /Planstrenge/);
  assert.match(core, /keine ungefragten Extras/);
  assert.match(core, /neue sichtbare Elemente, Aktivitaeten, Materialien, Dateien, Bewertungen oder Kurslogik/);
  assert.match(core, /Planoption benannt oder rueckgefragt/);

  for (const providerRoot of providerRoots) {
    for (const skillName of skillNames) {
      const markdown = read(path.join(providerRoot, skillName, 'SKILL.md'));

      assert.match(markdown, /Planstrenge/);
      assert.doesNotMatch(markdown, /Halte dabei Planstrenge ein und fuege keine ungefragten Extras hinzu\./);
    }
  }

  assert.match(readme, /Planstrenge/);
  assert.doesNotMatch(readme, /Aufgaben mit PDF-Druckbutton/);

  assert.match(workflow, /Planstrenge/);
  assert.match(htmlVorlagen, /Planstrenge/);
  assert.doesNotMatch(htmlVorlagen, /Aufgabe anlegen \(mit PDF-Button\)/);
  assert.doesNotMatch(htmlVorlagen, /PFLICHT: Jede Aufgabe bekommt PDF-Banner oben und Abgabe-Hinweis unten\./);
});

test('Kurspilot adapters reference Planstrenge and Arbeitsbereich-Regel as named anchor terms only, without restating the rule', () => {
  const restatedRulePatterns = [
    /keine\s+ungefragten\s+Extras/,
    /nur\s+als\s+Planoption/,
    /gespeicherten?\s+Arbeitsbereich-Einstellung/,
    /Konfigurationsprogramm/,
  ];

  for (const providerRoot of providerRoots) {
    for (const skillName of skillNames) {
      const markdown = read(path.join(providerRoot, skillName, 'SKILL.md'));

      assert.match(markdown, /Planstrenge/, `${skillName} (${providerRoot}): referenziert Planstrenge nicht`);
      assert.match(
        markdown,
        /Arbeitsbereich-Regel/,
        `${skillName} (${providerRoot}): referenziert Arbeitsbereich-Regel nicht`
      );

      for (const pattern of restatedRulePatterns) {
        assert.doesNotMatch(
          markdown,
          pattern,
          `${skillName} (${providerRoot}): formuliert die Regel aus, statt nur den Begriff zu referenzieren (${pattern})`
        );
      }
    }
  }
});

test('Kurspilot core defines Planstrenge and Arbeitsbereich-Regel exactly once as named anchor terms', () => {
  const core = read('skills/kurspilot-core.md');

  assert.match(core, /## Ankerbegriffe/);

  const planstrengeHeadings = core.match(/^### Planstrenge$/gm) || [];
  const arbeitsbereichHeadings = core.match(/^### Arbeitsbereich-Regel$/gm) || [];

  assert.equal(planstrengeHeadings.length, 1, 'Planstrenge muss genau einmal als Ankerbegriff definiert sein');
  assert.equal(
    arbeitsbereichHeadings.length,
    1,
    'Arbeitsbereich-Regel muss genau einmal als Ankerbegriff definiert sein'
  );

  // Die ausformulierte Planstrenge-Regel ("keine ungefragten Extras ...") darf nur an einer
  // Stelle im Kern stehen; ueberall sonst wird nur der Begriff referenziert.
  const fullPlanstrengeRestatements = core.match(/keine ungefragten Extras/g) || [];
  assert.equal(fullPlanstrengeRestatements.length, 1, 'Planstrenge-Volltext darf nur einmal im Kern vorkommen');
});

test('Kurspilot package docs keep Allgemeines fachlich and out of process storage, and integration examples avoid section 0 defaults', () => {
  const core = read('skills/kurspilot-core.md');
  const readme = read('README.md');
  const workflow = read('skills/implementierungsplan-workflow.md');
  const htmlVorlagen = read('skills/html-vorlagen.md');
  const integrationFiles = [
    'test/integration/create_quiz.integration.test.js',
    'test/integration/quiz-modes.integration.test.js',
    'test/integration/quiz-completion-restriction.integration.test.js',
    'test/integration/add-questions-to-quiz.integration.test.js',
  ];

  assert.match(core, /Abschnitt 0/i);
  assert.match(core, /Allgemeines/i);
  assert.match(core, /normaler fachlicher/i);
  assert.match(core, /Kursabschnitt/i);
  assert.match(core, /Prozessdaten[\s\S]*local-context/i);

  assert.match(readme, /Abschnitt 0/i);
  assert.match(readme, /Allgemeines/i);
  assert.match(readme, /normaler fachlicher/i);
  assert.match(readme, /Kursabschnitt/i);
  assert.match(readme, /Prozessdaten[\s\S]*local-context/i);

  assert.match(workflow, /Abschnitt 0/i);
  assert.match(workflow, /Allgemeines/i);
  assert.match(workflow, /normaler fachlicher/i);
  assert.match(workflow, /Kursabschnitt/i);
  assert.match(workflow, /nicht automatisch|kein automatischer Default/i);
  assert.doesNotMatch(workflow, /Freien Abschnitt waehlen\./);
  assert.doesNotMatch(htmlVorlagen, /Freien Abschnitt waehlen\./);

  for (const relativePath of integrationFiles) {
    const integrationTest = read(relativePath);
    assert.doesNotMatch(integrationTest, /sectionnum:\s*0/);
  }
});

test('Kurspilot package docs define KURSPILOT.md as Wegweiser to Startkontext only', () => {
  const core = read('skills/kurspilot-core.md');
  const readme = read('README.md');
  const context = read('CONTEXT.md');
  const skill = read('skills/kontext-onboarding.md');

  for (const markdown of [core, readme, context, skill]) {
    assert.match(markdown, /`KURSPILOT\.md`/);
    assert.match(markdown, /Wegweiser/);
    assert.match(markdown, /Startkontext/);
    assert.match(markdown, /nicht[\s\S]*Index[\s\S]*Kind|kein[\s\S]*Index[\s\S]*Kind/i);
    assert.match(markdown, /`plan\.md`[\s\S]*`status\.md`[\s\S]*Journal[\s\S]*Materialnotizen[\s\S]*nicht[\s\S]*Materialordner/i);
  }

  assert.match(core, /bestehenden\s+lokalen\s+Kurspilot-Kontext[\s\S]*vor Planung oder Umsetzung/i);
});

test('README documents fresh-session setup for both skill providers and MCP prerequisites', () => {
  const readme = read('README.md');

  assert.match(readme, /Fuer Lehrkraefte ist \*\*Kurspilot\*\* der sichtbare Name der Skill-Familie/);
  assert.match(readme, /`kurspilot`:/);
  assert.match(readme, /`kurspilot-einrichten`:/);
  assert.match(readme, /`kurspilot-planen`:/);
  assert.match(readme, /`kurspilot-umsetzen`:/);
  assert.match(readme, /kein separates `kurspilot-fortsetzen`/);
  assert.match(readme, /kein separates\s+`kurspilot-materialien`/);
  assert.match(readme, /\.agents\/skills/);
  assert.match(readme, /\.claude\/skills/);
  assert.match(readme, /neuen Codex-Thread/);
  assert.match(readme, /Claude Code neu starten/);
  assert.match(readme, /MCP-Server/);
  assert.match(readme, /Moodle-Token/);
  assert.match(readme, /ImageMagick/);
  assert.match(readme, /#5/);
});

test('Kurspilot skillset has no reference left to the retired legacy Langfassung (Issue #160)', () => {
  assert.ok(
    !fs.existsSync(path.join(repoRoot, 'SKILL.md')),
    'Repo-Root SKILL.md (historische Langfassung) wurde entfernt und auf Referenzdateien unter skills/ verteilt'
  );

  const filesToCheck = [
    'skills/kurspilot-core.md',
    'README.md',
    'CONTEXT.md',
    ...providerRoots.flatMap((providerRoot) => skillNames.map((skillName) => path.join(providerRoot, skillName, 'SKILL.md'))),
  ];

  for (const relativePath of filesToCheck) {
    const markdown = read(relativePath);
    assert.doesNotMatch(
      markdown,
      /historische Langfassung/i,
      `${relativePath}: verweist noch auf die historische Langfassung`
    );
    assert.doesNotMatch(
      markdown,
      /\.\.\/\.\.\/\.\.\/SKILL\.md/,
      `${relativePath}: verweist noch relativ auf die Repo-Root SKILL.md`
    );
    assert.doesNotMatch(
      markdown,
      /legacy-kurspilot/i,
      `${relativePath}: verweist noch auf legacy-kurspilot.md`
    );
  }
});
