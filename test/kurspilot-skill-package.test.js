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

test('README documents fresh-session setup for both skill providers and MCP prerequisites', () => {
  const readme = read('README.md');

  assert.match(readme, /\.agents\/skills/);
  assert.match(readme, /\.claude\/skills/);
  assert.match(readme, /neuen Codex-Thread/);
  assert.match(readme, /Claude Code neu starten/);
  assert.match(readme, /MCP-Server/);
  assert.match(readme, /Moodle-Token/);
  assert.match(readme, /ImageMagick/);
  assert.match(readme, /#5/);
});
