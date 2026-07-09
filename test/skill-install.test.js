'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  installKurspilotSkillsForProvider,
  removeKurspilotSkillsForProvider,
  cleanLegacyCodexSkills,
  installKurspilotSkillsAliasForClaude,
  checkAliasIntegrity,
  classifyRealDir,
  removeAliasLinksInTarget,
  SKILL_NAMES,
  ALIAS_DIRS,
} = require('../lib/skill-install');

const REPO_ROOT = path.join(__dirname, '..');
const INSTALL_CLI = path.join(__dirname, '..', 'scripts', 'install-skills.js');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kurspilot-skill-install-test-'));
}

function makeSkillPackage() {
  const repoRoot = makeTmpDir();
  const providerRoot = path.join(repoRoot, '.claude', 'skills');

  for (const skillName of SKILL_NAMES) {
    const skillDir = path.join(providerRoot, skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      `---\nname: ${skillName}\n---\nCore ../../../skills/kurspilot-core.md\n`
    );
  }

  fs.mkdirSync(path.join(repoRoot, 'skills'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-core.md'), 'Core v1\n');

  return { repoRoot, providerRoot };
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
  assert.ok(!fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'SKILL.md')));
  assert.ok(result.written.length > 0);
  assert.strictEqual(result.unchanged.length, 0);
});

test('installKurspilotSkillsForProvider speichert Metadaten fuer verwaltete Kurspilot-Dateien', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  const manifestPath = path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.strictEqual(manifest.managedBy, 'kurspilot');
  assert.ok(manifest.files['kurspilot/SKILL.md'].sha256);
  assert.ok(manifest.files['kurspilot-shared/kurspilot-core.md'].sha256);
});

test('installKurspilotSkillsForProvider aktualisiert unveraenderte verwaltete Kurspilot-Skills aus dem Paket', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  fs.writeFileSync(path.join(providerRoot, 'kurspilot', 'SKILL.md'), '---\nname: kurspilot\n---\nPaket v2\n');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(
    fs.readFileSync(path.join(targetRoot, 'kurspilot', 'SKILL.md'), 'utf8'),
    '---\nname: kurspilot\n---\nPaket v2\n'
  );
  assert.ok(result.written.includes(path.join(targetRoot, 'kurspilot', 'SKILL.md')));
});

test('installKurspilotSkillsForProvider warnt und bricht bei lokal veraenderten verwalteten Skills ab', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const targetSkill = path.join(targetRoot, 'kurspilot', 'SKILL.md');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  fs.writeFileSync(targetSkill, 'Lokale Aenderung, nicht ueberschreiben\n');
  fs.writeFileSync(path.join(providerRoot, 'kurspilot', 'SKILL.md'), '---\nname: kurspilot\n---\nPaket v2\n');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, true);
  assert.deepStrictEqual(result.conflicts, ['kurspilot/SKILL.md']);
  assert.match(result.warnings[0], /lokal verändert/);
  assert.strictEqual(fs.readFileSync(targetSkill, 'utf8'), 'Lokale Aenderung, nicht ueberschreiben\n');
});

test('installKurspilotSkillsForProvider bricht bei vorhandenem abweichendem Skill ohne Manifest ab', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const targetSkill = path.join(targetRoot, 'kurspilot', 'SKILL.md');
  fs.mkdirSync(path.dirname(targetSkill), { recursive: true });
  fs.writeFileSync(targetSkill, 'Lokale Aenderung vor Manifest\n');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, true);
  assert.deepStrictEqual(result.conflicts, ['kurspilot/SKILL.md']);
  assert.match(result.warnings[0], /lokal verändert/);
  assert.strictEqual(fs.readFileSync(targetSkill, 'utf8'), 'Lokale Aenderung vor Manifest\n');
});

test('installKurspilotSkillsForProvider schreibt Manifest nach, wenn vorhandener Skill ohne Manifest identisch ist', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  fs.rmSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json'));

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, false);
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json')));
});

