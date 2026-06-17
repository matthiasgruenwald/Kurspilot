'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { installKurspilotSkillsForProvider, SKILL_NAMES } = require('../lib/skill-install');

const REPO_ROOT = path.join(__dirname, '..');
const INSTALL_CLI = path.join(__dirname, '..', 'scripts', 'install-skills.js');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-skill-install-test-'));
}

// --- installKurspilotSkillsForProvider (lib) --------------------------------

test('installKurspilotSkillsForProvider legt alle vier Adapter + geteilten Kern in leerem Zielordner an', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  const result = installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  for (const skillName of SKILL_NAMES) {
    const skillFile = path.join(targetRoot, skillName, 'SKILL.md');
    assert.ok(fs.existsSync(skillFile), `${skillFile} sollte existieren`);
  }
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'kurspilot-core.md')));
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'SKILL.md')));
  assert.ok(result.written.length > 0);
  assert.strictEqual(result.unchanged.length, 0);
});

test('installierte SKILL.md verweist auf mitkopierten kurspilot-shared-Ordner statt auf Repo-relative Pfade', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  const installedSkill = fs.readFileSync(path.join(targetRoot, 'kurspilot', 'SKILL.md'), 'utf8');
  assert.match(installedSkill, /\.\.\/kurspilot-shared\/kurspilot-core\.md/);
  assert.match(installedSkill, /\.\.\/kurspilot-shared\/SKILL\.md/);
  assert.ok(!installedSkill.includes('../../../skills/kurspilot-core.md'));
  assert.ok(!installedSkill.includes('../../../SKILL.md'));
});

test('installKurspilotSkillsForProvider laesst fremde Skills im selben Verzeichnis unberuehrt', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  fs.mkdirSync(path.join(targetRoot, 'fremder-skill'), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md'), '---\nname: fremder-skill\n---\nFremder Inhalt');

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  const foreignContent = fs.readFileSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md'), 'utf8');
  assert.strictEqual(foreignContent, '---\nname: fremder-skill\n---\nFremder Inhalt');
});

test('installKurspilotSkillsForProvider ist idempotent: zweiter Lauf erzeugt keine Duplikate und gleichen Inhalt', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  const firstResult = installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);
  assert.ok(firstResult.written.length > 0);

  const contentsAfterFirst = {};
  for (const skillName of SKILL_NAMES) {
    contentsAfterFirst[skillName] = fs.readFileSync(path.join(targetRoot, skillName, 'SKILL.md'), 'utf8');
  }

  const secondResult = installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  assert.strictEqual(secondResult.written.length, 0, 'zweiter Lauf sollte nichts mehr schreiben (Inhalt unveraendert)');
  assert.strictEqual(secondResult.unchanged.length, firstResult.written.length);

  for (const skillName of SKILL_NAMES) {
    const contentAfterSecond = fs.readFileSync(path.join(targetRoot, skillName, 'SKILL.md'), 'utf8');
    assert.strictEqual(contentAfterSecond, contentsAfterFirst[skillName], 'Inhalt darf sich durch erneuten Lauf nicht aendern');
  }
});

test('installKurspilotSkillsForProvider fuer Codex-Quelle (.agents/skills) installiert ebenfalls alle vier Adapter', () => {
  const targetRoot = path.join(makeTmpDir(), '.codex', 'skills');

  installKurspilotSkillsForProvider(REPO_ROOT, '.agents/skills', targetRoot);

  for (const skillName of SKILL_NAMES) {
    assert.ok(fs.existsSync(path.join(targetRoot, skillName, 'SKILL.md')));
  }
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'kurspilot-core.md')));
});

// --- CLI scripts/install-skills.js (temp-HOME via --home) -------------------

test('CLI install-skills.js installiert beide Anbieter in ein temporaeres --home-Verzeichnis', () => {
  const tmpHome = makeTmpDir();

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome], { encoding: 'utf8' });

  for (const skillName of SKILL_NAMES) {
    assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', skillName, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpHome, '.codex', 'skills', skillName, 'SKILL.md')));
  }
  assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'kurspilot-shared', 'kurspilot-core.md')));
  assert.ok(fs.existsSync(path.join(tmpHome, '.codex', 'skills', 'kurspilot-shared', 'kurspilot-core.md')));
});

test('CLI install-skills.js respektiert KURSPILOT_INSTALL_HOME env-Override', () => {
  const tmpHome = makeTmpDir();

  execFileSync('node', [INSTALL_CLI, '--client', 'claude'], {
    encoding: 'utf8',
    env: { ...process.env, KURSPILOT_INSTALL_HOME: tmpHome },
  });

  assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'kurspilot', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(tmpHome, '.codex', 'skills')));
});

test('CLI install-skills.js --client claude installiert nur Claude/Cowork', () => {
  const tmpHome = makeTmpDir();

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' });

  assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'kurspilot', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(tmpHome, '.codex', 'skills')));
});

test('CLI install-skills.js bewahrt fremde Dateien im Zielverzeichnis bei wiederholtem Lauf (kein destruktives Ueberschreiben)', () => {
  const tmpHome = makeTmpDir();
  const foreignSkillDir = path.join(tmpHome, '.claude', 'skills', 'mein-anderer-skill');
  fs.mkdirSync(foreignSkillDir, { recursive: true });
  fs.writeFileSync(path.join(foreignSkillDir, 'SKILL.md'), 'Mein eigener Skill, bitte nicht anfassen.');

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' });
  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' });

  const foreignContent = fs.readFileSync(path.join(foreignSkillDir, 'SKILL.md'), 'utf8');
  assert.strictEqual(foreignContent, 'Mein eigener Skill, bitte nicht anfassen.');
});
