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
      assert.match(metadata.description, new RegExp(skillName));
      assert.match(markdown, /skills\/kurspilot-core\.md/);
    }
  }
});

test('Kurspilot core documents routing modes, package boundary, and installer prerequisites', () => {
  const core = read('skills/kurspilot-core.md');

  for (const skillName of skillNames) {
    assert.match(core, new RegExp(`\\\`${skillName}\\\``));
  }

  assert.match(core, /Kanonischer Kurspilot-Kern/);
  assert.match(core, /Anbieter-Adapter/);
  assert.match(core, /MCP-Server-Konfiguration/);
  assert.match(core, /Moodle-Token/);
  assert.match(core, /ImageMagick/);
  assert.match(core, /kein separates `kurspilot-fortsetzen`/);
  assert.match(core, /kein separates `kurspilot-materialien`/);
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
  const skill = read('SKILL.md');

  assert.match(core, /Planstrenge/);
  assert.match(core, /keine ungefragten Extras/);
  assert.match(core, /neue sichtbare Elemente, Aktivitaeten, Materialien, Dateien, Bewertungen oder Kurslogik/);
  assert.match(core, /Planoption benannt oder rueckgefragt/);

  for (const providerRoot of providerRoots) {
    for (const skillName of skillNames) {
      const markdown = read(path.join(providerRoot, skillName, 'SKILL.md'));

      assert.match(markdown, /Planstrenge/);
      assert.match(markdown, /keine\s+ungefragten\s+Extras/);
      assert.doesNotMatch(markdown, /Halte dabei Planstrenge ein und fuege keine ungefragten Extras hinzu\./);
    }
  }

  assert.match(readme, /Planstrenge/);
  assert.doesNotMatch(readme, /Aufgaben mit PDF-Druckbutton/);

  assert.match(skill, /Planstrenge/);
  assert.doesNotMatch(skill, /Aufgabe anlegen \(mit PDF-Button\)/);
  assert.doesNotMatch(skill, /PFLICHT: Jede Aufgabe bekommt PDF-Banner oben und Abgabe-Hinweis unten\./);
});

test('Kurspilot package docs keep Allgemeines fachlich and out of process storage, and integration examples avoid section 0 defaults', () => {
  const core = read('skills/kurspilot-core.md');
  const readme = read('README.md');
  const skill = read('SKILL.md');
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

  assert.match(skill, /Abschnitt 0/i);
  assert.match(skill, /Allgemeines/i);
  assert.match(skill, /normaler fachlicher/i);
  assert.match(skill, /Kursabschnitt/i);
  assert.match(skill, /nicht automatisch|kein automatischer Default/i);
  assert.doesNotMatch(skill, /Freien Abschnitt waehlen\./);

  for (const relativePath of integrationFiles) {
    const integrationTest = read(relativePath);
    assert.doesNotMatch(integrationTest, /sectionnum:\s*0/);
  }
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