test('installierte SKILL.md verweist auf mitkopierten kurspilot-shared-Ordner statt auf Repo-relative Pfade', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  const installedSkill = fs.readFileSync(path.join(targetRoot, 'kurspilot', 'SKILL.md'), 'utf8');
  assert.match(installedSkill, /\.\.\/kurspilot-shared\/kurspilot-core\.md/);
  assert.ok(!installedSkill.includes('../../../skills/kurspilot-core.md'));
});

test('installKurspilotSkillsForProvider entfernt obsolete indexierbare Shared-SKILL.md', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const obsoleteSkill = path.join(targetRoot, 'kurspilot-shared', 'SKILL.md');
  fs.mkdirSync(path.dirname(obsoleteSkill), { recursive: true });
  fs.writeFileSync(obsoleteSkill, '---\nname: kurspilot\n---\nAlt');

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  assert.ok(!fs.existsSync(obsoleteSkill));
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'kurspilot-core.md')));
});

test('installKurspilotSkillsForProvider laesst fremde und separat benannte eigene Skills unberuehrt', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  fs.mkdirSync(path.join(targetRoot, 'fremder-skill'), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md'), '---\nname: fremder-skill\n---\nFremder Inhalt');
  fs.mkdirSync(path.join(targetRoot, 'kurspilot-mein-eigener-skill'), { recursive: true });
  fs.writeFileSync(
    path.join(targetRoot, 'kurspilot-mein-eigener-skill', 'SKILL.md'),
    'Mein eigener Kurspilot-Skill'
  );

  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);

  const foreignContent = fs.readFileSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md'), 'utf8');
  assert.strictEqual(foreignContent, '---\nname: fremder-skill\n---\nFremder Inhalt');
  const ownContent = fs.readFileSync(path.join(targetRoot, 'kurspilot-mein-eigener-skill', 'SKILL.md'), 'utf8');
  assert.strictEqual(ownContent, 'Mein eigener Kurspilot-Skill');
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

test('installKurspilotSkillsForProvider fuer Codex-Quelle (.agents/skills) installiert alle vier Adapter nach ~/.agents/skills', () => {
  const targetRoot = path.join(makeTmpDir(), '.agents', 'skills');

  installKurspilotSkillsForProvider(REPO_ROOT, '.agents/skills', targetRoot);

  for (const skillName of SKILL_NAMES) {
    assert.ok(fs.existsSync(path.join(targetRoot, skillName, 'SKILL.md')));
  }
  assert.ok(fs.existsSync(path.join(targetRoot, 'kurspilot-shared', 'kurspilot-core.md')));
});

// --- dynamische Shared-Dateiliste (Issue #157) ------------------------------

test('installKurspilotSkillsForProvider kopiert neue Datei im gemeinsamen Quellordner ohne Installer-Code-Aenderung', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-neu.md'), 'Neuer gemeinsamer Inhalt\n');
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  const targetFile = path.join(targetRoot, 'kurspilot-shared', 'kurspilot-neu.md');
  assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'Neuer gemeinsamer Inhalt\n');
  assert.ok(result.written.includes(targetFile));

  const manifest = JSON.parse(
    fs.readFileSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json'), 'utf8')
  );
  assert.ok(manifest.files['kurspilot-shared/kurspilot-neu.md'].sha256);
});

test('installKurspilotSkillsForProvider entfernt Ziel und Manifest-Eintrag fuer im Quellordner geloeschte Datei', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-temp.md'), 'Temp\n');
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  const targetFile = path.join(targetRoot, 'kurspilot-shared', 'kurspilot-temp.md');
  assert.ok(fs.existsSync(targetFile));

  fs.rmSync(path.join(repoRoot, 'skills', 'kurspilot-temp.md'));
  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.ok(!fs.existsSync(targetFile), 'verwaiste Zieldatei sollte entfernt sein');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json'), 'utf8')
  );
  assert.ok(!manifest.files['kurspilot-shared/kurspilot-temp.md'], 'verwaister Manifest-Eintrag sollte fehlen');
});

test('installKurspilotSkillsForProvider bricht weiterhin ab, wenn eine dynamisch verteilte Shared-Datei lokal veraendert wurde', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-neu.md'), 'Original\n');
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  const targetFile = path.join(targetRoot, 'kurspilot-shared', 'kurspilot-neu.md');
  fs.writeFileSync(targetFile, 'Lokal veraendert\n');
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-neu.md'), 'Update aus Paket\n');

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, true);
  assert.ok(result.conflicts.includes('kurspilot-shared/kurspilot-neu.md'));
  assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'Lokal veraendert\n');
});

test('installKurspilotSkillsForProvider bricht ab statt eine lokal veraenderte verwaiste Datei zu loeschen', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  fs.writeFileSync(path.join(repoRoot, 'skills', 'kurspilot-temp.md'), 'Temp\n');
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);
  const targetFile = path.join(targetRoot, 'kurspilot-shared', 'kurspilot-temp.md');
  assert.ok(fs.existsSync(targetFile));

  fs.writeFileSync(targetFile, 'Lokal veraendert, sollte nicht geloescht werden\n');
  fs.rmSync(path.join(repoRoot, 'skills', 'kurspilot-temp.md'));

  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, targetRoot);

  assert.strictEqual(result.aborted, true);
  assert.ok(result.conflicts.includes('kurspilot-shared/kurspilot-temp.md'));
  assert.ok(fs.existsSync(targetFile), 'lokal veraenderte verwaiste Datei darf nicht geloescht werden');
  assert.strictEqual(fs.readFileSync(targetFile, 'utf8'), 'Lokal veraendert, sollte nicht geloescht werden\n');

  const manifest = JSON.parse(
    fs.readFileSync(path.join(targetRoot, 'kurspilot-shared', 'managed-skills.json'), 'utf8')
  );
  assert.ok(manifest.files['kurspilot-shared/kurspilot-temp.md'], 'Manifest-Eintrag bleibt bei Abbruch erhalten');
});

// --- removeKurspilotSkillsForProvider ---------------------------------------

test('removeKurspilotSkillsForProvider entfernt alle vier Adapter + kurspilot-shared, fremde Skills bleiben', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');
  installKurspilotSkillsForProvider(REPO_ROOT, '.claude/skills', targetRoot);
  fs.mkdirSync(path.join(targetRoot, 'fremder-skill'), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md'), 'Fremder Inhalt');

  const result = removeKurspilotSkillsForProvider(targetRoot);

  for (const skillName of SKILL_NAMES) {
    assert.ok(!fs.existsSync(path.join(targetRoot, skillName)), `${skillName} sollte entfernt sein`);
  }
  assert.ok(!fs.existsSync(path.join(targetRoot, 'kurspilot-shared')));
  assert.ok(fs.existsSync(path.join(targetRoot, 'fremder-skill', 'SKILL.md')), 'fremder Skill muss erhalten bleiben');
  assert.ok(result.removed.length > 0);
});

test('removeKurspilotSkillsForProvider ist No-Op, wenn nichts installiert war', () => {
  const targetRoot = path.join(makeTmpDir(), '.claude', 'skills');

  const result = removeKurspilotSkillsForProvider(targetRoot);

  assert.deepStrictEqual(result.removed, []);
});

// --- CLI scripts/install-skills.js (temp-HOME via --home) -------------------

test('CLI install-skills.js installiert beide Anbieter in ein temporaeres --home-Verzeichnis', () => {
  const tmpHome = makeTmpDir();

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome], { encoding: 'utf8' });

  for (const skillName of SKILL_NAMES) {
    assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', skillName, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpHome, '.agents', 'skills', skillName, 'SKILL.md')));
  }
  assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'kurspilot-shared', 'kurspilot-core.md')));
  assert.ok(fs.existsSync(path.join(tmpHome, '.agents', 'skills', 'kurspilot-shared', 'kurspilot-core.md')));
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

test('CLI install-skills.js --client claude installiert nur Claude', () => {
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

// --- cleanLegacyCodexSkills (Alt-Ort ~/.codex/skills aufräumen) -------------

test('cleanLegacyCodexSkills entfernt unveraenderte Kurspilot-Ordner am Alt-Ort', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const legacyRoot = path.join(makeTmpDir(), '.codex', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, legacyRoot);
  assert.ok(fs.existsSync(path.join(legacyRoot, 'kurspilot', 'SKILL.md')));

  const result = cleanLegacyCodexSkills(legacyRoot);

  assert.ok(result.removed.length > 0);
  assert.deepStrictEqual(result.conflicts, []);
  for (const skillName of SKILL_NAMES) {
    assert.ok(!fs.existsSync(path.join(legacyRoot, skillName)), `${skillName} sollte entfernt sein`);
  }
  assert.ok(!fs.existsSync(path.join(legacyRoot, 'kurspilot-shared')));
});

test('cleanLegacyCodexSkills meldet Konflikt und loescht NICHT bei lokal veraendertem Alt-Ort-Skill', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const legacyRoot = path.join(makeTmpDir(), '.codex', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, legacyRoot);
  const modifiedFile = path.join(legacyRoot, 'kurspilot', 'SKILL.md');
  fs.writeFileSync(modifiedFile, 'Lokale Änderung am Alt-Ort\n');

  const result = cleanLegacyCodexSkills(legacyRoot);

  assert.deepStrictEqual(result.removed, []);
  assert.ok(result.conflicts.includes('kurspilot/SKILL.md'));
  assert.ok(result.warnings.length > 0);
  assert.strictEqual(fs.readFileSync(modifiedFile, 'utf8'), 'Lokale Änderung am Alt-Ort\n');
});

test('cleanLegacyCodexSkills laesst fremde Ordner am Alt-Ort unangetastet', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const legacyRoot = path.join(makeTmpDir(), '.codex', 'skills');

  installKurspilotSkillsForProvider(repoRoot, providerRoot, legacyRoot);
  const foreignDir = path.join(legacyRoot, 'mein-fremder-skill');
  fs.mkdirSync(foreignDir, { recursive: true });
  fs.writeFileSync(path.join(foreignDir, 'SKILL.md'), 'Fremder Inhalt');

  cleanLegacyCodexSkills(legacyRoot);

  assert.ok(fs.existsSync(path.join(foreignDir, 'SKILL.md')), 'fremder Ordner muss erhalten bleiben');
});

test('cleanLegacyCodexSkills ist No-Op ohne Manifest am Alt-Ort', () => {
  const legacyRoot = path.join(makeTmpDir(), '.codex', 'skills');
  fs.mkdirSync(path.join(legacyRoot, 'kurspilot'), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, 'kurspilot', 'SKILL.md'), 'Kein Manifest');

  const result = cleanLegacyCodexSkills(legacyRoot);

  assert.deepStrictEqual(result.removed, []);
  assert.deepStrictEqual(result.conflicts, []);
  assert.ok(fs.existsSync(path.join(legacyRoot, 'kurspilot', 'SKILL.md')), 'ohne Manifest kein Löschen');
});

test('CLI install-skills.js räumt unveraenderte Kurspilot-Ordner am Alt-Ort (~/.codex/skills) auf', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const tmpHome = makeTmpDir();
  const legacyRoot = path.join(tmpHome, '.codex', 'skills');

  // Alte Installation simulieren
  installKurspilotSkillsForProvider(repoRoot, providerRoot, legacyRoot);
  assert.ok(fs.existsSync(path.join(legacyRoot, 'kurspilot', 'SKILL.md')));

  // Neue Installation via CLI (realer Repo-Root, aber selbes tmpHome)
  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'codex'], { encoding: 'utf8' });

  // Kurspilot-Ordner am Alt-Ort müssen entfernt sein
  for (const skillName of SKILL_NAMES) {
    assert.ok(!fs.existsSync(path.join(legacyRoot, skillName)), `${skillName} am Alt-Ort sollte entfernt sein`);
  }
  assert.ok(!fs.existsSync(path.join(legacyRoot, 'kurspilot-shared')));
  // Neuer Ort hat die Skills
  assert.ok(fs.existsSync(path.join(tmpHome, '.agents', 'skills', 'kurspilot', 'SKILL.md')));
});

// --- Alias-Modus (Issue #163) -----------------------------------------------

test('installKurspilotSkillsAliasForClaude legt je Kurspilot-Ordner einen Symlink im Claude-Verzeichnis an', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const result = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);

  assert.strictEqual(result.aborted, false);
  assert.ok(result.written.length > 0, 'mindestens ein Alias angelegt');

  for (const dirName of ALIAS_DIRS) {
    const linkPath = path.join(claudeRoot, dirName);
    assert.ok(fs.existsSync(linkPath), `${dirName} muss im Claude-Verzeichnis vorhanden sein`);
    const stat = fs.lstatSync(linkPath);
    assert.ok(stat.isSymbolicLink(), `${dirName} muss ein Symlink sein`);
    assert.strictEqual(fs.readlinkSync(linkPath), path.join(canonicalRoot, dirName));
  }
});

test('installKurspilotSkillsAliasForClaude schreibt kein Manifest im Claude-Verzeichnis', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);

  // Manifest darf nur am kanonischen Ort liegen, nicht direkt im Claude-Verzeichnis
  const manifestInClaude = path.join(claudeRoot, 'kurspilot-shared', 'managed-skills.json');
  // Der Link zeigt auf kanonischen Ordner, deshalb ist die Datei via Link erreichbar –
  // entscheidend ist, dass kein eigenstaendiges Manifest als echte Datei existiert
  assert.ok(fs.existsSync(path.join(canonicalRoot, 'kurspilot-shared', 'managed-skills.json')), 'Manifest am kanonischen Ort');
  // Claude-Symlink-Verzeichnis selbst hat keine eigene Manifest-Datei (nur Link)
  const claudeSharedStat = fs.lstatSync(path.join(claudeRoot, 'kurspilot-shared'));
  assert.ok(claudeSharedStat.isSymbolicLink(), 'kurspilot-shared im Claude-Dir ist Symlink, keine echte Datei');
});

test('installKurspilotSkillsAliasForClaude ist idempotent', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const first = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);
  const second = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);

  assert.ok(first.written.length > 0, 'erster Lauf legt Aliase an');
  assert.strictEqual(second.written.length, 0, 'zweiter Lauf legt keine neuen Aliase an');
  assert.ok(second.unchanged.length > 0, 'zweiter Lauf meldet alles unveraendert');
});

test('installKurspilotSkillsAliasForClaude bricht bei echtem Ordner statt Alias ab (Konflikt-Flow)', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  // Alias durch echten Ordner ersetzen
  const realDir = path.join(claudeRoot, 'kurspilot');
  fs.mkdirSync(realDir, { recursive: true });
  fs.writeFileSync(path.join(realDir, 'SKILL.md'), 'Eigene Änderung\n');

  const result = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);

  assert.strictEqual(result.aborted, true);
  assert.ok(result.conflicts.includes('kurspilot'), 'kurspilot muss als Konflikt erkannt werden');
  assert.ok(result.warnings[0].includes('echten Ordner'));
  assert.ok(result.conflictPrompts.length > 0, 'Ausgliederungs-Prompt vorhanden');
  // Echter Ordner darf nicht überschrieben sein
  assert.strictEqual(fs.readFileSync(path.join(realDir, 'SKILL.md'), 'utf8'), 'Eigene Änderung\n');
});

test('Windows-Junction-Erzeugung ist injizierbar und per Fake-createLink testbar', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const calls = [];

  // Fake-createLink simuliert Windows-Junction-Erzeugung, erstellt aber echten Symlink
  const fakeWindowsCreateLink = (canonicalPath, linkPath) => {
    calls.push({ canonicalPath, linkPath });
    fs.symlinkSync(canonicalPath, linkPath, 'dir'); // funktioniert auf macOS/Linux
  };

  const result = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot, { createLink: fakeWindowsCreateLink });

  assert.strictEqual(result.aborted, false);
  assert.strictEqual(calls.length, ALIAS_DIRS.length, 'createLink einmal je Alias-Ordner aufgerufen');
  for (const { canonicalPath, linkPath } of calls) {
    assert.ok(canonicalPath.startsWith(canonicalRoot), 'Quelle zeigt auf kanonischen Ort');
    assert.ok(linkPath.startsWith(claudeRoot), 'Link liegt im Claude-Verzeichnis');
  }
});

test('installKurspilotSkillsAliasForClaude bricht bei fehlschlagendem createLink ab und empfiehlt Kopier-Modus', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  const failingCreateLink = () => { throw new Error('Kein Schreibzugriff (simuliert)'); };

  const result = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot, { createLink: failingCreateLink });

  assert.strictEqual(result.aborted, true);
  assert.strictEqual(result.aliasError, true);
  assert.ok(result.warnings[0].includes('getrennte Kopien'), 'Hinweis auf Kopier-Modus als Ausweg');
});

test('checkAliasIntegrity erkennt fehlenden Link als missing', () => {
  const tmpDir = makeTmpDir();
  assert.strictEqual(checkAliasIntegrity(path.join(tmpDir, 'nicht-da'), '/irgendwo'), 'missing');
});

test('checkAliasIntegrity erkennt echtes Verzeichnis als not-a-link', () => {
  const tmpDir = makeTmpDir();
  const realDir = path.join(tmpDir, 'echter-ordner');
  fs.mkdirSync(realDir);
  assert.strictEqual(checkAliasIntegrity(realDir, '/irgendwo'), 'not-a-link');
});

test('checkAliasIntegrity erkennt gueltigen Symlink als ok', () => {
  const tmpDir = makeTmpDir();
  const target = path.join(tmpDir, 'ziel');
  fs.mkdirSync(target);
  const link = path.join(tmpDir, 'link');
  fs.symlinkSync(target, link, 'dir');
  assert.strictEqual(checkAliasIntegrity(link, target), 'ok');
});

test('checkAliasIntegrity erkennt Symlink auf falsches Ziel als wrong-target', () => {
  const tmpDir = makeTmpDir();
  const target = path.join(tmpDir, 'ziel');
  const other = path.join(tmpDir, 'anderes-ziel');
  fs.mkdirSync(target);
  fs.mkdirSync(other);
  const link = path.join(tmpDir, 'link');
  fs.symlinkSync(other, link, 'dir');
  assert.strictEqual(checkAliasIntegrity(link, target), 'wrong-target');
});

test('CLI install-skills.js --alias legt Symlinks im Claude-Verzeichnis an', () => {
  const tmpHome = makeTmpDir();

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--alias'], { encoding: 'utf8' });

  const canonicalRoot = path.join(tmpHome, '.agents', 'skills');
  const claudeRoot = path.join(tmpHome, '.claude', 'skills');

  // Kanonische Ablage hat echte Dateien
  for (const skillName of SKILL_NAMES) {
    assert.ok(fs.existsSync(path.join(canonicalRoot, skillName, 'SKILL.md')));
  }
  // Claude-Verzeichnis hat Symlinks
  for (const dirName of ALIAS_DIRS) {
    const linkPath = path.join(claudeRoot, dirName);
    assert.ok(fs.lstatSync(linkPath).isSymbolicLink(), `${dirName} muss Symlink sein`);
    assert.strictEqual(fs.readlinkSync(linkPath), path.join(canonicalRoot, dirName));
  }
});

test('CLI install-skills.js meldet lokal veraenderte verwaltete Skills und bricht ab', () => {
  const tmpHome = makeTmpDir();
  const targetSkill = path.join(tmpHome, '.claude', 'skills', 'kurspilot', 'SKILL.md');

  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' });
  fs.writeFileSync(targetSkill, 'Lokale Aenderung\n');

  assert.throws(
    () => execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--client', 'claude'], { encoding: 'utf8' }),
    error => {
      assert.strictEqual(error.status, 1);
      assert.match(error.stderr.toString(), /lokal verändert/);
      return true;
    }
  );
  assert.strictEqual(fs.readFileSync(targetSkill, 'utf8'), 'Lokale Aenderung\n');
});

// --- Moduswechsel-Migration (Issue #164) ------------------------------------

// Kopie→Alias

test('installKurspilotSkillsAliasForClaude ersetzt unveraenderte Kopie automatisch durch Alias', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  // Kopie-Installation im Claude-Verzeichnis
  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, claudeRoot);
  // Sicherstellen: echte Verzeichnisse vorhanden
  for (const dirName of ALIAS_DIRS) {
    assert.ok(!fs.lstatSync(path.join(claudeRoot, dirName)).isSymbolicLink(), `${dirName} muss echter Ordner sein`);
  }

  // Moduswechsel zu Alias
  const result = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);

  assert.strictEqual(result.aborted, false);
  assert.ok(result.written.length > 0, 'mindestens ein Alias angelegt');
  for (const dirName of ALIAS_DIRS) {
    const linkPath = path.join(claudeRoot, dirName);
    assert.ok(fs.lstatSync(linkPath).isSymbolicLink(), `${dirName} muss jetzt Symlink sein`);
    assert.strictEqual(fs.readlinkSync(linkPath), path.join(canonicalRoot, dirName));
  }
});

test('installKurspilotSkillsAliasForClaude bricht bei veraenderter Kopie ab und bietet Ausgliederungs-Weg', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, claudeRoot);

  // Lokale Änderung in einem Kurspilot-Skill
  const modifiedFile = path.join(claudeRoot, 'kurspilot', 'SKILL.md');
  fs.writeFileSync(modifiedFile, 'Eigene Anpassung\n');

  const result = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);

  assert.strictEqual(result.aborted, true);
  assert.ok(result.conflicts.includes('kurspilot'), 'kurspilot als Konflikt erkannt');
  assert.ok(result.conflictPrompts.length > 0, 'Ausgliederungs-Prompt vorhanden');
  // Echter Ordner und lokale Änderung unberührt
  assert.ok(!fs.lstatSync(path.join(claudeRoot, 'kurspilot')).isSymbolicLink(), 'echter Ordner bleibt');
  assert.strictEqual(fs.readFileSync(modifiedFile, 'utf8'), 'Eigene Anpassung\n');
});

test('installKurspilotSkillsAliasForClaude Kopie→Alias ist idempotent', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);
  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, claudeRoot);

  const first = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);
  assert.strictEqual(first.aborted, false);
  assert.ok(first.written.length > 0);

  const second = installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);
  assert.strictEqual(second.aborted, false);
  assert.strictEqual(second.written.length, 0, 'zweiter Lauf: keine neuen Aliase');
  assert.ok(second.unchanged.length > 0, 'zweiter Lauf: alles unveraendert');
});

// Alias→Kopie

test('installKurspilotSkillsForProvider materialisiert echte Kopie statt Alias und legt eigenes Manifest an', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);

  // Alias-Installation
  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);
  assert.ok(fs.lstatSync(path.join(claudeRoot, 'kurspilot')).isSymbolicLink(), 'Vorbedingung: Symlink');

  // Moduswechsel zu Kopie
  const result = installKurspilotSkillsForProvider(repoRoot, providerRoot, claudeRoot);

  assert.strictEqual(result.aborted, false);
  assert.ok(result.written.length > 0, 'Dateien/Aliase als geändert gemeldet');

  for (const dirName of ALIAS_DIRS) {
    const dirPath = path.join(claudeRoot, dirName);
    assert.ok(!fs.lstatSync(dirPath).isSymbolicLink(), `${dirName} muss echter Ordner sein`);
  }
  // Eigenes Manifest im Claude-Verzeichnis
  const manifestPath = path.join(claudeRoot, 'kurspilot-shared', 'managed-skills.json');
  assert.ok(fs.existsSync(manifestPath), 'Manifest im Claude-Verzeichnis');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.managedBy, 'kurspilot');
  // Kurspilot-Adapter erreichbar als echte Dateien
  for (const skillName of SKILL_NAMES) {
    const skillFile = path.join(claudeRoot, skillName, 'SKILL.md');
    assert.ok(fs.existsSync(skillFile));
    assert.ok(!fs.lstatSync(skillFile).isSymbolicLink(), `${skillName}/SKILL.md muss echte Datei sein`);
  }
});

test('installKurspilotSkillsForProvider Alias→Kopie ist idempotent', () => {
  const { repoRoot, providerRoot } = makeSkillPackage();
  const canonicalRoot = path.join(makeTmpDir(), '.agents', 'skills');
  installKurspilotSkillsForProvider(repoRoot, providerRoot, canonicalRoot);
  const claudeRoot = path.join(makeTmpDir(), '.claude', 'skills');
  installKurspilotSkillsAliasForClaude(canonicalRoot, claudeRoot);

  const first = installKurspilotSkillsForProvider(repoRoot, providerRoot, claudeRoot);
  assert.strictEqual(first.aborted, false);

  const second = installKurspilotSkillsForProvider(repoRoot, providerRoot, claudeRoot);
  assert.strictEqual(second.aborted, false);
  assert.strictEqual(second.written.length, 0, 'zweiter Lauf: nichts geändert');
  assert.ok(second.unchanged.length > 0, 'zweiter Lauf: alles unveraendert');
});

// CLI-Tests für beide Richtungen gegen temporäres Home

test('CLI: Moduswechsel Kopie→Alias via --alias nach vorangegangenem Kopier-Lauf', () => {
  const tmpHome = makeTmpDir();

  // 1. Kopier-Modus
  execFileSync('node', [INSTALL_CLI, '--home', tmpHome], { encoding: 'utf8' });
  const claudeRoot = path.join(tmpHome, '.claude', 'skills');
  assert.ok(!fs.lstatSync(path.join(claudeRoot, 'kurspilot')).isSymbolicLink(), 'Vorbedingung: echter Ordner');

  // 2. Alias-Modus
  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--alias'], { encoding: 'utf8' });

  for (const dirName of ALIAS_DIRS) {
    assert.ok(fs.lstatSync(path.join(claudeRoot, dirName)).isSymbolicLink(), `${dirName} muss Symlink sein`);
  }
});

test('CLI: Moduswechsel Alias→Kopie via Kopier-Lauf nach vorangegangenem --alias', () => {
  const tmpHome = makeTmpDir();

  // 1. Alias-Modus
  execFileSync('node', [INSTALL_CLI, '--home', tmpHome, '--alias'], { encoding: 'utf8' });
  const claudeRoot = path.join(tmpHome, '.claude', 'skills');
  assert.ok(fs.lstatSync(path.join(claudeRoot, 'kurspilot')).isSymbolicLink(), 'Vorbedingung: Symlink');

  // 2. Kopier-Modus
  execFileSync('node', [INSTALL_CLI, '--home', tmpHome], { encoding: 'utf8' });

  for (const dirName of ALIAS_DIRS) {
    assert.ok(!fs.lstatSync(path.join(claudeRoot, dirName)).isSymbolicLink(), `${dirName} muss echter Ordner sein`);
  }
  assert.ok(fs.existsSync(path.join(claudeRoot, 'kurspilot-shared', 'managed-skills.json')), 'eigenes Manifest');
});
